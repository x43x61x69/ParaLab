/* Two saved games rotate through three banks. A bank becomes current only
 * after all data and its header have been verified. Use the third bank to
 * replace or clear a slot without destroying its previous copy first. */
#define LS_FIRST 0xA6C000u
#define LS_DATA ((LG_SLOTS * LG_SIZE) + LAB_SAVE_PAGES * PAGE)
#define LS_GARDEN (LG_SLOTS * LG_SIZE)
#define LS_BANK (PAGE + LS_DATA)
#define LS_BANKS 3u
#define LS_SLOTS 2u
#define LS_CONTROL (LS_FIRST + LS_BANKS * LS_BANK)
#define LS_JOURNAL (LS_CONTROL + PAGE)
#define LS_MARKER 0x4C4D5850u  /* PXMLSV01 */
#define LS_HEADER 0x42534C4Du  /* MLSB */
#define LS_LOAD 0x4A534C4Du    /* MLSJ */
#define LS_CLEAR 1u
_Static_assert(LS_JOURNAL==0xC65000u, "cold boot journal address");

static u32 ls_slots[LS_SLOTS], ls_generation;

static u32 ls_bank(u32 bank){ return LS_FIRST+bank*LS_BANK; }
static u32 ls_live(u32 off){
  return off<LS_GARDEN?LG_FIRST+off:LAB_SAVE_FIRST+off-LS_GARDEN;
}
static int ls_supported(void){
  return rd32(LS_CONTROL)==LS_MARKER && rd32(LS_CONTROL+4)==0x31305653u;
}
static u32 ls_header_crc(void){
  return crc16arc(g_page,0,28);
}
static int ls_header_ok(u32 address){
  flash_read(address,g_page,PAGE);
  u32 checksum=rd32(address+28);
  return rd32(address)==LS_HEADER && rd32(address+4)<LS_SLOTS &&
    rd32(address+8) && rd32(address+16)<=LS_CLEAR &&
    (checksum^rd32(address+32))==0xFFFFFFFFu && checksum==ls_header_crc();
}
static void ls_scan(void){
  ls_generation=0;
  for(u32 i=0;i<LS_SLOTS;i++) ls_slots[i]=LS_BANKS;
  for(u32 bank=0;bank<LS_BANKS;bank++){
    u32 a=ls_bank(bank);
    if(!ls_header_ok(a)) continue;
    u32 slot=rd32(a+4), generation=rd32(a+8), old=ls_slots[slot];
    if(generation>ls_generation) ls_generation=generation;
    if(old==LS_BANKS || generation>rd32(ls_bank(old)+8)) ls_slots[slot]=bank;
  }
}
static u32 ls_current(u32 slot){
  u32 bank=ls_slots[slot];
  return bank<LS_BANKS && rd32(ls_bank(bank)+16)==0?bank:LS_BANKS;
}
static int ls_crc_bank(u32 bank){
  if(bank>=LS_BANKS) return 0;
  u32 address=ls_bank(bank), crc=0xFFFFFFFFu;
  if(!ls_header_ok(address) || rd32(address+16)) return 0;
  for(u32 off=0;off<LS_DATA;off+=PAGE){
    flash_read(address+PAGE+off,g_page,PAGE);
    for(u32 i=0;i<PAGE;i++) crc=sl_crc(crc,g_page[i]);
    hw_wdt_feed();
  }
  return (crc^0xFFFFFFFFu)==rd32(address+12);
}
static u32 ls_spare_bank(void){
  if(ls_generation==0xFFFFFFFFu) return LS_BANKS;
  for(u32 bank=0;bank<LS_BANKS;bank++)
    if(bank!=ls_slots[0] && bank!=ls_slots[1]) return bank;
  return LS_BANKS;
}
static int ls_publish(u32 bank,u32 slot,u32 crc,u32 points,u32 level,int clear){
  for(u32 i=0;i<PAGE;i++) g_page[i]=0xFFu;
  sl_w32(g_page,LS_HEADER); sl_w32(g_page+4,slot);
  sl_w32(g_page+8,ls_generation+1u); sl_w32(g_page+12,crc);
  sl_w32(g_page+16,clear?LS_CLEAR:0u); sl_w32(g_page+20,points); sl_w32(g_page+24,level);
  u32 checksum=ls_header_crc();
  sl_w32(g_page+28,checksum); sl_w32(g_page+32,~checksum);
  return lab_garden_copy_page(ls_bank(bank),g_page);
}
static int ls_make(u32 slot,u32 source,int clear){
  ls_scan();
  u32 bank=ls_spare_bank();
  if(bank==LS_BANKS || (!clear && source<LS_BANKS && !ls_crc_bank(source))) return 0;
  u32 address=ls_bank(bank), crc=0xFFFFFFFFu, points=0, level=0;
  if(!lab_garden_copy_page(address,g_ff)) return 0;
  if(!clear){
    for(u32 off=0;off<LS_DATA;off+=PAGE){
      flash_read(source==LS_BANKS?ls_live(off):ls_bank(source)+PAGE+off,g_page,PAGE);
      for(u32 i=0;i<PAGE;i++) crc=sl_crc(crc,g_page[i]);
      if(!lab_garden_copy_page(address+PAGE+off,g_page)) return 0;
      hw_wdt_feed();
    }
    if(source<LS_BANKS){
      points=rd32(ls_bank(source)+20); level=rd32(ls_bank(source)+24);
    } else {
      points=lab_u32(LAB_POINTS); level=g_set[LAB_LEVEL];
    }
  }
  return ls_publish(bank,slot,~crc,points,level,clear);
}

