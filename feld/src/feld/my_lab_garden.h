/* Garden slots contain self-contained adult ghosts, including the six
 * sprite sheets and composite poses at both zoom levels. */
#define LG_SLOTS 6u
#define LG_FIRST 0xD19000u
#define LG_SIZE 0x1B000u
#define LG_POSES 0x600u
#define LG_HEADER 0x1D34u
#define LG_CATALOG 0xE00000u
#define LG_STAGE 0xFD0000u
#define LG_JOURNAL (LG_STAGE+LG_SIZE)
#define LG_CATALOG_MAGIC 0x43474C4Du
#define LG_JOURNAL_MAGIC 0x4A474C4Du
#define LG_INDEX 28u
#define LG_ROW (LG_HEADER+6u*8u)
#define LG_CHARACTERS 173u
#define LG_CURRENT 17u

typedef struct {
  u32 slot, source, header, body, eyes, end;
  u32 part[6], size[6], start[6];
  u16 palettes[2][16];
  u8 color;
} LabGardenLook;

static u32 lab_garden_palette;
static u32 lab_garden_choices[LG_CHARACTERS+1u];
static u8 lab_garden_ready[LG_SLOTS];

static u32 lab_garden_addr(u32 slot){ return LG_FIRST+slot*LG_SIZE; }
static u32 lab_garden_row_addr(u32 row){ return LG_CATALOG+LG_INDEX+LG_ROW*row; }
static u32 lab_garden_eye_id(u32 header){
  u32 id=rd16(header+0x0eu);
  return !id || id==0xFFFFu?rd16(header+0x10au):id;
}
static u32 lab_garden_sum(u32 address,u32 size){
  u32 sum=0;
  for(u32 off=8;off<size;off+=4){
    if(!(off&0xFFFu)) hw_wdt_feed();
    sum+=rd32(address+off);
  }
  return sum;
}
static int lab_garden_valid(u32 address){
  u32 end=rd32(address+0x10c);
  if(end<LG_HEADER || end>LG_SIZE || (end&3) || (rd32(address+8)&3) ||
     rd16(address+0xfc)!=5 || !rd16(address+0x10a) || rd32(address)+rd32(address+4)!=0) return 0;
  u32 next=LG_HEADER;
  for(u32 i=0;i<6;i++){
    u32 at=address+0x110u+8*i, off=rd32(at), len=rd32(at+4);
    if(off!=next || len<24u || (len&3u) || len>end-next) return 0;
    next+=len;
  }
  return next==end && lab_garden_sum(address,end)==rd32(address);
}
static int lab_garden_catalog(void){
  if(rd32(LG_CATALOG)!=LG_CATALOG_MAGIC || rd32(LG_CATALOG+4)!=1 ||
     rd32(LG_CATALOG+8)!=LG_CHARACTERS || rd32(LG_CATALOG+12)!=LG_ROW ||
     rd32(LG_CATALOG+24)!=rd32(LAB_ASSETS+4)) return 0;
  u32 palette=rd32(LG_CATALOG+16);
  if(palette<LAB_ASSETS || palette>0xA6B000u-512u || (palette&1)) return 0;
  lab_garden_palette=palette;
  return 1;
}
static int lab_garden_sprite(u32 address,u32 len){
  if(len<24 || fl(address+5)[0]!=2) return 0;
  u32 pal=rd16(address+18), pixels=rd16(address+20);
  return pal>=24 && pal+32<=pixels && pixels<len;
}
static int lab_garden_parts(u32 header,int catalog,u32 *addresses,u32 *sizes){
  for(u32 i=0;i<6;i++){
    u32 field=header+(catalog?LG_HEADER:0x110u)+i*8u;
    u32 at=rd32(field), len=rd32(field+4);
    if(catalog){
      if(at<LAB_ASSETS || at>=0xA6B000u || len>0xA6B000u-at) return 0;
    } else {
      if(at<LG_HEADER || at>=LG_SIZE || len>LG_SIZE-at) return 0;
      at+=header;
    }
    if(!lab_garden_sprite(at,len)) return 0;
    addresses[i]=at;
    sizes[i]=len;
  }
  return 1;
}
static u32 lab_garden_frames(u32 sprite){
  u32 cells=(u32)fl(sprite+12)[0]*fl(sprite+13)[0];
  return cells?rd16(sprite+6)/cells:0;
}
static int lab_garden_eyes_fit(u32 header,const u32 *original,const u32 *candidate){
  for(u32 part=1;part<6;part+=3){
    u32 from=original[part], to=candidate[part];
    if(rd16(from+8)!=rd16(to+8) || rd16(from+12)!=rd16(to+12)) return 0;
    u32 frames=lab_garden_frames(to);
    if(!frames) return 0;
    u32 first=part==1?0u:30u, end=part==1?30u:54u;
    for(u32 p=first;p<end;p++){
      u32 layer=header+LG_POSES+p*110u+22u;
      if(rd16(layer)==part && rd16(layer+6) && rd16(layer+12)>=frames) return 0;
    }
  }
  return 1;
}
static int lab_garden_prepare(LabGardenLook *look){
  look->header=look->body?look->body:look->source;
  if(!lab_garden_parts(look->header,look->body!=0,look->part,look->size)) return 0;
  if(look->eyes){
    u32 parts[6], sizes[6];
    if(!lab_garden_parts(look->eyes,1,parts,sizes) ||
       !lab_garden_eyes_fit(look->header,look->part,parts)) return 0;
    for(u32 i=1;i<6;i+=3){ look->part[i]=parts[i]; look->size[i]=sizes[i]; }
  }
  u32 end=LG_HEADER;
  for(u32 i=0;i<6;i++){
    look->start[i]=end;
    end+=(look->size[i]+3u)&~3u;
  }
  if(end>LG_SIZE) return 0;
  look->end=end;
  for(u32 i=0;i<2;i++){
    u32 part=look->part[2*i];
    u32 palette=look->color==LG_CURRENT && !look->body ? look->source+0x140u+32u*i : part+rd16(part+18);
    u32 color=look->color==LG_CURRENT ? fl(look->source+0x10u)[0] : look->color;
    for(u32 c=0;c<16;c++){
      u16 value=(u16)rd16(palette+c*2);
      if(value && c>=2 && c<=7 && color<16 && palette!=look->source+0x140u+32u*i)
        value=(u16)rd16(lab_garden_palette+32*color+2*c);
      look->palettes[i][c]=value;
    }
  }
  return 1;
}
static void lab_garden_name(u32 ghost,char *out){
  u32 n=0;
  for(;n<12;n++){
    u32 code=rd16(ghost+0x2cu+2*n);
    if(!code) break;
    out[n]=lab_glyph(code);
  }
  while(n && out[n-1]==' ') n--;
  out[n]=0;
  if(!n){ out[0]='#'; utoa_(rd16(ghost+0x10a),out+1); }
}

