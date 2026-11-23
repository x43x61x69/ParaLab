/* My Lab v1.0.00 APPDATA pages and primary asset bank. Offsets within a
 * save page include the four-byte CRC and inverse prefix. */
#define LAB_SAVE_FIRST 0xDFB000u
#define LAB_SAVE_PAGES 5u
#define LAB_POINTS 0x80u
#define LAB_LEVEL 0x8Au
#define LAB_ITEM_IDS 0x8Cu
#define LAB_ITEM_COUNTS 0x21Cu
#define LAB_ITEM_SLOTS 200u
#define LAB_STACK_MAX 10u
#define LAB_ENCOUNTERS 0x280u
#define LAB_VIEWED 0x2B2u
#define LAB_DECOR 0x37Eu
// The native TREASURES grid reads 15 flags per page from the APPDATA save.
#define LAB_TREASURES 0x388u
#define LAB_TREASURES_PER_PAGE 15u
#define LAB_TREASURE_COUNT (2u*LAB_TREASURES_PER_PAGE)
#define LAB_TREASURE_MASK ((1u<<LAB_TREASURE_COUNT)-1u)
#define LAB_ASSETS 0x211000u
#define LAB_ROSTER 0x17A91Cu
#define LAB_TAMAS 157u
#define LAB_TAMA_RECORDS 377u
#define LAB_ITEMS 139u

static u32 lab_save_slot, lab_item_table, lab_tama_table, lab_english, lab_english_size;
static u16 lab_choices[LAB_TAMAS];
static const char *const *lab_labels;

static u32 lab_u32(u32 offset){
  return g_set[offset]|((u32)g_set[offset+1]<<8)|((u32)g_set[offset+2]<<16)|((u32)g_set[offset+3]<<24);
}
static void lab_put32(u32 offset,u32 value){
  for(u32 i=0;i<4;i++) g_set[offset+i]=(u8)(value>>(8u*i));
}
static int lab_load(void){
  int found=0;
  for(u32 i=0;i<LAB_SAVE_PAGES;i++){
    hw_wdt_feed();
    flash_read(LAB_SAVE_FIRST+i*PAGE,g_page,PAGE);
    if(!set_ok(g_page)) continue;
    u32 sequence=g_page[4]|((u32)g_page[5]<<8)|((u32)g_page[6]<<16)|((u32)g_page[7]<<24);
    if(found && sequence<=lab_u32(4)) continue;
    for(u32 j=0;j<PAGE;j++) g_set[j]=g_page[j];
    found=1;
    lab_save_slot=i;
  }
  return found;
}
#if defined(LAB_FT_UPDATE) && !defined(HOST)
/* APPDATA stores the local calendar base and the RTC count at last save.
 * Always use the active machine's clock, including when exporting a slot. */
static u32 lab_backup_time(void){
  if((REG(0x45000200u)&0x87u)!=0x80u || !lab_load()) return 0;
  u32 count=rtc_cnt(), saved=lab_u32(0x28);
  u32 days=lab_u32(0x14), seconds=lab_u32(0x18);
  if(count<saved || seconds>=86400u || days>27392u) return 0;
  u32 saved_day=days+saved/86400u+(seconds+saved%86400u)/86400u;
  u32 y,m,d;
  civil(20089u+saved_day,&y,&m,&d);
  if(y!=(lab_u32(0x1C)&0xFFFFu) || m!=lab_u32(0x1C)>>16 ||
     d!=(lab_u32(0x20)&0xFFFFu)) return 0;
  u32 today=days+count/86400u+(seconds+count%86400u)/86400u;
  if(today>27392u) return 0;
  return (today+20089u)*86400u+(seconds+count%86400u)%86400u;
}
#endif

static void lab_save(const char *status){
  u32 sequence=lab_u32(4);
  if(sequence==0xFFFFFFFFu){
    lab_load();
    message("SAVE SEQUENCE FULL","","");
    return;
  }
  u32 slot=(lab_save_slot+1)%LAB_SAVE_PAGES;
  u32 address=LAB_SAVE_FIRST+slot*PAGE;
  rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG);
  ctext(42,"SAVING",WHITE,1);
  ctext(58,"DO NOT SWITCH OFF",GREY,1);
  show();
  lab_put32(4,sequence+1);
  stamp(g_set);
  flash_prog4k(address,g_set);
  if(!flash_same(address,g_set,PAGE)){
    lab_load();
    message("SAVE WRITE FAILED","REOPEN MY LAB TO CHECK","");
    return;
  }
  lab_save_slot=slot;
  done_screen(status,GOLD);
}

