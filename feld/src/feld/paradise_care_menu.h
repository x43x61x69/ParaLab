#include "paradise_care.h"

static const struct CareLayout *care_layout(void){
  if(g_cfg.flags&F_CLEAN) return 0;
  switch(g_cfg.tama_off){
    case 0x104u: return &care_layouts[0];
    case 0x108u: return &care_layouts[1];
    case 0x114u: return &care_layouts[(g_cfg.flags&F_NEON_EDIT)?3:2];
    default: return 0;
  }
}
static u32 care_patches(void){
  u32 at=g_cfg.stub_off+CARE_HOOK_OFF;
  if(!care_layout() || g_cfg.stub_off<0x90000u || g_cfg.stub_off>=0x110000u ||
     rd32(at+0x40u)!=CARE_HOOK_MAGIC) return 0;
  return rd32(at+0x58u)==CARE_OPTIONS_MAGIC ? rd32(at+0x5Cu) : CARE_AUTOPILOT_PATCH;
}
static void care_label(char *out,const char *s){ while((*out++=*s++)){} }
static int care_confirm(const char *title,const char *label){
  rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG);
  menu_title(22,title); ctext(53,label,GOLD,1);
  ctext(104,"B SAVE  C CANCEL",GREY,1); show();
  return yes_no();
}
static int care_choose(const char *title,u32 n,u32 sel,int (*row)(u32,char *,char *,u16 *)){
  u32 top=sel<10u?0u:sel-9u;
  for(;;){
    list_draw(title,n,sel,top,row,"B SELECT  C BACK"); wait_release();
    int k=menu_key();
    if(k==K_BACK) return -1;
    if(k==K_OK) return (int)sel;
    if(k!=1 && k!=K_A) continue;
    sel=wrap_step(sel,k==K_A?1:g_step,0,n-1u);
    if(sel<top) top=sel;
    if(sel>=top+10u) top=sel-9u;
  }
}
static int care_value_edit(const char *title,u32 old,u32 max,int mode){
  u32 value=old>max?max:old,step=1u;
  for(;;){
    rect(0,0,FELD_SCREEN_W,FELD_SCREEN_H,BG); menu_title(16,title);
    char str[8]; utoa_(value,str); ctext(38,str,WHITE,3);
    if(mode==2){ ctext(74,"A: CHANGE STEP",GREY,1); utoa_(step,str); ctext(88,str,GOLD,1); }
    else ctext(75,mode==1?"A: FILL / CHANGE":"WHEEL / A: CHANGE",GREY,1);
    ctext(103,mode<0?"B NEXT  C BACK":"B REVIEW  C BACK",GREY,1); show(); wait_release();
    int k=menu_key();
    if(k==K_BACK) return -1;
    if(k==K_A || k==1){
      if(k==K_A && mode==2) step=step==100u?1u:step*10u;
      else if(mode==2){
        int next=(int)value+(g_step>0?(int)step:-(int)step);
        value=next<0?max:(u32)next>max?0u:(u32)next;
      }
      else if(k==K_A && mode==1 && value<max) value=max;
      else value=wrap_step(value,k==K_A?1:g_step,0,max);
      continue;
    }
    if(k==K_OK){
      if(mode<0) return (int)value;
      if(value==old) return -1;
      utoa_(value,str);
      if(care_confirm(title,str)) return (int)value;
    }
  }
}
static void care_fuel_menu(void){
  if(care_patches()&CARE_FUEL_PATCH){ message("TRAVEL FUEL","ALWAYS FULL",""); return; }
  u32 at=g_cfg.tama_off+0x1Bu;
  int value=care_value_edit("TRAVEL FUEL",g_set[at],CARE_FUEL_MAX,1);
  if(value<0) return;
  g_set[at]=(u8)value; set_write("FUEL SAVED");
}
static u32 care_cleanliness(const struct CareLayout *layout){
  if(g_set[layout->pet+0x14u]&0x10u) return 0;
  u32 dirt=g_set[layout->dirt];
  return dirt<3u?3u-dirt:0u;
}
static void care_edit_condition(const struct CareLayout *layout,int illness){
  u8 *health=g_set+layout->pet+0x10u;
  int value=care_value_edit(illness?"ILLNESS (0-1)":"CLEANLINESS (0-3)",
      illness?*health!=0:care_cleanliness(layout),illness?1u:3u,0);
  if(value<0) return;
  if(illness){
    care_heal(g_set,layout);
    if(value) *health=2; /* Ordinary sickness in the native game. */
  }else care_set_dirt(g_set,layout,3u-(u32)value);
  set_write("CARE SAVED");
}
#ifndef FELD_CLEAN
enum { CELL_MEALS, CELL_HAPPY, CELL_MISTAKES, CELL_VITAMIN, CELL_FIELD };
enum { CELL_FIELD_CAP=11, CELL_MISTAKE_CAP=6 };
/* Multi-field DNA stores slot + 3 for the fields in the alternate bank. */
#define CELL_DNA_MARK 0xF0Fu
static int cell_split(void){ return g_cfg.nfields>3u && (fl(0x10F020u)[0]&8u); }
static u32 cell_field_id(u32 row){ return g_cfg.nfields==4u && row==3u ? 4u : row; }
static u32 cell_legacy_id(u32 slot){
  if(slot<3u && g_set[0xF04u]==1u && (g_cfg.nfields==6u || slot==1u)) return slot+3u;
  return slot;
}

