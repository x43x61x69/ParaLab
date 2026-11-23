/* Released adults use native ghost records. The title list is selected by the
 * settings roster. Slots may be independently backed by the second six-field bank. */
#define RES_RECORD 0x4000u
#define RES_SPRITES 0x1D34u
#define RES_SIX_BANK 0xF04u
#define RES_SIX_MARK 0xF0Fu
#define RES_SIX_ROSTER 0xF64u
#define RES_SIX_LIMIT 0xF70u
#define RES_BANK_MAGIC 0x31425352u
#define RES_BANK_MARKS 0xFB7000u

struct ResidentLayout {
  u32 table, first;
  u16 roster;
  u8 count, index, per_field;
};
static const struct ResidentLayout residents_layouts[]={
  {0x94214u,0xDF2000u,0x1BCu,24,1,4},
  {0x9954Cu,0xDF2000u,0x1C0u,24,1,4},
  {0xACBB8u,0xDD2000u,0x1F8u,32,1,8},
  {0xAE954u,0xE52000u,0x20Cu,33,2,8}
};
static const struct ResidentLayout *resident_layout(void){
  const struct CareLayout *layout=care_layout();
  if(!layout) return 0;
  const struct ResidentLayout *d=&residents_layouts[layout-care_layouts];
  return rd32(d->table+d->index*4u)==0x60000000u+d->first?d:0;
}
static int resident_packed(const struct ResidentLayout *d){ return d->per_field==4u; }
static u32 resident_flag(u32 at,const struct ResidentLayout *d){
  if(resident_packed(d)) return (g_set[at]>>6)|((g_set[at+1u]&3u)<<2);
  return g_set[at+1u];
}
struct ResidentField {
  u32 roster, slots, flags, alias, start;
  u8 available, secondary;
};
static struct ResidentField resident_field(u32 field){
  const struct ResidentLayout *d=resident_layout();
  struct ResidentField f={0};
  if(!d) return f;
  int six=nfields()>3u, gen3=d==&residents_layouts[2];
  int bank=six && field>=3u, current=g_set[RES_SIX_BANK]==1u;
  u32 physical=bank && !gen3?1u:field%3u;
  int switches=six && (gen3 || physical==1u);
  int active=!switches || bank==current;
  int separate=six && gen3 && g_set[RES_SIX_MARK]==0x5Au;
  u32 stride=resident_packed(d)?8u:4u;
  f.roster=(active?d->roster:RES_SIX_ROSTER)+physical*stride;
  f.start=d->index+physical*d->per_field;
  f.available=active || separate;
  int private=gen3 && (g_cfg.flags&F_RESIDENT_BANKS) && rd32(0x109000u)==RES_BANK_MAGIC;
  f.secondary=private && bank;
  f.flags=f.available?resident_flag(f.roster,d):0;
  f.slots=4u;
  if(!resident_packed(d) && ((g_set[active?0x89u:RES_SIX_LIMIT]&(1u<<physical)) || (f.flags&0xF0u))) f.slots=8u;
  if(separate)
    f.alias=resident_flag((active?RES_SIX_ROSTER:d->roster)+physical*stride,d);
  return f;
}
static u32 resident_private(u32 rel){ return rel<14u?0xFB8000u+rel*RES_RECORD:0xD01000u+(rel-14u)*RES_RECORD; }
static u32 resident_mark_address(const struct ResidentField *f,u32 slot){ return RES_BANK_MARKS+(f->start+slot-1u)*4u; }
static int resident_mark(const struct ResidentField *f,u32 slot){
  u32 at=resident_mark_address(f,slot), old=rd32(at);
  if(old==RES_BANK_MAGIC) return 1;
  if((old&RES_BANK_MAGIC)!=RES_BANK_MAGIC) return 0;
#ifdef HOST
  flash_read(RES_BANK_MARKS,g_page,PAGE);
  for(u32 i=0;i<4u;i++) g_page[at-RES_BANK_MARKS+i]=(u8)(RES_BANK_MAGIC>>(8u*i));
  flash_prog4k(RES_BANK_MARKS,g_page);
#else
  flash_prog_word(at,RES_BANK_MAGIC);
#endif
  return rd32(at)==RES_BANK_MAGIC;
}
static u32 resident_address(const struct ResidentField *f,u32 slot){
  const struct ResidentLayout *d=resident_layout();
  if(!d || !f->available || slot>=f->slots) return 0;
  u32 i=f->start+slot, rel=i-d->index, addr=d->first+rel*RES_RECORD;
  if(rd32(d->table+i*4u)!=0x60000000u+addr || rd32(d->table+(d->count+i)*4u)!=RES_RECORD) return 0;
  if(f->secondary && rd32(resident_mark_address(f,slot))==RES_BANK_MAGIC) return resident_private(rel);
  return addr;
}
static u32 resident_valid(u32 addr){
  if(!addr || rd16(addr+0xFCu)!=5u || rd32(addr)+rd32(addr+4u)) return 0;
  u32 len=rd32(addr+0x10Cu), id=rd16(addr+0x10Au), sum=0;
  if(!id || id==0xFFFFu || len<RES_SPRITES || len>RES_RECORD || (len&3u)) return 0;
  for(u32 i=8u;i<len;i+=4u) sum+=rd32(addr+i);
  return sum==rd32(addr)?id:0;
}
static u32 resident_u16(const u8 *p){ return p[0]|((u32)p[1]<<8); }
static void resident_put16(u8 *p,u32 v){ p[0]=(u8)v; p[1]=(u8)(v>>8); }
static void resident_put32(u8 *p,u32 v){ resident_put16(p,v); resident_put16(p+2,v>>16); }
static void resident_seal(u32 len){
  u32 sum=0;
  for(u32 i=8u;i<len;i+=4u) sum+=resident_u16(g_spr+i)|((u32)resident_u16(g_spr+i+2u)<<16);
  resident_put32(g_spr,sum); resident_put32(g_spr+4u,0u-sum);
}
static int resident_write(u32 addr,u32 len,u32 id){
  for(u32 i=len;i<RES_RECORD;i++) g_spr[i]=0xFFu;
  /* Keep the checksum page until last. A partially written record fails the
   * native checksum and never appears as a different valid resident. */
  for(u32 n=4u;n;n--){
    u32 i=(n-1u)*PAGE;
    for(u32 j=0;j<PAGE;j++) g_page[j]=g_spr[i+j];
    flash_update4k(addr+i,g_page);
    if(!flash_same(addr+i,g_page,PAGE)) return 0;
  }
  return resident_valid(addr)==id;
}
static int resident_shared(const struct ResidentField *f,u32 slot){
  return !(g_cfg.flags&F_RESIDENT_BANKS) && (f->alias&(1u<<slot));
}
static int resident_preserve(const struct ResidentField *f,u32 slot,u32 addr){
  if(f->secondary || !(g_cfg.flags&F_RESIDENT_BANKS) || !(f->alias&(1u<<slot)) ||
     rd32(resident_mark_address(f,slot))==RES_BANK_MAGIC) return 1;
  u32 id=resident_valid(addr);
  if(!id) return 0;
  u32 len=rd32(addr+0x10Cu);
  flash_read(addr,g_spr,len);
  return resident_write(resident_private(f->start+slot-1u),len,id) && resident_mark(f,slot);
}
static u32 resident_destination(const struct ResidentField *f,u32 slot,u32 addr){
  return f->secondary?resident_private(f->start+slot-1u):addr;
}
#define RES_CATALOG_MAGIC 0x31435352u
#define RES_CATALOG_ROW 0x104u
static u32 resident_catalog(void){
  u32 at=tp_header();
  if(!at) return 0;
  at+=24u+72u*rd32(at+12u);
  if(at>0xFFFFFFu-16u || rd32(at)!=RES_CATALOG_MAGIC || rd32(at+8u)!=RES_CATALOG_ROW ||
     rd32(at+12u)!=rd32(0x111004u)) return 0;
  u32 n=rd32(at+4u);
  return n && n<=256u && at+16u+n*RES_CATALOG_ROW<=0x1000000u?at:0;
}
static u32 resident_template(u32 cat,u32 id){
  if(!cat) return 0;
  for(u32 i=0,n=rd32(cat+4u);i<n;i++){
    u32 at=cat+16u+i*RES_CATALOG_ROW;
    if(rd16(at)==id) return at;
  }
  return 0;
}
static int resident_asset(u32 at,u32 n){
  u32 end=0x111010u+rd32(0x111008u);
  return end<=g_cfg.id_page && at>=0x111000u && at<=end && n<=end-at;
}
static int resident_pose(u8 *out,u32 frame,const u16 *sprites,u32 first){
  u32 at=frame&0xFFFFFFu, n=frame>>24;
  if(!n) return 1;
  if(n>16u || (at&1u)) return 0;
  for(u32 i=0;i<n;i++){
    if(!resident_asset(at,2u)) return 0;
    u32 mask=rd16(at), x=0,y=0,sub=0,scale=64,type=0,img=0xFFFFu;
    at+=2u;
    if(mask&0xF800u) return 0;
    for(u32 j=0;j<=10u;j++){
      if(!(mask&(1u<<j))) continue;
      if(!resident_asset(at,2u)) return 0;
      u32 v=rd16(at); at+=2u;
      switch(j){
        case 0: x=v; break; case 1: y=v; break; case 2: sub=v; break;
        case 6: scale=v; break; case 9: type=v; break; case 10: img=v; break;
      }
    }
    u32 slot=type==17u?4u:3u;
    for(u32 j=0;j<3u;j++) if(img==sprites[first+j]){ img=first+j; slot=j; break; }
    u8 *p=out+22u*slot;
    if(p[7]) continue;
    resident_put16(p,img); resident_put16(p+2u,x); resident_put16(p+4u,y);
    resident_put16(p+6u,0x1000u); resident_put16(p+10u,scale);
    resident_put16(p+12u,sub); resident_put16(p+20u,type);
  }
  return 1;
}
static int resident_eye_compatible(u32 source,u32 donor){
  if(!resident_asset(source,24u) || !resident_asset(donor,24u)) return 0;
  const volatile u8 *a=fl(source),*b=fl(donor);
  return a[8]*a[12]==b[8]*b[12] && a[9]*a[13]==b[9]*b[13] &&
    a[12] && a[13] && b[12] && b[13] &&
    rd16(source+6u)*b[12]*b[13]<=rd16(donor+6u)*a[12]*a[13];
}
static u32 resident_build(u32 body,u32 eyes,u32 color){
  u32 cat=resident_catalog(), b=resident_template(cat,body), e=resident_template(cat,eyes);
  if(!b || !e) return 0;
  u32 tint=0;
  if(color<16u){
    tint=tp_header();
    if(!tp_load(rd32(tint+16u),512u,rd16(tint+20u))) return 0;
  }
  for(u32 i=0;i<RES_SPRITES;i++) g_spr[i]=0;
  resident_put32(g_spr+8u,1);
  resident_put16(g_spr+0xCu,4017u); resident_put16(g_spr+0xEu,eyes);
  g_spr[0x10u]=(u8)(color<16u?color:0xFFu);
  resident_put16(g_spr+0xFCu,5u);
  for(u32 i=0;i<3u;i++) resident_put16(g_spr+0xFEu+i*2u,rd16(b+2u+i*2u));
  resident_put16(g_spr+0x10Au,body);
  for(u32 lang=0;lang<9u;lang++){
    u32 a=rd32(b+0xE0u+4u*lang);
    for(u32 i=0;i<12u && !(a&1u) && resident_asset(a+2u*i,2u);i++){
      u32 v=rd16(a+2u*i);
      if(!v) break;
      resident_put16(g_spr+0x12u+26u*lang+2u*i,v);
    }
  }
  u16 sprites[6];
  for(u32 i=0;i<6u;i++) sprites[i]=(u16)rd16(b+0x20u+2u*i);
  for(u32 i=0;i<44u;i++){
    u32 pose=i+(i<20u?1u:10u);
    if(!resident_pose(g_spr+0x600u+110u*pose,rd32(b+0x30u+4u*i),sprites,i<20u?0u:3u)) return 0;
  }
  u32 end=RES_SPRITES;
  for(u32 i=0;i<2u;i++){
    u32 a=rd32(e+8u+i*8u), len=rd32(e+12u+i*8u), palette=rd32(b+0x18u+4u*i);
    if((a|len)&3u || len<24u || len>RES_RECORD-end || !resident_asset(a,len) ||
       !resident_asset(palette,32u) || (palette&1u) ||
       !resident_eye_compatible(rd32(b+8u+i*8u),a)) return 0;
    u32 at=0x118u+i*24u;
    resident_put32(g_spr+at,end); resident_put32(g_spr+at+4u,len);
    for(u32 j=0;j<len;j++) g_spr[end+j]=fl(a+j)[0];
    for(u32 j=0;j<32u;j+=2u){
      u32 c=rd16(palette+j);
      if(tint && c && j>=4u && j<=14u) c=pr16(color*32u+j);
      resident_put16(g_spr+0x140u+i*32u+j,c);
    }
    end+=len;
  }
  resident_put32(g_spr+0x10Cu,end);
  resident_seal(end);
  return end;
}
static void resident_set_slot(const struct ResidentField *f,u32 slot,int occupied){
  const struct ResidentLayout *d=resident_layout();
  u8 *p=g_set+f->roster;
  u32 bits=occupied?f->flags|(1u<<slot):f->flags&~(1u<<slot);
  u32 last=resident_packed(d)?(p[0]>>3)&7u:p[0]>>4;
  /* Neon advances through all eight physical slots before expansion. */
  u32 capacity=(g_cfg.flags&F_NEON_EDIT)?8u:f->slots;
  u32 next=occupied?(slot+1u)%capacity:slot;
  if(occupied) last=slot;
  else if(last==slot){
    last=0;
    for(u32 n=1;n<f->slots;n++){
      u32 x=(slot+f->slots-n)%f->slots;
      if(bits&(1u<<x)){ last=x; break; }
    }
  }else next=resident_packed(d)?p[0]&7u:p[0]&15u;
  if(resident_packed(d)){
    p[0]=(u8)((bits<<6)|(last<<3)|next);
    p[1]=(u8)((p[1]&~3u)|(bits>>2));
  }else{
    p[0]=(u8)((last<<4)|next); p[1]=(u8)bits;
    p[2]&=(u8)~(1u<<slot);
  }
}
static void resident_name(u32 id,char *name){
  int k=cat_find(id);
  if(k>=0) chr_name((u32)k,name); else utoa_(id,name);
}
static u32 g_resident_field;
static const char *resident_field_name(u32 i){
  static const char *const neon[]={"COSMIC","NEW TAMA","TAMA PLANET"};
  return g_cfg.flags&F_NEON_EDIT?neon[i]:fname(i);
}
static int resident_field_row(u32 i,char *name,char *right,u16 *color){
  struct ResidentField f=resident_field(i);
  care_label(name,resident_field_name(i));
  if(!f.available) care_label(right,"SWITCH");
  else {
    u32 n=0;
    for(u32 j=0;j<f.slots;j++) n+=(f.flags>>j)&1u;
    utoa_(n,right); right[1]='/'; utoa_(f.slots,right+2);
    *color=fcol(i);
  }
  return 1;
}
static int resident_slot_row(u32 i,char *name,char *right,u16 *color){
  struct ResidentField f=resident_field(g_resident_field);
  care_label(name,"SLOT "); utoa_(i+1u,name+5);
  u32 id=0;
  if(f.flags&(1u<<i)) id=resident_valid(resident_address(&f,i));
  if(id){
    char label[24]; resident_name(id,label);
    for(u32 j=0;j<7u;j++){ right[j]=label[j]; if(!label[j]) break; }
    right[7]=0; *color=chr_color(id,WHITE);
  }else care_label(right,f.flags&(1u<<i)?"RECORD?":resident_shared(&f,i)?"SHARED":"EMPTY");
  return 1;
}
static u32 resident_color(u32 addr){ u32 c=fl(addr+0x10u)[0]; return c<16u?c:16u; }
static void resident_detail_labels(u32 id,u32 eyes){
  char body[24],eye[24];
  resident_name(id,body); resident_name(eyes,eye);
  appearance_review_labels(body,chr_color(id,WHITE),eye,chr_color(eyes,WHITE));
}
static int resident_selectable(u32 candidate,u32 owner){
  u32 cat=resident_catalog(), row=resident_template(cat,candidate);
  if(!row) return 0;
  u32 a=rd32(row+12u), b=rd32(row+20u);
  if(a>RES_RECORD-RES_SPRITES || b>RES_RECORD-RES_SPRITES-a) return 0;
  if(!owner || owner==candidate) return 1;
  u32 target=resident_template(cat,owner);
  return target && resident_eye_compatible(rd32(target+8u),rd32(row+8u)) &&
    resident_eye_compatible(rd32(target+16u),rd32(row+16u));
}
static void resident_appearance(const struct ResidentField *f,u32 slot,u32 addr,u32 id,u32 eyes,int occupied){
  u32 body=id, color=id?resident_color(addr):16u, step=0;
  int new_star=!f && !occupied;
  if(!resident_catalog()){ message("CATALOG UNAVAILABLE","UPDATE MENU DATA",""); return; }
  for(;;){
    if(step<2u){
      if(appearance_character(step==1u,resident_selectable,&body,&eyes,color)) step++;
      else if(step) step--; else return;
      continue;
    }
    rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG);
    if(step==2u){ menu_title(2,"3/3 BODY COLOR"); ctext(15,t_color_name(color),GOLD,1); }
    else resident_detail_labels(body,eyes);
    tama_preview(body,eyes,color);
    appearance_footer(step==2u?"WHEEL / A: COLOR":t_color_name(color),GOLD,body==eyes,step==3u?(new_star?-1:1):0);
    int k=menu_key();
    if(k==K_BACK){ step--; continue; }
    if(step==2u && (k==1 || k==K_A)){ color=wrap_step(color,k==K_A?1:g_step,0,16); continue; }
    if(k!=K_OK) continue;
    if(step==2u){ step++; continue; }
    u32 details=new_star?star_create_details():0;
    if(new_star && !details) continue;
    if(f && !resident_preserve(f,slot,addr)){ message("SHARED RECORD","COULD NOT COPY",""); return; }
    u32 len=resident_build(body,eyes,color);
    if(!len){ message("INVALID APPEARANCE","CHECK ROM CATALOG",""); return; }
    if(!resident_write(f?resident_destination(f,slot,addr):addr,len,body) || (f && f->secondary && !resident_mark(f,slot))){
      message("WRITE FAILED","CHECK RESIDENT","AND TRY AGAIN"); return;
    }
    if(!f){
      if(new_star){
        star_write(slot,details);
        u8 *index=g_set+care_layout()->stars-4u;
        *index=(u8)((*index&~7u)|((slot+1u)%5u));
      }
      set_write("STAR SAVED");
    }else{
      if(!occupied){ resident_set_slot(f,slot,1); set_commit(); }
      done_screen("RESIDENT SAVED",GOLD);
    }
    return;
  }
}
static u32 star_snapshot_address(u32 slot){
  const struct ResidentLayout *d=resident_layout();
  if(!d || slot>=5u) return 0;
  /* The native table ends with five memorials and two connection records. */
  u32 index=d->count-7u+slot, entry=d->table+4u*index;
  u32 addr=d->first+(index-d->index)*RES_RECORD;
  return rd32(entry)==0x60000000u+addr && rd32(entry+4u*d->count)==RES_RECORD?addr:0;
}
static void star_appearance(u32 slot){
  u32 addr=star_snapshot_address(slot);
  if(!addr){ message("SAVE FORMAT","UNKNOWN",""); return; }
  int occupied=(star_word(slot)&1u)!=0;
  u32 body=occupied?resident_valid(addr):0, eyes=body?rd16(addr+0xEu):0;
  resident_appearance(0,slot,addr,body,eyes,occupied);
}
/* Keep the old record until the new planet/slot and source removal have
 * been committed together in the rolling Neon settings page. */