static int lab_move_steps(int key){
  if(key==1) return g_step;
  int steps=1;
#if !defined(HOST) && !defined(FELD_MY_LAB_ON_PARADISE)
  // Apply queued A taps together, preserving the order of B and C.
  while(hw_take_button(BTN_A)) steps++;
#endif
  return steps;
}

static int lab_select(const char *title,u32 count,u32 start,int (*row)(u32,char *,char *,u16 *)){
  u32 sel=start;
  for(;;){
    u32 top=count<=10u || sel<5u?0u:sel+5u>=count?count-10u:sel-5u;
    list_draw(title,count,sel,top,row,"A MOVE  B OK  C BACK");
    wait_release();
    int key=menu_key();
    if(key==K_BACK) return -1;
    if(key==K_OK) return (int)sel;
    if(key==K_A || key==1) sel=wrap_step(sel,lab_move_steps(key),0,count-1);
  }
}
static void lab_copy_label(char *out,const char *s){
  u32 i=0;
  for(;i<23 && s[i];i++) out[i]=s[i];
  out[i]=0;
}
static int lab_label_row(u32 i,char *name,char *right,u16 *color){
  (void)right; (void)color;
  lab_copy_label(name,lab_labels[i]);
  return 1;
}
static int lab_pick(const char *title,u32 count,const char *const *labels){
  lab_labels=labels;
  return lab_select(title,count,0,lab_label_row);
}
static int lab_confirm(const char *title,const char *detail,u32 value){
  char number[12];
  utoa_(value,number);
  rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG);
  ctext(19,title,WHITE,1);
  ctext(35,detail,GREY,1);
  ctext(52,number,GOLD,2);
  ctext(98,"B CONFIRM  C CANCEL",GREY,1);
  show();
  return yes_no();
}

/* Asset offsets and sizes are checked before reading records or names. */
static u32 lab_arc_file(u32 base,u32 size,u32 index,u32 *length){
  if(size<16u || rd32(base)!=0x32435241u || rd32(base+8)>size-16u ||
     index>=rd32(base+12) || index>=(rd32(base+8)/16u)) return 0;
  u32 end=16u+rd32(base+8), entry=base+16u+index*16u;
  u32 off=rd32(entry+4), len=rd32(entry+12);
  if(rd32(entry) || (off&3u) || off<16u+(index+1u)*16u || off>end || len>end-off) return 0;
  *length=len;
  return base+off;
}
static int lab_assets(void){
  u32 len;
  u32 config=lab_arc_file(LAB_ASSETS,0xA6B000u-LAB_ASSETS,0,&len);
  if(!config || len<0x34u) return 0;
  u32 items=rd32(config+0x28), tamas=rd32(config+0x2c), end=rd32(config+0x30);
  if(items<0x1au || items>tamas || tamas>end || end>len/2u ||
     (tamas-items)*2u!=LAB_ITEMS*0x2Eu || (end-tamas)*2u!=LAB_TAMA_RECORDS*0x1Eu) return 0;
  lab_item_table=config+2u*items;
  lab_tama_table=config+2u*tamas;
  u32 strings=lab_arc_file(LAB_ASSETS,0xA6B000u-LAB_ASSETS,2,&len);
  lab_english=strings ? lab_arc_file(strings,len,1,&lab_english_size) : 0;
  return 1;
}
static char lab_glyph(u32 code){
  static const char latin[]=" 0123456789+-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  return code>=305 && code<305+sizeof(latin)-1 ? latin[code-305] :
         code==375?'&':code==376?'\'':code==381?'.':code==382?'/':' ';
}
static void lab_name(u32 text_id,u32 fallback,char *out){
  if(lab_english && lab_english_size>=4 && text_id<rd16(lab_english) &&
     2u*(text_id+2u)<=lab_english_size){
    u32 p=2u*rd16(lab_english+2u*(text_id+1u)), n=0;
    for(;n<23 && p+2u<=lab_english_size;p+=2){
      u32 code=rd16(lab_english+p);
      if(!code) break;
      out[n++]=lab_glyph(code);
    }
    while(n && out[n-1]==' ') n--;
    if(n){ out[n]=0; return; }
  }
  out[0]='#';
  utoa_(fallback,out+1);
}