static const char *cell_label(u32 row){
  static const char *const labels[]={"FULL MEALS","FULL HAPPINESS","CARE MISTAKES","VITAMIN"};
  if(row<CELL_FIELD) return labels[row];
  u32 field=row-CELL_FIELD;
  if(!cell_split() && g_cfg.six_off) field=g_cfg.six_map[(g_set[g_cfg.six_off]==1u?4u:0u)+field];
  return fname(field);
}
static u8 *cell_counter(u32 row){
  /* Offsets relative to the Tama record in the CRC-prefixed settings page. */
  static const u8 rel[]={0x3A,0x3B,0x1E,0x14,0x21};
  return g_set+g_cfg.tama_off+rel[row<CELL_FIELD?row:CELL_FIELD]
      +(row<CELL_MISTAKES && (g_cfg.flags&F_NEON_EDIT)?1u:0u);
}
static u32 cell_field_count(const u8 *cells,u32 field){
  int legacy=cell_split() && g_set[CELL_DNA_MARK]!=0x5Au;
  u32 count=0;
  for(u32 i=1u;i<=cells[0] && i<=CELL_FIELD_CAP;i++)
    count+=(legacy?cell_legacy_id(cells[i]):cells[i])==field;
  return count;
}
static void cell_field_set(u8 *cells,u32 field,u32 value){
  if(cell_split() && g_set[CELL_DNA_MARK]!=0x5Au){
    for(u32 i=1u;i<=cells[0];i++) cells[i]=(u8)cell_legacy_id(cells[i]);
    /* Mirror dna_init's empty per-field stash and migration marker. */
    for(u32 i=0xF10u;i<(g_cfg.nfields==6u?0xF71u:0xF11u);i++) g_set[i]=0;
    g_set[CELL_DNA_MARK]=0x5Au;
  }
  u32 end=cells[0]+1u, remaining=value, write=1u;
  for(u32 i=1u;i<end;i++){
    if(cells[i]==field){
      if(!remaining) continue;
      remaining--;
    }
    cells[write++]=cells[i];
  }
  while(remaining){ cells[write++]=(u8)field; remaining--; }
  cells[0]=(u8)(write-1u);
  while(write<end) cells[write++]=0;
}
static void cell_mistakes_set(u8 *pet,u32 value){
  u32 visible=value<CELL_MISTAKE_CAP?value:CELL_MISTAKE_CAP;
  pet[0x1E]=value;
  for(u32 i=0;i<CELL_MISTAKE_CAP;i++){
    if(i>=visible) pet[0x34+i]=0;
    else if(i>=pet[0x33] || !pet[0x34+i]) pet[0x34+i]=0x11; /* missed meal */
  }
  pet[0x33]=visible;
}
static int cell_row(u32 row,char *name,char *right,u16 *col){
  if(row>=CELL_FIELD){ care_label(name,"CELL "); name+=5; }
  care_label(name,cell_label(row));
  u8 *at=cell_counter(row);
  if(row==CELL_VITAMIN) care_label(right,*at&2u?"ON":"OFF");
  else utoa_(row<CELL_FIELD?*at:cell_field_count(at,cell_split()?cell_field_id(row-CELL_FIELD):row-CELL_FIELD),right);
  return 1;
}
static void cell_edit(u32 selected){
  u8 *at=cell_counter(selected);
  u32 field=selected-CELL_FIELD;
  if(selected>=CELL_FIELD && cell_split()) field=cell_field_id(field);
  u32 old=*at, max=99u;
  if(selected==CELL_VITAMIN){
    if(!care_confirm("VITAMIN",old&2u?"TURN OFF":"TURN ON")) return;
    *at=old&2u?old&~2u:(old&16u)|2u; /* Native immunity replaces other temporary conditions. */
  }else{
    if(selected==CELL_MISTAKES) max=255u;
    if(selected>=CELL_FIELD){
      if(old>CELL_FIELD_CAP){ message("INVALID FIELD CELLS","",""); return; }
      u32 count=cell_field_count(at,field);
      max=CELL_FIELD_CAP-old+count;
      old=count;
    }
    int value=care_value_edit(cell_label(selected),old,max,0);
    if(value<0) return;
    if(selected==CELL_MISTAKES) cell_mistakes_set(g_set+g_cfg.tama_off,(u32)value);
    else if(selected>=CELL_FIELD) cell_field_set(at,field,(u32)value);
    else *at=(u8)value;
  }
  set_write("CARE SAVED");
}
#endif
static u32 star_offset(u32 i){ return care_layout()->stars+4u*i; }
static u32 star_word(u32 i){
  const u8 *p=g_set+star_offset(i);
  return p[0]|((u32)p[1]<<8)|((u32)p[2]<<16)|((u32)p[3]<<24);
}
static u32 star_age_shift(void){ return (g_cfg.flags&F_NEON_EDIT)?13u:4u; }
static u32 star_age_max(void){ return (g_cfg.flags&F_NEON_EDIT)?1023u:255u; }
static u32 star_age(u32 bits){ return (bits>>star_age_shift())&star_age_max(); }
static u32 star_with_age(u32 value,u32 age){
  u32 mask=(star_age_max()<<star_age_shift())|0x1000u;
  return (value&~mask)|(age<<star_age_shift())|(age>29u?0x1000u:0u);
}
static void star_write(u32 i,u32 value){
  u8 *p=g_set+star_offset(i);
  for(u32 j=0;j<4u;j++) p[j]=(u8)(value>>(8u*j));
}
static int star_row(u32 i,char *name,char *right,u16 *color){
  care_label(name,"STAR "); name[5]=(char)('1'+i); name[6]=0;
  u32 value=star_word(i);
  if(value&1u){
    right[0]='D'; right[1]=' '; utoa_(star_age(value),right+2); *color=GOLD;
  }else care_label(right,"EMPTY");
  return 1;
}
#ifndef FELD_CLEAN
static void star_appearance(u32 slot);
/* The list is in native cause-code order, starting at 1. */
static const char *const star_causes[]={"TAMA SICK","UNKNOWN (2)","HUNGER","UNKNOWN (4)"};
static int star_cause_row(u32 i,char *name,char *right,u16 *color){
  care_label(name,star_causes[i]);
  right[0]=0; *color=WHITE; return 1;
}
static void star_edit_cause(u32 slot,u32 value){
  u32 current=(value>>1)&7u;
  int selected=care_choose("EDIT CAUSE",4u,current>=1u && current<=4u?current-1u:0u,star_cause_row);
  if(selected<0) return;
  u32 cause=1u+(u32)selected;
  if(cause==current || !care_confirm("SAVE CAUSE?",star_causes[selected])) return;
  star_write(slot,(value&~0xEu)|(cause<<1));
  set_write("CAUSE SAVED");
}
/* A new record remains a draft until both details have been confirmed. */
static u32 star_create_details(void){
  u32 age=0;
  for(;;){
    int next=care_value_edit("STAR AGE (DAYS)",age,star_age_max(),-1);
    if(next<0) return 0;
    age=(u32)next;
    int cause=care_choose("CHOOSE CAUSE",4u,0,star_cause_row);
    if(cause>=0 && care_confirm("ADD PAST TAMA?",star_causes[cause]))
      return star_with_age(3u+2u*(u32)cause,age);
  }
}