static int lab_garden_cell(u32 sprite,u32 length,u32 cell){
  u32 count=rd16(sprite+6), pixels=rd16(sprite+20), flags=fl(sprite+4)[0];
  u32 w=fl(sprite+8)[0], h=fl(sprite+9)[0], raw=(w*h+1u)/2u, start,n;
  if(cell>=count || !raw || w>64 || h>64 || raw>sizeof(g_spr) || pixels>=length ||
     (flags&8u)) return 0;
  if(flags&0x60u){
    u32 field=pixels+8u*cell;
    if(field+8>length) return 0;
    u32 pointer=rd32(sprite+field);
    if((pointer&0x7FFFFFFFu)>length-pixels) return 0;
    start=pixels+(pointer&0x7FFFFFFFu);
    if(pointer>>31){ n=raw; flags&=~0x60u; }
    else n=rd32(sprite+field+4);
  } else { start=pixels+raw*cell; n=raw; }
  if(start>length || n>length-start || n>PIC_MAX) return 0;
  flash_read(sprite+start,g_pic,n);
  return tp_decode(n,raw,flags);
}
static int lab_garden_preview(const LabGardenLook *look){
  const u32 pose=look->header+LG_POSES+110u;
  const u32 body=look->part[0];
  u32 body_width=(u32)fl(body+8)[0]*fl(body+12)[0];
  u32 body_height=(u32)fl(look->part[0]+9)[0]*fl(look->part[0]+13)[0];
  int anchor_x=(FELD_SCREEN_W-(int)body_width)/2-(int)(signed char)fl(body+10)[0]-tp_signed(pose+2);
  int anchor_y=33+(64-(int)body_height)/2-(int)(signed char)fl(body+11)[0]-tp_signed(pose+4);
  for(u32 i=0;i<3;i++){
    u32 layer=pose+i*22u, sprite=look->part[i];
    if(rd16(layer)!=i || !rd16(layer+6)){ if(i==0) return 0; continue; }
    u32 w=fl(sprite+8)[0], h=fl(sprite+9)[0], cols=fl(sprite+12)[0], rows=fl(sprite+13)[0];
    if(!w || !h || !cols || !rows || cols*rows>16u || w*cols>96u || h*rows>96u) return 0;
    int x=anchor_x+(int)(signed char)fl(sprite+10)[0]+tp_signed(layer+2);
    int y=anchor_y+(int)(signed char)fl(sprite+11)[0]+tp_signed(layer+4)
      +((int)body_height-(int)(h*rows))/2;
    u32 first=rd16(layer+12)*cols*rows, transparent=rd16(sprite+16);
    u32 palette=sprite+rd16(sprite+18);
    for(u32 cell=0;cell<cols*rows;cell++){
      if(!lab_garden_cell(sprite,look->size[i],first+cell)) return 0;
      int dx=x+(int)(cell%cols*w), dy=y+(int)(cell/cols*h);
      for(u32 py=0;py<h;py++) for(u32 px=0;px<w;px++){
        u32 pixel=py*w+px, color=(g_spr[pixel>>1]>>((pixel&1u)*4u))&15u;
        int fx=dx+(int)px, fy=dy+(int)py;
        if(fy>=27 && fy<100 && (color!=transparent || !(fl(sprite+4)[0]&4)))
          rect(fx,fy,fx+1,fy+1,i==1?(u16)rd16(palette+2u*color):look->palettes[i/2][color]);
      }
    }
  }
  return 1;
}