static void lab_points_menu(void){
  u32 cursor=0;
  for(;;){
    int choice=lab_select("GOTCHI POINTS",3,cursor,points_row);
    if(choice<0) return;
    cursor=(u32)choice;
    u32 current=lab_u32(LAB_POINTS), value=choice==0?99999u:0u;
    if(choice==2){
      u32 rest=current>99999u?99999u:current;
      u8 digits[5];
      for(int i=4;i>=0;i--){ digits[i]=(u8)(rest%10u); rest/=10u; }
      int pos=0;
      while(pos>=0 && pos<5){
        rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG);
        menu_title(10,"GOTCHI POINTS");
        for(int i=0;i<5;i++){
          int x=(FELD_SCREEN_W-100)/2+21*i;
          char digit[2]={(char)('0'+digits[i]),0};
          if(i==pos) rect(x-2,40,x+17,68,RGB(60,60,110));
          text(x,43,digit,i==pos?GOLD:WHITE,3);
        }
        ctext(80,"A: DIGIT",GREY,1); ctext(92,"B NEXT",GREY,1);
        ctext(106,"C CANCEL",GREY,1);
        show();
        int key=menu_key();
        if(key==K_BACK){ pos=-1; break; }
        if(key==K_OK) pos++;
        if(key==K_A || key==1) digits[pos]=(u8)wrap_step(digits[pos],lab_move_steps(key),0,9);
      }
      if(pos<0) continue;
      for(u32 i=0;i<5;i++) value=value*10u+digits[i];
    }
    if(value==current) continue;
    rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG);
    ctext(24,"SET GOTCHI POINTS TO",WHITE,1);
    char amount[8]; utoa_(value,amount); ctext(44,amount,value?GOLD:ORANGE,2);
    ctext(70,"YOU CAN KEEP EDITING",GREY,1);
    ctext(92,"B = YES",WHITE,1); ctext(106,"C = NO",GREY,1); show();
    if(yes_no()){ lab_put32(LAB_POINTS,value); lab_save("POINTS SAVED"); }
  }
}

static u32 lab_flag(u32 i){ return g_set[LAB_ENCOUNTERS+(i>>3)] & (1u<<(i&7u)); }
static u32 lab_encounter_count(void){
  u32 count=0;
  for(u32 i=0;i<LAB_TAMAS;i++) count+=lab_flag(i)!=0;
  return count;
}
static void lab_level_menu(void){
  u32 current=g_set[LAB_LEVEL];
  int picked=level_pick(current>=1u && current<=5u?current:1u,1,5,"RESEARCHER LEVEL","A: LEVEL");
  if(picked>=0 && (u32)picked!=current){
    g_set[LAB_LEVEL]=(u8)picked;
    lab_save("LEVEL SAVED");
  }
}