static int ls_pending(void){
  return ls_supported() && rd32(LS_JOURNAL)==LS_LOAD && rd32(LS_JOURNAL+4)==~LS_LOAD;
}
static int ls_recover(void){
  if(!ls_pending()) return 1;
  u32 bank=rd32(LS_JOURNAL+8), generation=rd32(LS_JOURNAL+12);
  if(bank>LS_BANKS || (bank==LS_BANKS && generation) ||
     rd32(LS_JOURNAL+16)!=~(bank^generation)) return 0;
  if(bank<LS_BANKS && (rd32(ls_bank(bank)+8)!=generation || !ls_crc_bank(bank))) return 0;
  for(u32 off=0;off<LS_DATA;off+=PAGE){
    const u8 *page=g_ff;
    if(bank<LS_BANKS){
      flash_read(ls_bank(bank)+PAGE+off,g_page,PAGE);
      page=g_page;
    }
    if(!lab_garden_copy_page(ls_live(off),page)) return 0;
    hw_wdt_feed();
  }
  return lab_garden_copy_page(LS_JOURNAL,g_ff);
}
static int ls_load(u32 bank){
  if(ls_pending() || (bank<LS_BANKS && !ls_crc_bank(bank))) return 0;
  u32 generation=bank==LS_BANKS?0:rd32(ls_bank(bank)+8);
  for(u32 i=0;i<PAGE;i++) g_page[i]=0xFFu;
  sl_w32(g_page,LS_LOAD); sl_w32(g_page+4,~LS_LOAD);
  sl_w32(g_page+8,bank); sl_w32(g_page+12,generation);
  sl_w32(g_page+16,~(bank^generation));
  return lab_garden_copy_page(LS_JOURNAL,g_page) && ls_recover();
}

/* PMS1 framing is shared with Paradise. Offer version 2 identifies a fixed
 * My Lab snapshot: six Garden records followed by the APPDATA ring. */
#define LS_LINK_VERSION 2u
static u32 ls_link_signature(void){
  if(rd32(LAB_ASSETS)!=0x32435241u) return 0;
  return rd32(LAB_ASSETS+4u);
}
static u32 ls_link_ids(u32 crc,u32 address,u32 count,u32 stride){
  for(u32 i=0;i<count;i++,address+=stride){
    u32 id=rd16(address);
    crc=sl_crc(sl_crc(crc,(u8)id),(u8)(id>>8));
  }
  return crc;
}
/* The offer version and size cover the Garden/APPDATA layout. Compare the
 * ordered IDs that give save data meaning, independent of text and artwork. */
static u32 ls_link_layout(void){
  if(!lab_assets()) return 0;
  u32 crc=ls_link_ids(0xFFFFFFFFu,LAB_ROSTER,LAB_TAMAS,8u);
  crc=ls_link_ids(crc,lab_item_table,LAB_ITEMS,0x2Eu);
  return ~ls_link_ids(crc,lab_tama_table,LAB_TAMA_RECORDS,0x1Eu);
}
/* Keep the v2 offer intact for older menus. Ask for the layout only when
 * the ARC2 checksums differ. Retry the query if a frame is missed. */