static void lab_garden_overlay(u32 page,u32 offset,u32 length,u32 source){
  if(offset>=page+PAGE || offset+length<=page) return;
  u32 from=offset>page?offset:page, to=offset+length;
  if(to>page+PAGE) to=page+PAGE;
  if(source) flash_read(source+from-offset,g_page+(from-page),to-from);
  else for(u32 i=from;i<to;i++) g_page[i-page]=0;
}
static void lab_garden_page(const LabGardenLook *look,u32 offset){
  flash_read(look->source+offset,g_page,PAGE);
  lab_garden_overlay(offset,0,LG_HEADER,look->header);
  if(!offset){
    // Keep the resident record's origin and opaque per-slot header fields.
    flash_read(look->source+8,g_page+8,4);
    flash_read(look->source+0x104u,g_page+0x104u,6);
    flash_read(look->source+0x180u,g_page+0x180u,LG_POSES-0x180u);
    if(look->color!=LG_CURRENT) g_page[0x10]=look->color==16?0xFF:look->color;
    else g_page[0x10]=fl(look->source+0x10u)[0];
    if(look->eyes){
      u32 id=rd16(look->eyes+0x10a);
      g_page[0x0e]=(u8)id;
      g_page[0x0f]=(u8)(id>>8);
    }
    sl_w32(g_page+0x10c,look->end);
    for(u32 i=0;i<6;i++){
      sl_w32(g_page+0x110u+8*i,look->start[i]);
      sl_w32(g_page+0x114u+8*i,(look->size[i]+3u)&~3u);
    }
    for(u32 i=0;i<2;i++) for(u32 c=0;c<16;c++){
      u32 at=0x140u+i*32u+2*c, color=look->palettes[i][c];
      g_page[at]=(u8)color;
      g_page[at+1]=(u8)(color>>8);
    }
  }
  for(u32 i=0;i<6;i++){
    u32 len=look->size[i], at=look->start[i];
    lab_garden_overlay(offset,at,len,look->part[i]);
    lab_garden_overlay(offset,at+len,((len+3u)&~3u)-len,0);
  }
}
static int lab_garden_copy_page(u32 address,const u8 *page){
  flash_update4k(address,page);
  return flash_same(address,page,PAGE);
}
static int lab_garden_recover(void){
  if(rd32(LG_JOURNAL+4)!=LG_JOURNAL_MAGIC) return 1;
  flash_read(LG_JOURNAL,g_page,PAGE);
  if(!set_ok(g_page)) return 1; // The destination is written only after the journal verifies.
  u32 slot=sl_r32(g_page+8), old=sl_r32(g_page+12), expected=sl_r32(g_page+16);
  if(slot>=LG_SLOTS || rd32(LG_STAGE)!=expected || !lab_garden_valid(LG_STAGE)) return 0;
  u32 address=lab_garden_addr(slot);
  int valid=lab_garden_valid(address);
  u32 current=rd32(address);
  if(!valid || current==old){
    // Commit the new header last. A reset can replay from the verified staging record.
    u32 end=rd32(LG_STAGE+0x10cu);
    for(u32 offset=PAGE;offset<end;offset+=PAGE){
      flash_read(LG_STAGE+offset,g_page,PAGE);
      if(!lab_garden_copy_page(address+offset,g_page)) return 0;
    }
    flash_read(LG_STAGE,g_page,PAGE);
    if(!lab_garden_copy_page(address,g_page) || !lab_garden_valid(address)) return 0;
    current=rd32(address);
  }
  if(!lab_garden_copy_page(LG_JOURNAL,g_ff)) return 0;
  return current==expected ? 1 : 2;
}
static int lab_garden_commit(const LabGardenLook *look){
  rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG);
  ctext(44,"SAVING GARDEN SLOT",WHITE,1);
  ctext(59,"DO NOT SWITCH OFF",GREY,1);
  show();
  u32 sum=0;
  for(u32 offset=0;offset<look->end;offset+=PAGE){
    lab_garden_page(look,offset);
    u32 end=look->end-offset<PAGE?look->end-offset:PAGE;
    for(u32 i=offset?0u:8u;i<end;i+=4) sum+=sl_r32(g_page+i);
    if(!offset){ for(u32 i=0;i<PAGE;i++) g_out[i]=g_page[i]; }
    else if(!lab_garden_copy_page(LG_STAGE+offset,g_page)) return 0;
  }
  sl_w32(g_out,sum);
  sl_w32(g_out+4,0u-sum);
  if(!lab_garden_copy_page(LG_STAGE,g_out) || !lab_garden_valid(LG_STAGE)) return 0;
  for(u32 i=0;i<PAGE;i++) g_page[i]=0;
  sl_w32(g_page+4,LG_JOURNAL_MAGIC);
  sl_w32(g_page+8,look->slot);
  sl_w32(g_page+12,rd32(look->source));
  sl_w32(g_page+16,sum);
  stamp(g_page);
  return lab_garden_copy_page(LG_JOURNAL,g_page) && lab_garden_recover()==1;
}