static u32 lab_tama_record(u32 id){
  for(u32 p=lab_tama_table;p<lab_tama_table+LAB_TAMA_RECORDS*0x1Eu;p+=0x1E)
    if(rd16(p)==id) return p;
  return 0;
}
static const u8 lab_book_fields[]={1,2,3,4,5,6,7,9};
static const char *const lab_field_names[]={
  "ALL FIELDS","LAND","WATER","SKY","FOREST","TROPICAL","ICE","COSMIC","NEW TAMA","TAMA"
};
static u16 lab_field_color(u32 field){
  // Same field colors as the Paradise and Neon Paramix menus (feld.js).
  static const u16 colors[]={
    WHITE,RGB(80,200,60),RGB(40,120,255),RGB(120,210,255),RGB(60,190,110),
    RGB(255,150,60),RGB(150,220,255),RGB(255,150,60),RGB(150,220,255),RGB(60,190,110)
  };
  return field<sizeof colors/sizeof colors[0]?colors[field]:WHITE;
}
static int lab_field_row(u32 i,char *name,char *right,u16 *color){
  (void)right;
  u32 field=lab_book_fields[i];
  lab_copy_label(name,lab_field_names[field]);
  *color=lab_field_color(field);
  return 1;
}
static int lab_tama_row(u32 i,char *name,char *right,u16 *color){
  u32 file=lab_choices[i], id=rd16(LAB_ROSTER+file*8u), record=lab_tama_record(id);
  lab_name(record?rd16(record+4):0xFFFFu,id,name);
  if(lab_flag(file)){
    lab_copy_label(right,"OPEN");
    *color=record?lab_field_color(rd16(record+0x0eu)):WHITE;
  }
  else { lab_copy_label(right,"LOCKED"); *color=GREY; }
  return 1;
}
static void lab_book_menu(void){
  u32 cursor=0;
  for(;;){
    int action=lab_select("TAMA FILE",3,cursor,progress_action_row);
    if(action<0) return;
    cursor=(u32)action;
    u32 group=0, count=0;
    if(action!=2){
      int choice=lab_select("CHOOSE FIELD",sizeof lab_book_fields,0,lab_field_row);
      if(choice<0) continue;
      group=lab_book_fields[choice];
    }
    const char *detail=lab_field_names[group];
    for(u32 i=0;i<LAB_TAMAS;i++){
      u32 record=lab_tama_record(rd16(LAB_ROSTER+8u*i));
      if(record && (!group || rd16(record+0x0eu)==group)) lab_choices[count++]=(u16)i;
    }
    if(!count) continue;
    if(action==0){
      int choice=lab_select(detail,count,0,lab_tama_row);
      if(choice<0) continue;
      char name[24], state[8];
      u16 color;
      lab_tama_row((u32)choice,name,state,&color);
      u32 file=lab_choices[choice], byte=file>>3;
      u8 mask=(u8)(1u<<(file&7u));
      if(lab_flag(file)){
        if(progress_reset_confirm("LOCK TAMA FILE?",name,"HIDE THIS ENTRY")){
          g_set[LAB_ENCOUNTERS+byte]&=(u8)~mask;
          g_set[LAB_VIEWED+byte]&=(u8)~mask;
          lab_save("TAMA FILE LOCKED");
        }
        continue;
      }
      lab_choices[0]=(u16)file; count=1;
      if(!progress_confirm(name,1)) continue;
    } else {
      u32 missing=0;
      for(u32 i=0;i<count;i++) missing+=!lab_flag(lab_choices[i]);
      if(!progress_confirm(detail,missing)) continue;
    }
    for(u32 i=0;i<count;i++){
      u32 file=lab_choices[i];
      g_set[LAB_ENCOUNTERS+(file>>3)]|=(u8)(1u<<(file&7u));
    }
    lab_save("TAMA FILES SAVED");
  }
}

static int lab_progress_row(u32 i,char *name,char *right,u16 *color){
  if(i==0){
    lab_copy_label(name,"RESEARCHER LEVEL");
    utoa_(g_set[LAB_LEVEL],right);
    *color=GOLD;
  } else {
    lab_copy_label(name,"TAMA FILE");
    utoa_(lab_encounter_count(),right);
  }
  return 1;
}
static void lab_progress_menu(int assets){
  u32 sel=0;
  for(;;){
    int choice=lab_select("PROGRESS",2,sel,lab_progress_row);
    if(choice<0) return;
    sel=(u32)choice;
    if(choice==0) lab_level_menu();
    else if(assets) lab_book_menu();
    else message("TAMA FILE UNAVAILABLE","","");
  }
}

static u32 lab_count(u32 slot){
  return (g_set[LAB_ITEM_COUNTS+(slot>>1)]>>((slot&1u)*4u))&15u;
}
static u32 lab_find_slot(u32 id){
  for(u32 i=0;i<LAB_ITEM_SLOTS;i++){
    u32 p=LAB_ITEM_IDS+2u*i;
    if(lab_count(i) && (g_set[p]|((u32)g_set[p+1]<<8))==id) return i;
  }
  return LAB_ITEM_SLOTS;
}
static int lab_set_count(u32 id,u32 count){
  u32 slot=lab_find_slot(id);
  if(slot==LAB_ITEM_SLOTS){
    for(slot=0;slot<LAB_ITEM_SLOTS && lab_count(slot);slot++){}
    if(slot==LAB_ITEM_SLOTS) return 0;
    g_set[LAB_ITEM_IDS+2u*slot]=(u8)id;
    g_set[LAB_ITEM_IDS+2u*slot+1]=(u8)(id>>8);
  }
  u32 p=LAB_ITEM_COUNTS+(slot>>1), shift=(slot&1u)*4u;
  g_set[p]=(u8)((g_set[p]&~(15u<<shift))|(count<<shift));
  return 1;
}
static u32 lab_item_record(u32 i){ return lab_item_table+lab_choices[i]*0x2Eu; }
static int lab_item_row(u32 i,char *name,char *right,u16 *color){
  (void)color;
  u32 record=lab_item_record(i), id=rd16(record), slot=lab_find_slot(id);
  lab_name(rd16(record+2),id,name);
  right[0]='x';
  utoa_(slot<LAB_ITEM_SLOTS?lab_count(slot):0,right+1);
  return 1;
}
static int lab_item_allowed(u32 record){
  u32 type=rd16(record+0x16);
  return (type==1 || (type>=9 && type<=12) || type==14) && rd16(record+0x18)!=0xFFFFu;
}
static const char *const lab_item_types[]={"FOOD","TOYS","ACCESSORIES","POTIONS","SPRAYS","TICKET"};
static const u8 lab_item_type_ids[]={1,9,10,11,12,14};
static int lab_bag_dirty;