#endif
static int star_action_row(u32 i,char *name,char *right,u16 *color){
  static const char *const actions[]={"EDIT AGE","DELETE STAR","EDIT APPEARANCE","EDIT CAUSE"};
  care_label(name,actions[i]); right[0]=0;
  *color=i==1u?ORANGE:WHITE; return 1;
}
static void stars_menu(void){
  u32 selected=0;
  for(;;){
    int i=care_choose("PAST TAMAS",5u,selected,star_row);
    if(i<0) return;
    selected=(u32)i;
    u32 value=star_word(selected);
    if(!(value&1u)){
#ifndef FELD_CLEAN
      star_appearance(selected);
#else
      message("EMPTY MEMORIAL SLOT","","");
#endif
      continue;
    }
    char name[24],detail[8]; u16 color;
    star_row(selected,name,detail,&color);
    u32 actions=2;
#ifndef FELD_CLEAN
    actions=4;
#endif
    int action=care_choose(name,actions,0,star_action_row);
#ifndef FELD_CLEAN
    if(action==2){ star_appearance(selected); continue; }
    if(action==3){ star_edit_cause(selected,value); continue; }
#endif
    if(action==0){
      int age=care_value_edit("STAR AGE (DAYS)",star_age(value),star_age_max(),0);
      if(age<0) continue;
      star_write(selected,star_with_age(value,(u32)age));
      set_write("STAR SAVED");
    }else if(action==1){
      u8 *index=g_set+care_layout()->stars-4u;
      u32 latest=(*index>>3)&7u;
      if(!t_alive() && latest==selected){ message("CURRENT MEMORIAL","HATCH AN EGG FIRST",""); continue; }
      if(!care_confirm("DELETE STAR?",name)) continue;
      star_write(selected,value&~1u);
      if(latest==selected){
        for(u32 n=1;n<5u;n++){
          u32 other=(selected+5u-n)%5u;
          if(!(star_word(other)&1u)) continue;
          *index=(u8)((*index&~0x38u)|(other<<3)); break;
        }
      }
      set_write("STAR DELETED");
    }
  }
}