static void neon_resident_move(const struct ResidentField *from,u32 slot,u32 src){
  u32 planet=g_resident_field;
  int target=care_choose("DESTINATION",3,planet,resident_field_row);
  if(target<0) return;
  struct ResidentField to=resident_field((u32)target);
  g_resident_field=(u32)target;
  int dest=care_choose("CHOOSE EMPTY SLOT",to.slots,0,resident_slot_row);
  g_resident_field=planet;
  if(dest<0) return;
  u32 dst=resident_address(&to,(u32)dest), id=resident_valid(src);
  if(!dst || (to.flags&(1u<<dest))){
    message("CHOOSE AN EMPTY SLOT","",""); return;
  }
  if(!id || !care_confirm("MOVE RESIDENT?",resident_field_name((u32)target))) return;
  u32 len=rd32(src+0x10Cu);
  flash_read(src,g_spr,len);
  if(!resident_write(dst,len,id)){ message("COPY FAILED","RESIDENT KEPT",""); return; }
  resident_set_slot(from,slot,0);
  to=resident_field((u32)target);
  resident_set_slot(&to,(u32)dest,1);
  set_write("RESIDENT MOVED");
}

static void resident_detail(struct ResidentField *f,u32 slot){
  u32 addr=resident_address(f,slot), id=0, eyes=0;
  if(!addr) return;
  int occupied=(f->flags&(1u<<slot))!=0, shared=resident_shared(f,slot);
  if(occupied){
    id=resident_valid(addr); eyes=rd16(addr+0xEu);
    if(!eyes || eyes==0xFFFFu) eyes=id;
  }
  for(;;){
    rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG);
    if(id){
      resident_detail_labels(id,eyes);
      tama_preview(id,eyes,resident_color(addr));
    }else{
      menu_title(2,"FIELD RESIDENT");
      ctext(54,occupied?"RECORD UNREADABLE":"EMPTY",WHITE,1);
    }
    int move=id && (g_cfg.flags&F_NEON_EDIT);
    if(move) ctext(92,"TURN WHEEL TO MOVE",GREY,1);
    ctext(103,!shared && resident_catalog()?"B EDIT  C BACK":"C BACK",GREY,1);
    if(occupied) ctext(117,shared?"A REMOVE FROM FIELD":"A REMOVE",ORANGE,1);
    show(); wait_release();
    int k=menu_key();
    if(k==K_BACK) return;
    if(k==1 && move){ neon_resident_move(f,slot,addr); return; }
    if(k==K_OK && !shared){ resident_appearance(f,slot,addr,id,eyes,occupied); return; }
    if(k==K_A && occupied && care_confirm("REMOVE RESIDENT?","FROM THIS FIELD")){
      if(!resident_preserve(f,slot,addr)){ message("SHARED RECORD","COULD NOT COPY",""); return; }
      resident_set_slot(f,slot,0);
      set_commit();
      if(!shared && (!f->secondary || addr==resident_destination(f,slot,addr)))
        for(u32 i=0;i<RES_RECORD;i+=PAGE) erase_page(addr+i);
      done_screen("RESIDENT REMOVED",GOLD); return;
    }
  }
}
static void residents_menu(void){
  int neon=(g_cfg.flags&F_NEON_EDIT)!=0;
  u32 count=neon?3u:nfields(), field=neon?g_set[0x207u]:0;
  if(field>=count) field=0;
  if(!resident_layout()) return;
  for(;;){
    int next=care_choose(neon?"PLANET RESIDENTS":"FIELD RESIDENTS",count,field,resident_field_row);
    if(next<0) return;
    field=(u32)next; g_resident_field=field;
    struct ResidentField f=resident_field(field);
    if(!f.available){ message("SWITCH FIELDS","OPEN MENU AGAIN",""); continue; }
    u32 slot=0;
    for(;;){
      f=resident_field(field);
      int choice=care_choose(resident_field_name(field),f.slots,slot<f.slots?slot:0,resident_slot_row);
      if(choice<0) break;
      slot=(u32)choice; resident_detail(&f,slot);
    }
  }
}