static int lab_edit_count(const char *name,u32 amount,u32 minimum){
  for(;;){
    rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG); menu_title(5,name);
    char count[8]; count[0]='x'; utoa_(amount,count+1);
    ctext(35,amount==0?"REMOVE":amount==LAB_STACK_MAX?"MAX":count,amount?GOLD:ORANGE,3);
    ctext(90,"A: COUNT",GREY,1); ctext(112,"B OK   C BACK",GREY,1); show();
    int key=menu_key();
    if(key==K_BACK) return -1;
    if(key==K_OK) return (int)amount;
    if(key==K_A || key==1) amount=wrap_step(amount,lab_move_steps(key),minimum,LAB_STACK_MAX);
  }
}

static void lab_add_one(void){
  int type=lab_pick("ITEM CATEGORY",6,lab_item_types);
  if(type<0) return;
  u32 count=0;
  for(u32 i=0;i<LAB_ITEMS;i++){
    u32 record=lab_item_table+i*0x2Eu;
    if(lab_item_allowed(record) && rd16(record+0x16)==lab_item_type_ids[type]) lab_choices[count++]=(u16)i;
  }
  if(!count) return;
  int choice=lab_select(lab_item_types[type],count,0,lab_item_row);
  if(choice<0) return;
  u32 item=lab_item_record((u32)choice), id=rd16(item), slot=lab_find_slot(id);
  u32 owned=slot<LAB_ITEM_SLOTS?lab_count(slot):0;
  char name[24]; lab_name(rd16(item+2),id,name);
  int amount=lab_edit_count(name,owned?owned:1,1);
  if(amount<0 || (u32)amount==owned) return;
  if(lab_set_count(id,(u32)amount)) lab_bag_dirty=1;
  else message("BAG IS FULL","","");
}