static int ls_link_matches(u32 signature,u32 offered){
  if(signature==offered) return 1;
  u32 layout=ls_link_layout();
  if(!layout) return 0;
  for(u32 retry=0;retry<3u && !sl_aborted();retry++){
    if(!sl_frame('M',sl_session,sl_seq,0,0)) return 0;
    u32 start=sl_now();
    for(;;){
      u32 elapsed=sl_now()-start;
      if(elapsed>=1000u || !sl_read(1000u-elapsed)) break;
      if(sl_rx_session==sl_session && sl_rx_seq==sl_seq && sl_rx_type=='M' && sl_rx_n==4u)
        return sl_r32(sl_rx)==layout;
    }
  }
  return 0;
}
static int ls_send(u32 slot){
  if(slot>=LS_SLOTS) return 0;
  sl_ui_begin(0);
  u32 signature=ls_link_signature();
  ls_scan();
  u32 bank=ls_current(slot);
  sl_ui_set(SL_PREPARE);
  if(!signature || !ls_crc_bank(bank) || sl_aborted()) return 0;
  u32 address=ls_bank(bank), crc=rd32(address+12);
  u8 offer[32];
  sl_w32(offer,LS_LINK_VERSION); sl_w32(offer+4,signature);
  sl_w32(offer+8,LS_DATA); sl_w32(offer+12,crc);
  sl_w32(offer+16,rd32(address+20)); sl_w32(offer+20,rd32(address+24));
  sl_w32(offer+24,slot); sl_w32(offer+28,0);
  u8 layout[4];
  sl_w32(layout,ls_link_layout());
  sl_session=sl_now()^crc^0xAA583197u; sl_seq=0;
  sl_ui_set(SL_WAIT);
  if(!sl_request_with_layout('O',offer,sizeof offer,layout)) return 0;
  sl_ui_set(SL_DATA);
  for(u32 off=0;off<LS_DATA;off+=PAGE){
    flash_read(address+PAGE+off,g_page,PAGE);
    u32 size=lz_pack(g_page,g_cmp);
    u8 length[4]; sl_w32(length,size);
    if(!sl_request('H',length,sizeof length)) return 0;
    for(u32 pos=0;pos<size;){
      u32 count=size-pos; if(count>sizeof sl_rx) count=sizeof sl_rx;
      if(!sl_request('D',g_cmp+pos,count)) return 0;
      pos+=count;
    }
    sl_ui_progress(off+PAGE,LS_DATA);
  }
  sl_ui_set(SL_VERIFY);
  if(!sl_request('E',0,0)) return 0;
  sl_ui_set(SL_FINISH);
  return 1;
}
static int ls_receive(u32 slot){
  if(slot>=LS_SLOTS) return 0;
  sl_ui_begin(1);
  u32 signature=ls_link_signature();
  ls_scan();
  u32 bank=ls_spare_bank();
  if(!signature || bank==LS_BANKS || ls_current(slot)!=LS_BANKS || !sl_wait_offer()) return 0;
  u32 expected=sl_r32(sl_rx+12), points=sl_r32(sl_rx+16), level=sl_r32(sl_rx+20), source=sl_r32(sl_rx+24);
  if(sl_r32(sl_rx)!=LS_LINK_VERSION || sl_r32(sl_rx+8)!=LS_DATA ||
     source>=LS_SLOTS || sl_r32(sl_rx+28)!=0 || !ls_link_matches(signature,sl_r32(sl_rx+4)))
    return sl_reject();

  rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG); ctext(14,"RECEIVE SAVE?",WHITE,1);
  char label[16]; save_label(slot,label); ctext(30,label,GOLD,2);
  utoa_(points,label); lab_copy_label(label+slen(label)," PTS"); ctext(54,label,GOLD,1);
  save_label(source,label); ctext(68,"FROM",GREY,1); ctext(80,label,WHITE,1);
  ctext(98,"B ACCEPT",WHITE,1); ctext(110,"C CANCEL",GREY,1); show();
  if(!yes_no()) return sl_reject();

  // Only the spare bank can change. Its header stays erased until all pages
  // have been checked and written, so a cut transfer never appears as a save.
  sl_ui_set(SL_HEADER);
  u32 address=ls_bank(bank);
  if(!lab_garden_copy_page(address,g_ff)) return sl_reject();
  sl_ui_set(SL_DATA);
  sl_accept();
  u32 crc=0xFFFFFFFFu, sequence=0, actual_points=0, actual_level=0;
  int have_save=0;
  for(u32 off=0;off<LS_DATA;off+=PAGE){
    if(!sl_next('H',4)) return 0;
    u32 size=sl_r32(sl_rx);
    if(!size || size>sizeof g_cmp) return sl_reject();
    sl_accept();
    for(u32 pos=0;pos<size;){
      u32 count=size-pos; if(count>sizeof sl_rx) count=sizeof sl_rx;
      if(!sl_next('D',count)) return 0;
      for(u32 i=0;i<count;i++) g_cmp[pos+i]=sl_rx[i];
      pos+=count;
      if(pos<size) sl_accept();
    }
    if(lz_unpack(g_cmp,size,g_page)) return sl_reject();
    if(off>=LS_GARDEN && set_ok(g_page)){
      u32 next=sl_r32(g_page+4);
      if(!have_save || next>sequence){
        sequence=next; have_save=1;
        actual_points=sl_r32(g_page+LAB_POINTS); actual_level=g_page[LAB_LEVEL];
      }
    }
    for(u32 i=0;i<PAGE;i++) crc=sl_crc(crc,g_page[i]);
    if(sl_aborted() || !lab_garden_copy_page(address+PAGE+off,g_page)) return sl_reject();
    hw_wdt_feed();
    sl_ui_progress(off+PAGE,LS_DATA);
    sl_accept();
  }
  if(!sl_next('E',0)) return 0;
  sl_ui_set(SL_VERIFY);
  if(~crc!=expected || !have_save || actual_points!=points || actual_level!=level || sl_aborted())
    return sl_reject();
  sl_ui_set(SL_COMMIT);
  if(!ls_publish(bank,slot,expected,points,level,0)) return sl_reject();
  sl_receive_done();
  return 1;
}