static int lab_garden_slot_row(u32 i,char *name,char *right,u16 *color){
  if(lab_garden_ready[i]==1){
    lab_garden_name(lab_garden_addr(i),name);
  } else {
    lab_copy_label(name,lab_garden_ready[i]==0?"EMPTY":"UNREADABLE");
    *color=GREY;
  }
  lab_copy_label(right,"SLOT ");
  right[5]=(char)('1'+i);
  right[6]=0;
  return 1;
}
static int lab_garden_candidate(int eyes,LabGardenLook *look){
  u32 count=0, cursor=LG_CHARACTERS+1u, original=cursor;
  u32 id=eyes?lab_garden_eye_id(look->header):rd16(look->source+0x10au);
  u32 current=eyes?look->eyes:look->body;
  for(u32 i=0;i<LG_CHARACTERS;i++){
    u32 candidate=lab_garden_row_addr(i);
    if(eyes){
      u32 parts[6], sizes[6];
      if(!lab_garden_parts(candidate,1,parts,sizes) ||
         !lab_garden_eyes_fit(look->header,look->part,parts)) continue;
    }
    if(candidate==current) cursor=count;
    if(original>LG_CHARACTERS && rd16(candidate+0x10au)==id) original=count;
    lab_garden_choices[count++]=candidate;
  }
  if(original>LG_CHARACTERS){
    original=count;
    lab_garden_choices[count++]=0;
  }
  if(cursor>=count) cursor=original;

  for(;;){
    LabGardenLook draft=*look;
    u32 entry=lab_garden_choices[cursor];
    u32 selected=cursor==original?0:entry;
    if(eyes) draft.eyes=selected;
    else draft.body=selected;
    int ready=lab_garden_prepare(&draft);
    if(!ready && !eyes && draft.eyes){
      draft.eyes=0;
      ready=lab_garden_prepare(&draft);
    }
    rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG);
    menu_title(2,eyes?"2/3 EYES":"1/3 BODY");
    char name[24], position[24];
    u32 named=!eyes && !selected?look->source:entry;
    if(named) lab_garden_name(named,name);
    else lab_copy_label(name,look->body?"BODY EYES":"ORIGINAL EYES");
    u32 group=named?rd16(named+0x100u):0;
    ctext(15,name,lab_field_color(group),1);
    if(!ready || !lab_garden_preview(&draft)) ctext(85,"PREVIEW UNAVAILABLE",GREY,1);
    utoa_(cursor+1,position); u32 n=(u32)slen(position); position[n++]='/';
    utoa_(count,position+n);
    if(cursor==original) lab_copy_label(position+slen(position),eyes && look->body?" DEFAULT":" CURRENT");
    ctext(103,position,GOLD,1);
    ctext(120,"A NEXT  B OK  C BACK",GREY,1); show();
    int key=menu_key();
    if(key==K_BACK) return 0;
    if(key==K_OK && ready){ *look=draft; return 1; }
    if(key==K_A || key==1) cursor=wrap_step(cursor,lab_move_steps(key),0,count-1u);
  }
}
static u32 lab_garden_original_color(const LabGardenLook *look){
  u32 color=fl(look->source+0x10u)[0];
  return color<16u?color:16u;
}
static int lab_garden_color(LabGardenLook *look){
  u32 original=lab_garden_original_color(look);
  u32 color=look->color==LG_CURRENT?original:look->color;
  for(;;){
    LabGardenLook draft=*look; draft.color=color==original?LG_CURRENT:(u8)color;
    int ready=lab_garden_prepare(&draft);
    rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG); menu_title(2,"3/3 BODY COLOR");
    ctext(15,t_color_name(color),WHITE,1);
    if(!ready || !lab_garden_preview(&draft)) ctext(85,"PREVIEW UNAVAILABLE",GREY,1);
    appearance_footer(color==original?"CURRENT COLOR   A: NEXT":"A: COLOR",
                      color==original?GOLD:GREY,0,0);
    int key=menu_key();
    if(key==K_BACK) return 0;
    if(key==K_OK && ready){ *look=draft; return 1; }
    if(key==K_A || key==1) color=wrap_step(color,lab_move_steps(key),0,16u);
  }
}
static int lab_garden_review(const LabGardenLook *look){
  rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG);
  char body[24], eyes[24];
  u32 eye=look->eyes, eye_id=eye?rd16(eye+0x10au):lab_garden_eye_id(look->header);
  int match=rd16(look->header+0x10au)==eye_id;
  if(!eye && match) eye=look->header;
  if(!eye) for(u32 i=0;i<LG_CHARACTERS;i++){
    u32 candidate=lab_garden_row_addr(i);
    if(rd16(candidate+0x10au)==eye_id){ eye=candidate; break; }
  }
  lab_garden_name(look->header,body);
  if(eye) lab_garden_name(eye,eyes);
  else lab_copy_label(eyes,"ORIGINAL EYES");
  appearance_review_labels(body,lab_field_color(rd16(look->header+0x100u)),
                           eyes,eye?lab_field_color(rd16(eye+0x100u)):WHITE);
  if(!lab_garden_preview(look)) ctext(85,"PREVIEW UNAVAILABLE",GREY,1);
  u32 color=look->color==LG_CURRENT?lab_garden_original_color(look):look->color;
  appearance_footer(t_color_name(color),look->color==LG_CURRENT?GOLD:GREY,match,1);
  return yes_no();
}
static void lab_garden_edit(u32 slot){
  LabGardenLook draft={0};
  draft.slot=slot;
  draft.source=lab_garden_addr(slot);
  draft.color=LG_CURRENT;
  if(!lab_garden_prepare(&draft)){ message("SLOT FORMAT UNSUPPORTED","",""); return; }
  for(int step=0;step>=0;){
    if(step<2){ step+=lab_garden_candidate(step==1,&draft)?1:-1; continue; }
    if(step==2){ step+=lab_garden_color(&draft)?1:-1; continue; }
    if(!lab_garden_review(&draft)){ step--; continue; }
    if(!draft.body && !draft.eyes && draft.color==LG_CURRENT){
      message("NO APPEARANCE CHANGES","",""); return;
    }
    if(lab_garden_commit(&draft)) done_screen("APPEARANCE SAVED",GOLD);
    else message("GARDEN SAVE INCOMPLETE","REOPEN PARAMIX TO RESUME","");
    return;
  }
}
static void lab_garden_menu(void){
  if(!lab_garden_catalog()){ message("GARDEN CATALOG UNAVAILABLE","UPDATE THE ROM MENU",""); return; }
  u32 cursor=0;
  for(;;){
    if(!lab_garden_recover()){ message("PENDING GARDEN SAVE","COULD NOT RESUME",""); return; }
    for(u32 i=0;i<LG_SLOTS;i++){
      u32 address=lab_garden_addr(i);
      if(rd32(address)==0xFFFFFFFFu || (!rd32(address) && !rd32(address+4))) lab_garden_ready[i]=0;
      else lab_garden_ready[i]=lab_garden_valid(address)?1u:2u;
    }
    int slot=lab_select("GARDEN",LG_SLOTS,cursor,lab_garden_slot_row);
    if(slot<0) return;
    cursor=(u32)slot;
    if(lab_garden_ready[slot]==1) lab_garden_edit((u32)slot);
    else message(lab_garden_ready[slot]?"SLOT UNREADABLE":"EMPTY SLOT","INVITE AN ADULT IN MY LAB","");
  }
}