static void lab_bulk_items(int missing){
  u32 amount=1, count=0, free=0;
  for(u32 i=0;i<LAB_ITEM_SLOTS;i++) free+=!lab_count(i);
  for(u32 i=0;i<LAB_ITEMS;i++){
    u32 record=lab_item_table+i*0x2eu;
    if(lab_item_allowed(record) && (lab_find_slot(rd16(record))==LAB_ITEM_SLOTS)==missing)
      lab_choices[count++]=(u16)i;
  }
  if(!count){ message(missing?"NO MISSING ITEMS":"NO OWNED ITEMS","",""); return; }
  if(missing && count>free){ message("BAG IS FULL","NOTHING CHANGED",""); return; }
  const char *title=missing?"ADD ALL MISSING":"SET OWNED COUNTS";
  for(;;){
    u32 changes=0;
    for(u32 i=0;i<count;i++){
      u32 slot=lab_find_slot(rd16(lab_item_record(i)));
      changes+=missing || (slot<LAB_ITEM_SLOTS && lab_count(slot)!=amount);
    }
    rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG); menu_title(4,title);
    char number[8]; number[0]='x'; utoa_(amount,number+1);
    ctext(30,amount==LAB_STACK_MAX?"MAX":number,GOLD,3);
    ctext(54,"ITEM LIMITS APPLY",GREY,1);
    utoa_(changes,number); ctext(64,number,GOLD,2); ctext(83,"ITEMS TO CHANGE",GREY,1);
    ctext(108,"A: COUNT",GREY,1); ctext(119,"B OK   C BACK",GREY,1); show();
    int key=menu_key();
    if(key==K_BACK) return;
    if(key==K_A || key==1) amount=wrap_step(amount,lab_move_steps(key),1,LAB_STACK_MAX);
    if(key==K_OK && !changes){ message("NOTHING TO CHANGE","",""); return; }
    if(key==K_OK && bulk_confirm(title,changes,amount,amount==LAB_STACK_MAX,1)){
      for(u32 i=0;i<count;i++) lab_set_count(rd16(lab_item_record(i)),amount);
      lab_bag_dirty=1;
      return;
    }
  }
}
static int lab_decor_row(u32 i,char *name,char *right,u16 *color){
  u32 record=lab_item_record(i), id=rd16(record);
  lab_name(rd16(record+2),id,name);
  u32 current=g_set[LAB_DECOR]|((u32)g_set[LAB_DECOR+1]<<8);
  if(!current) current=0x5208u;
  if(id==current){ lab_copy_label(right,"ACTIVE"); *color=GOLD; }
  return 1;
}
static void lab_decor_menu(void){
  u32 count=0, cursor=0, current=g_set[LAB_DECOR]|((u32)g_set[LAB_DECOR+1]<<8);
  for(u32 i=0;i<LAB_ITEMS;i++){
    u32 record=lab_item_table+i*0x2eu;
    if(rd16(record+0x16)!=13u) continue;
    if(rd16(record)==current) cursor=count;
    lab_choices[count++]=(u16)i;
  }
  if(!count) return;
  int picked=lab_select("LAB DECORATIONS",count,cursor,lab_decor_row);
  if(picked<0) return;
  u32 record=lab_item_record((u32)picked), id=rd16(record);
  if(id==current) return;
  char name[24]; lab_name(rd16(record+2),id,name);
  if(!progress_reset_confirm("APPLY DECORATION?",name,"REPLACES ACTIVE LOOK")) return;
  g_set[LAB_DECOR]=(u8)id;
  g_set[LAB_DECOR+1]=(u8)(id>>8);
  lab_bag_dirty=1;
}

/* The native Craft Room keeps completed ARC2 items outside APPDATA. The
 * decoration templates are the ten stock packages with IDs 230 through 239.
 * Keeping each package's default palette gives one finished item per design. */
#define LAB_CRAFT_FIRST 0xCA1000u
#define LAB_CRAFT_SIZE 0x4000u
#define LAB_CRAFT_SLOTS 30u
#define LAB_PLANET_FIRST 230u
#define LAB_PLANET_COUNT 10u

static u32 lab_craft_id(u32 address,u32 size){
  u32 length, data=lab_arc_file(address,size,0,&length);
  if(!data || length<0x50u) return 0;
  u32 words=rd32(data+0x4cu);
  if(words<0x28u || words>=length/2u) return 0;
  u32 end=16u+rd32(address+8), sum=0;
  for(u32 i=8;i<end;i++) sum+=fl(address+i)[0];
  return sum==rd32(address+4)?rd16(data+2u*words):0;
}

static int lab_craft_empty(u32 address){
  for(u32 i=0;i<LAB_CRAFT_SIZE;i+=4) if(rd32(address+i)!=0xFFFFFFFFu) return 0;
  return 1;
}