static void ls_busy(const char *title){
  rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG);
  ctext(44,title,WHITE,1); ctext(64,"DO NOT SWITCH OFF",GREY,1); show();
}
static void ls_summary(u32 bank,char *out){
  utoa_(rd32(ls_bank(bank)+20),out);
  lab_copy_label(out+slen(out)," PTS");
}
#define LS_FIRST_SLOT_ROW 1u
static int ls_destination_row(u32 i,char *name,char *right,u16 *color){
  save_label(i,name);
  int used=ls_current(i)<LS_BANKS;
  lab_copy_label(right,used?"SAVED":"EMPTY"); *color=used?GOLD:GREY;
  return 1;
}
static int ls_pick(u32 cursor,int live){
  for(;;){
    rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG); menu_title(1,"SAVES");
    char points[16]="";
    if(live){ utoa_(lab_u32(LAB_POINTS),points); lab_copy_label(points+slen(points)," PTS"); }
    save_list_entry(0,cursor==0,"ACTIVE SAVE",live?"LIVE":"EMPTY",points,GOLD,GREY);
    for(u32 i=0;i<LS_SLOTS;i++){
      char name[12],detail[16]="";
      save_label(i,name);
      u32 bank=ls_current(i);
      int saved=bank<LS_BANKS;
      if(saved) ls_summary(bank,detail);
      save_list_entry(i+LS_FIRST_SLOT_ROW,i+LS_FIRST_SLOT_ROW==cursor,name,saved?"SAVED":"EMPTY",detail,saved?GOLD:GREY,GREY);
    }
    const u32 last=LS_FIRST_SLOT_ROW+LS_SLOTS;
    save_list_entry(last,cursor==last,"NEW GAME","","",ORANGE,GREY);
    ctext(118,"A MOVE  B OK  C BACK",GREY,1); show(); wait_release();
    int key=menu_key();
    if(key==K_BACK) return -1;
    if(key==K_OK) return (int)cursor;
    if(key==K_A || key==1) cursor=wrap_step(cursor,lab_move_steps(key),0,last);
  }
}
enum { LS_RESUME, LS_SAVE_CURRENT, LS_COPY, LS_ERASE, LS_SEND,
#ifdef LAB_FT_UPDATE
  LS_BACKUP,
#endif
  LS_RECEIVE };