static void lab_add_planet_deco(void){
  u32 sources[LAB_PLANET_COUNT], sizes[LAB_PLANET_COUNT], free_slots[LAB_CRAFT_SLOTS];
  u32 owned=0, free=0, missing=0;
  for(u32 i=0;i<LAB_CRAFT_SLOTS;i++){
    u32 address=LAB_CRAFT_FIRST+i*LAB_CRAFT_SIZE;
    u32 id=lab_craft_id(address,LAB_CRAFT_SIZE);
    if(id>=LAB_PLANET_FIRST && id<LAB_PLANET_FIRST+LAB_PLANET_COUNT)
      owned|=1u<<(id-LAB_PLANET_FIRST);
    else if(lab_craft_empty(address)) free_slots[free++]=address;
  }
  for(u32 i=0;i<LAB_PLANET_COUNT;i++){
    if(owned&(1u<<i)) continue;
    u32 outer_size, package_size;
    u32 outer=lab_arc_file(LAB_ASSETS,0xA6B000u-LAB_ASSETS,13u+i,&outer_size);
    u32 package=outer?lab_arc_file(outer,outer_size,0,&package_size):0;
    if(!package || lab_craft_id(package,package_size)!=LAB_PLANET_FIRST+i ||
       16u+rd32(package+8)>PAGE){
      message("PLANET DECO UNAVAILABLE","ASSET FORMAT UNSUPPORTED",""); return;
    }
    sources[missing]=package;
    sizes[missing++]=16u+rd32(package+8);
  }
  if(!missing){ message("ALL PLANET DECO OWNED","",""); return; }
  if(missing>free){ message("CRAFT STORAGE FULL","NOTHING CHANGED",""); return; }
  if(!lab_confirm("ADD ALL PLANET DECO?","ONE OF EACH MISSING",missing)) return;
  for(u32 i=0;i<missing;i++){
    for(u32 j=0;j<PAGE;j++) g_page[j]=0xFFu;
    flash_read(sources[i],g_page,sizes[i]);
    flash_prog4k(free_slots[i],g_page);
    if(!flash_same(free_slots[i],g_page,PAGE)){
      message("PLANET DECO INCOMPLETE","TRY ADDING MISSING AGAIN",""); return;
    }
    hw_wdt_feed();
  }
  message("PLANET DECO ADDED","USER INFO > PLANET","");
}

static void lab_treasure_name(u32 item,char *name){
  lab_copy_label(name,item<LAB_TREASURES_PER_PAGE?"PAGE 1 / SLOT ":"PAGE 2 / SLOT ");
  utoa_(item%LAB_TREASURES_PER_PAGE+1u,name+sizeof("PAGE 1 / SLOT ")-1u);
}

static int lab_treasure_row(u32 i,char *name,char *right,u16 *color){
  int owned=(lab_u32(LAB_TREASURES)>>i)&1u;
  lab_treasure_name(i,name);
  lab_copy_label(right,owned?"OPEN":"LOCKED");
  *color=owned?GOLD:GREY;
  return 1;
}

static void lab_treasures_menu(void){
  static const char *const actions[]={"EDIT ONE","UNLOCK ALL"};
  int action=lab_pick("TREASURES",2u,actions);
  if(action<0) return;
  u32 current=lab_u32(LAB_TREASURES), updated;
  if(!action){
    int choice=lab_select("EDIT TREASURE",LAB_TREASURE_COUNT,0,lab_treasure_row);
    if(choice<0) return;
    u32 mask=1u<<(u32)choice;
    char name[24];
    lab_treasure_name((u32)choice,name);
    if(!lab_confirm(current&mask?"LOCK TREASURE?":"UNLOCK TREASURE?",name,1u)) return;
    updated=current^mask;
  } else {
    u32 missing=0;
    for(u32 bit=LAB_TREASURE_MASK&~current;bit;bit&=bit-1u) missing++;
    if(!missing){ message("ALL TREASURES OPEN","",""); return; }
    if(!lab_confirm("UNLOCK TREASURES?","MISSING TREASURES",missing)) return;
    updated=current|LAB_TREASURE_MASK;
  }
  lab_put32(LAB_TREASURES,updated);
  lab_bag_dirty=1;
}