static int ls_action_row(u32 i,char *name,char *right,u16 *color){
  (void)right;
  static const char *const actions[]={"LOAD / RESUME","SAVE CURRENT","COPY TO OTHER SLOT","CLEAR THIS SLOT",
    "SEND TO TAMA",
#ifdef LAB_FT_UPDATE
    "BACKUP TO SD",
#endif
    "RECEIVE FROM TAMA"};
  lab_copy_label(name,actions[i]); *color=i==LS_ERASE?RED:WHITE; return 1;
}
static int ls_empty_row(u32 i,char *name,char *right,u16 *color){
  return ls_action_row(i?LS_RECEIVE:LS_SAVE_CURRENT,name,right,color);
}
static void ls_menu(void){
  if(!ls_supported()){ message("SAVE SLOTS UNAVAILABLE","UPDATE THE ROM MENU",""); return; }
  if(!lab_garden_recover() || !ls_recover()){ message("SAVE RECOVERY FAILED","USE FLASH TOOL",""); return; }
  u32 cursor=0;
  for(;;){
    int live=lab_load();
    ls_scan();
    int picked=ls_pick(cursor,live);
    if(picked<0) return;
    cursor=(u32)picked;
    u32 slot=cursor-LS_FIRST_SLOT_ROW;
    int action=-1;
    if(cursor==0){
      if(!live){ message("NO VALID MY LAB SAVE","OPEN MY LAB FIRST",""); continue; }
#ifdef LAB_FT_UPDATE
      static const char *const options[]={"SAVE TO SLOT","BACKUP TO SD"};
      int choice=lab_pick("ACTIVE SAVE",2,options);
      if(choice<0) continue;
      if(choice==1){
        if(save_details_confirm("BACKUP TO SD","ACTIVE SAVE","","",GOLD,"INSERT A MICROSD CARD"))
          flash_tool_sd_backup(LS_BANKS,0,0);
        continue;
      }
#endif
      int dest=lab_select("SAVE TO SLOT",LS_SLOTS,0,ls_destination_row);
      if(dest<0) continue;
      slot=(u32)dest; action=LS_SAVE_CURRENT;
    }
    if(slot==LS_SLOTS){
      if(!save_details_confirm("START NEW GAME","MY LAB","","REPLACES ACTIVE GAME",ORANGE,"SAVE IT TO A SLOT FIRST")) continue;
      ls_busy("STARTING NEW GAME");
      if(ls_load(LS_BANKS)) done_screen("NEW GAME READY",GOLD);
      else message("SAVE RECOVERY FAILED","USE FLASH TOOL","");
      return;
    }
    u32 bank=ls_current(slot);
    char name[12],detail[16]="";
    save_label(slot,name);
    if(bank<LS_BANKS) ls_summary(bank,detail);
    if(action<0){
      action=bank<LS_BANKS?lab_select(name,LS_RECEIVE,0,ls_action_row):lab_select(name,2,0,ls_empty_row);
      if(action<0) continue;
      if(bank==LS_BANKS) action=action?LS_RECEIVE:LS_SAVE_CURRENT;
    }
#ifdef LAB_FT_UPDATE
    if(action==LS_BACKUP){
      if(save_details_confirm("BACKUP TO SD",name,"",detail,GOLD,"INSERT A MICROSD CARD"))
        flash_tool_sd_backup(bank,slot+1,rd32(ls_bank(bank)+12));
      continue;
    }
#endif
    if(action==LS_SEND || action==LS_RECEIVE){
      sl_menu(slot,action==LS_RECEIVE,action==LS_RECEIVE?ls_receive:ls_send);
      continue;
    }
    if(action==LS_RESUME){
      if(!save_details_confirm("LOAD SAVE",name,"",detail,GOLD,"REPLACES ACTIVE GAME")) continue;
      ls_busy("LOADING SAVE");
      if(ls_load(bank)) done_screen("SAVE LOADED",GOLD);
      else message("SAVE RECOVERY FAILED","USE FLASH TOOL","");
      return;
    }
    if(action==LS_SAVE_CURRENT && !live){ message("NO VALID MY LAB SAVE","OPEN MY LAB FIRST",""); continue; }
    u32 target=action==LS_COPY?1u-slot:slot;
    if(action==LS_ERASE){
      if(!clear_save_confirm(name,detail,"")) continue;
    } else {
      char dest[12];
      save_label(target,dest);
      const char *title=action==LS_SAVE_CURRENT?"SAVE CURRENT TO":"COPY SAVE TO";
      const char *note=ls_current(target)<LS_BANKS?"REPLACES THIS SLOT":"";
      if(action==LS_SAVE_CURRENT){ utoa_(lab_u32(LAB_POINTS),detail); lab_copy_label(detail+slen(detail)," PTS"); }
      if(!save_details_confirm(title,dest,action==LS_COPY?name:"",detail,GOLD,note)) continue;
    }
    ls_busy(action==LS_ERASE?"CLEARING SLOT":"SAVING SLOT");
    if(ls_make(target,action==LS_COPY?bank:LS_BANKS,action==LS_ERASE))
      done_screen(action==LS_ERASE?"SAVE SLOT CLEARED":"SAVE SLOT READY",GOLD);
    else message("SLOT WRITE FAILED","PREVIOUS SAVE KEPT","");
  }
}