static const char *const lab_bag_actions[]={
  "ADD ITEM","ADD ALL MISSING","SET OWNED COUNTS","LAB DECORATIONS","ADD ALL PLANET DECO","TREASURES"
};
#define LAB_BAG_ACTIONS (sizeof lab_bag_actions/sizeof lab_bag_actions[0])
static int lab_bag_row(u32 i,char *name,char *right,u16 *color){
  if(i<LAB_BAG_ACTIONS){
    lab_copy_label(name,lab_bag_actions[i]);
    *color=i==0?GOLD:i==1?ORANGE:RGB(104,224,211);
    return 1;
  }
  return lab_item_row(i-LAB_BAG_ACTIONS,name,right,color);
}
static void lab_items_menu(void){
  u32 cursor=0;
  lab_bag_dirty=0;
  for(;;){
    u32 count=0;
    for(u32 i=0;i<LAB_ITEMS;i++){
      u32 record=lab_item_table+i*0x2eu;
      if(lab_item_allowed(record) && lab_find_slot(rd16(record))<LAB_ITEM_SLOTS) lab_choices[count++]=(u16)i;
    }
    if(cursor>=count+LAB_BAG_ACTIONS) cursor=count+LAB_BAG_ACTIONS-1u;
    int choice=lab_select("ITEMS",count+LAB_BAG_ACTIONS,cursor,lab_bag_row);
    if(choice<0){
      if(!lab_bag_dirty) return;
      if(save_changes_confirm()) lab_save("ITEMS SAVED");
      else lab_load();
      return;
    }
    cursor=(u32)choice;
    if(!cursor) lab_add_one();
    else if(cursor<3u) lab_bulk_items(cursor==1u);
    else if(cursor==3u) lab_decor_menu();
    else if(cursor==4u) lab_add_planet_deco();
    else if(cursor==5u) lab_treasures_menu();
    else {
      u32 record=lab_item_record(cursor-LAB_BAG_ACTIONS), id=rd16(record), slot=lab_find_slot(id);
      u32 old=lab_count(slot);
      char name[24]; lab_name(rd16(record+2),id,name);
      int amount=lab_edit_count(name,old>LAB_STACK_MAX?LAB_STACK_MAX:old,0u);
      if(amount<0 || old==(u32)amount) continue;
      if(!amount && !progress_reset_confirm("REMOVE ITEM?",name,"FROM BAG")) continue;
      if(lab_set_count(id,(u32)amount)) lab_bag_dirty=1;
    }
  }
}

#include "my_lab_garden.h"
#include "my_lab_saves.h"

static void lab_main_menu(void){
  const char *const names[]={"SAVES","ITEMS","POINTS","GARDEN","PROGRESS","FLASH TOOL","ABOUT"};
  const u16 colors[]={GOLD,PINK,GOLD,RGB(120,220,120),PROGRESS_COLOR,ORANGE,ABOUT_COLOR};
  int assets=lab_assets(), flash=flash_tool_header(FT_BASE);
  if(!lab_garden_recover()) message("PENDING GARDEN SAVE","COULD NOT RESUME","");
  if(ls_pending()){
    ls_busy("RESUMING SAVE RESTORE");
    if(!ls_recover()) message("SAVE RECOVERY FAILED","USE FLASH TOOL","");
  }
  int save=lab_load();
  u32 sel=0, n=sizeof(names)/sizeof(names[0])-(flash?0u:1u), top=0;
  for(;;){
    char points[12];
    const char *status[]={"MANAGE GAME SLOTS","MANAGE BAG",points,"EDIT TAMA SLOTS","LEVEL / TAMA FILE","PC FLASH",PARAMIX_VERSION};
    if(save) utoa_(lab_u32(LAB_POINTS),points);
    else lab_copy_label(points,"NO SAVE");
    rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG);
    menu_title(1,"PARALAB");
#ifdef BAT_SHOW
    menu_battery(1);
#endif
    for(u32 row=0;row<4;row++){
      u32 entry=(top+row)%n;
      if(!flash && entry>=5) entry++;
      big_entry(10+(int)row*27,(top+row)%n==sel,names[entry],status[entry],colors[entry],GREY);
    }
    ctext(120,"A MOVE B OK C EXIT",GREY,1);
    show();
    wait_release();
    int key=menu_key();
    if(key==K_BACK){
      if(ls_pending()) message("SAVE RECOVERY PENDING","USE FLASH TOOL","");
      else leave();
    }
    if(key==K_A || key==1){
      int steps=key==K_A?lab_move_steps(key):g_step>0?1:-1;
      int direction=steps>0?1:-1;
      for(;steps;steps-=direction){
        sel=wrap_step(sel,direction,0,n-1);
        if((sel+n-top)%n>=4u) top=direction>0?(sel+n-3u)%n:sel;
      }
    }
    if(key!=K_OK) continue;
    if(ls_pending() && sel<5u){ message("SAVE RECOVERY PENDING","USE FLASH TOOL",""); continue; }
    if(sel==0){ ls_menu(); save=lab_load(); }
    else if(sel!=3 && sel<5 && !save) message("NO VALID MY LAB SAVE","OPEN MY LAB FIRST","");
    else if(sel==1){
      if(assets) lab_items_menu();
      else message("ITEM CATALOG UNAVAILABLE","","");
    } else if(sel==2) lab_points_menu();
    else if(sel==3) lab_garden_menu();
    else if(sel==4) lab_progress_menu(assets);
    else if(sel==5 && flash) flash_tool_menu();
    else about_menu();
  }
}
