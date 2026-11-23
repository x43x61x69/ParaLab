/* Native My Lab microSD ROM update, entered locally while PAU1 is idle. */
#include "sd_fat.h"

#define SD_BOOT_COPY 0x18D000u
#define SD_BOOT_CRC 0x3A4F8F7Du
#define SD_NATIVE_END 0x36000u
#define SD_RESCUE_TABLE 0xFFE000u
#define SD_ARC 0x211000u
#define SD_MENU 0x37000u
#define SD_META 0x19D000u
#define SD_SECTOR 0x1000u
#define SD_VISIBLE 5u
#define SD_A (1u<<15)
#define SD_B (1u<<14)
#define SD_C (1u<<13)

static u32 *const sd_crcs=(u32*)RXACC; /* 16 KiB, shared with idle UART */
static u8 *const sd_header=(u8*)OUTF; /* original boot header, restored last */
static u32 *const sd_entry_armed=(u32*)0x1801A824u;
static u32 *const sd_uart_seen=(u32*)0x1801A828u;
static u32 *const sd_previous_keys=(u32*)0x1801A82Cu;

static void sd_feed(void){
  REG(0x4000800Cu)=0x5AFA55AAu;
  REG(0x4000900Cu)=0x5AFA55AAu;
}
static u32 sd_crc(u32 crc,const volatile u8 *p,u32 n){
  static const u32 nibble[16]={
    0,0x1DB71064,0x3B6E20C8,0x26D930AC,0x76DC4190,0x6B6B51F4,0x4DB26158,0x5005713C,
    0xEDB88320,0xF00F9344,0xD6D6A3E8,0xCB61B38C,0x9B64C2B0,0x86D3D2D4,0xA00AE278,0xBDBDF21C
  };
  while(n--){
    crc^=*p++;
    crc=(crc>>4)^nibble[crc&15];
    crc=(crc>>4)^nibble[crc&15];
  }
  return crc;
}

static void sd_glyph(u32 x,u32 y,u16 ch,u16 color){
  if(ch=='_'){
    for(u32 col=0;col<5;col++) fb[fb_index(x+col,y+6)]=color;
    return;
  }
  if(ch=='~'){
    fb[fb_index(x,y+4)]=color;
    fb[fb_index(x+4,y+3)]=color;
    fb[fb_index(x+3,y+4)]=color;
    fb[fb_index(x+2,y+4)]=color;
    fb[fb_index(x+1,y+3)]=color;
    return;
  }
  if(ch<32 || ch>126) ch='?';
  if(ch>='a' && ch<='z') ch-=32; /* The built-in device font is uppercase. */
  for(u32 row=0;row<7;row++)
    for(u32 col=0;col<5;col++)
      if(g_font[ch-32][row]&(16u>>col)) fb[fb_index(x+col,y+row)]=color;
}
static void sd_text(u32 x,u32 y,const char *p,u16 color){
  while(*p && x+5<SCR_W){ sd_glyph(x,y,(u8)*p++,color); x+=6; }
}
static void sd_number(u32 x,u32 y,u32 value,u16 color){
  u8 digits[10];
  u32 n=0;
  do { digits[n++]='0'+value%10; value/=10; } while(value);
  while(n && x+5<SCR_W){ sd_glyph(x,y,digits[--n],color); x+=6; }
}
static void sd_name(u32 x,u32 y,const u16 *name,u32 limit,u16 color,int wrap){
  u32 n=0;
  while(n<255 && name[n]) n++;
  if(!wrap && n>limit){
    for(u32 i=0;i<limit-6;i++) sd_glyph(x+6*i,y,name[i],color);
    sd_text(x+6*(limit-6),y,"..",color);
    for(u32 i=0;i<4;i++) sd_glyph(x+6*(limit-4+i),y,name[n-4+i],color);
    return;
  }
  for(u32 i=0;i<n;i++) sd_glyph(x+6*(i%limit),y+8*(i/limit),name[i],color);
}
static void sd_screen(const char *title,const char *footer){
  for(u32 i=0;i<SCR_W*SCR_H;i++) fb[i]=UI_BG;
  sd_text(5,3,title,UI_ORANGE);
  sd_text(5,117,footer,UI_GREY);
}
static void sd_message(const char *title,const char *message){
  sd_screen(title,"C BACK");
  sd_text(5,49,message,UI_WHITE);
  push_fb();
}
static u32 sd_keys(void){ return ~REG(GPIO1)&(SD_A|SD_B|SD_C); }
static u32 sd_wait_key(u32 accept){
  for(;;){
    sd_feed();
    u32 raw=sd_keys();
    *sd_previous_keys&=raw;
    u32 pressed=raw&accept&~*sd_previous_keys;
    if(pressed){
      MS(8);
      pressed&=sd_keys();
      if(pressed){ *sd_previous_keys|=pressed; return pressed; }
    }
  }
}

static void sd_hex(u32 x,u32 y,u32 word){
  static const char digits[]="0123456789ABCDEF";
  for(int shift=28;shift>=0;shift-=4,x+=6)
    sd_glyph(x,y,digits[(word>>shift)&15u],UI_WHITE);
}

static int sd_hw_read(u32 lba,u8 *out,u32 count){
  typedef int (*NativeRead)(u8 *,u32,u32);
  sd_feed();
  return ((NativeRead)0x10009179u)(out,lba,count)==0;
}
#include "my_lab_sd_guard.h"
/* The stock SD logger calls the PRAM formatter from 0x100170D4.
 * Its format parser also calls helpers above 0x8000, where this tool
 * is running. Keep the first format-string address for diagnostics and
 * return an empty log line. Other formatter callers keep their ABI. */
#define SD_FIRST_LOG (SD_RESET_BOX+28)
__attribute__((naked,used)) static void sd_log_formatter(void){
  __asm__ volatile(
    "ldr r12, =0x100170D9\n"
    "cmp lr, r12\n"
    "bne 2f\n"
    "ldr r12, =" SD_STRING(SD_FIRST_LOG) "\n"
    "ldr r3, [r12]\n"
    "cbnz r3, 1f\n"
    "str r2, [r12]\n"
    "1: movs r1, #0\n"
    "strb r1, [r0]\n" /* stock logger always supplies a 256-byte buffer */
    "mov r0, r1\n"
    "bx lr\n"
    /* Replay the stock formatter's first eight bytes, including flags. */
    "2: push {r2-r6, lr}\n"
    "mov r5, r3\n"
    "mov r6, r2\n"
    "movs r4, r1\n"
    "ldr pc, =0x3E5\n.ltorg\n");
}
/* Restore the native PRAM and leave IRQ 15 at its stock vector. Other
 * peripheral interrupts stay masked because they depend on game state. */
static int sd_hw_prepare(void){
  const volatile u8 *boot=(const volatile u8*)(0x60000000u+SD_BOOT_COPY);
#ifdef FLASH_UART_BOOTSTRAP
  if(~sd_crc(0xFFFFFFFFu,boot,0x8000u)!=0x7500E0D0u) return 0;
#else
  if(~sd_crc(0xFFFFFFFFu,boot,0x10000u)!=SD_BOOT_CRC) return 0;
#endif
  __asm__ volatile("cpsid i":::"memory");
  REG(SD_TICK_CSR)=0;
  *sd_guard_sp=0;
  REG(0xE000E180u)=0xFFFFFFFFu;
  REG(0xE000E184u)=0xFFFFFFFFu;
  REG(0xE000E280u)=0xFFFFFFFFu;
  REG(0xE000E284u)=0xFFFFFFFFu;
  REG(0xE000ED04u)=(1u<<27)|(1u<<25);
  /* The native lower PRAM includes vectors and code used by the SD driver. */
  u32 to=0, from=0x60000000u+SD_BOOT_COPY, count=0x8000u/4u, word;
  __asm__ volatile(
    "1: ldr %[word], [%[from]], #4\n"
    "str %[word], [%[to]], #4\n"
    "subs %[count], #1\n"
    "bne 1b"
    : [to] "+r"(to), [from] "+r"(from), [count] "+r"(count), [word] "=&r"(word)
    :: "cc","memory");
  /* This copy is CRC-checked above. Redirect only the working PRAM. */
  REG(0x3DCu)=0xF000F8DFu; /* ldr.w pc, [pc] */
  REG(0x3E0u)=(u32)sd_log_formatter;
  REG(SD_FIRST_LOG)=0;
  /* The My Lab boot clock mask contains bit 6, which the Paradise-derived
   * Flash Tool mask omits. The native SD driver can also log to UART0 and
   * wait for its transmitter, so initialize it independently of PAU1. */
  REG(CLK+0x100u)|=1u<<6;
  /* Settings > Update reaches the first SD command with this register
   * clear. The bootloader-only probe used for plus.10 had bit 6 set. */
  REG(CLK+0x20u)=0;
  /* Panel setup leaves P2.3 in mode 2. The stock Settings updater
   * drives the same output low in mode 0 at the first SD command. */
  REG(GPIO2+0x08)&=~(3u<<6);
  uart_setup(0x4000A000u);
  *(volatile u8*)0x1800001Cu=0;
  /* Keep VTOR at the native base, avoiding a partial table in upper PRAM.
   * Install the Flash Tool's deadline and fault handlers alongside it. */
  REG(0x0Cu)=(u32)sd_fault;
  REG(0x10u)=(u32)sd_fault;
  REG(0x14u)=(u32)sd_fault;
  REG(0x18u)=(u32)sd_fault;
  REG(0x3Cu)=(u32)sd_systick;
  REG(0xE000ED20u)&=0x00FFFFFFu; /* SysTick can preempt the native SD IRQ */
  REG(0xE000ED08u)=0;
  /* The card controller completes commands through IRQ 15. Restore that
   * interrupt after installing the stock vector; PRIMASK alone cannot
   * re-enable an IRQ disabled in NVIC above. */
  REG(0xE000E100u)=1u<<15;
  dsb();
  __asm__ volatile("isb\ncpsie i":::"memory");
  return 1;
}
static int sd_hw_filesystem(SdFat *fs){
  typedef int (*NativeIoctl)(u32,u32 *);
  u32 cap[2];
  if(((NativeIoctl)0x10009111u)(1,cap) || cap[1] || !cap[0]) return SD_NO_RESPONSE;
  sd_guard_phase(SD_PHASE_FILESYSTEM);
  fs->sectors=cap[0];
  fs->block=dma;
  fs->read=sd_hw_read;
  return sd_mount(fs);
}
static int sd_mount_card(void *arg){
  typedef int (*NativeInit)(void);
  /* Check that a SysTick exception can return before calling into ROM. */
  for(u32 spins=0;*sd_guard_ticks==SD_TIMEOUT_TICKS;spins++){
    if(spins==1500000u) return SD_IRQ_FAILED;
  }
  sd_guard_phase(SD_PHASE_XIP);
  /* The stock loader writes the mapped base twice and checks the mapping
   * against uncached flash before it executes through this window. */
  REG(0x4002F004u)=0x60011000u;
  REG(0x4002F004u)=0x60011000u;
  REG(0x4002F000u)=3u;
  dsb();
  __asm__ volatile("isb":::"memory");
  if(REG(0x10000000u)!=REG(0x60011000u) ||
     REG(0x10009150u)!=0xB082B580u ||
     REG(0x10009178u)!=0xB084B580u ||
     REG(0x1000CF68u)!=0xAF02B5D0u ||
     REG(0x100170D4u)!=0xF8E7F003u) return SD_XIP_FAILED;

  sd_guard_phase(SD_PHASE_CARD);
  if(((NativeInit)0x10009151u)()!=0) return SD_NO_RESPONSE;
  sd_guard_phase(SD_PHASE_CAPACITY);
  return sd_hw_filesystem(arg);
}
static int sd_hw_open(SdFat *fs){
  if(!sd_hw_prepare()) return SD_DRIVER_MISSING;
  return sd_guarded(sd_mount_card,fs,SD_PHASE_TICK);
}
static const char sd_no_response[]="NO CARD RESPONSE";
static const char sd_fault_message[]="SD CONTROLLER FAULT";
static const char *sd_open_error(int result){
  switch(result){
    case SD_DRIVER_MISSING: return "SD DRIVER COPY INVALID";
    case SD_IRQ_FAILED: return "SD IRQ SELF-TEST FAILED";
    case SD_XIP_FAILED: return "SD ROM MAPPING FAILED";
    case SD_FAULT: return sd_fault_message;
    case SD_TIMED_OUT: return "CARD READ TIMED OUT";
    case SD_NO_RESPONSE: return sd_no_response;
    default: return "CHECK CARD FORMAT";
  }
}
static const char *sd_phase_name(u32 phase){
  static const char *const phases[]={
    "UNKNOWN STAGE","INTERRUPT CHECK","ROM MAPPING","CARD INITIALIZATION",
    "CARD CAPACITY","READING CARD FORMAT","READING DIRECTORY","WRITING BACKUP"
  };
  return phases[phase<sizeof phases/sizeof phases[0]?phase:0];
}
static void sd_show_error(const char *title,const char *message){
  if(message==sd_no_response && REG(SD_FIRST_LOG)){
    sd_screen(title,"C BACK");
    sd_text(5,38,message,UI_ORANGE);
    sd_text(5,58,"LOG",UI_GREY);
    sd_hex(35,58,REG(SD_FIRST_LOG));
    push_fb();
    return;
  }
  if(message!=sd_fault_message){
    sd_message(title,message);
    return;
  }
  sd_screen(title,"C BACK");
  sd_text(5,25,message,UI_ORANGE);
  sd_text(5,38,sd_phase_name(sd_last_fault->phase),UI_WHITE);
  sd_text(5,53,"PC",UI_GREY);
  sd_hex(35,53,sd_last_fault->pc);
  sd_text(5,66,"CFSR",UI_GREY);
  sd_hex(35,66,sd_last_fault->cfsr);
  sd_text(5,79,"HFSR",UI_GREY);
  sd_hex(35,79,sd_last_fault->hfsr);
  if(sd_last_fault->cfsr&((1u<<15)|(1u<<7))){
    sd_text(5,92,"ADDR",UI_GREY);
    sd_hex(35,92,sd_last_fault->address);
  } else {
    sd_text(5,92,"LR",UI_GREY);
    sd_hex(35,92,sd_last_fault->lr);
    sd_text(5,105,"XPSR",UI_GREY);
    sd_hex(35,105,sd_last_fault->xpsr);
  }
  push_fb();
}
static void sd_sample_details(u32 phase){
  if(phase!=SD_PHASE_CARD) return;
  sd_text(5,90,"LR",UI_GREY);
  sd_hex(35,90,REG(SD_RESET_BOX+20));
  sd_text(5,102,"CTRL",UI_GREY);
  sd_hex(35,102,REG(SD_RESET_BOX+24));
}
static void sd_reset_report(u32 phase,u32 pc,u32 ticks){
  sd_screen("SD CARD","C BACK");
  sd_text(5,31,"SD CHECK INTERRUPTED",UI_ORANGE);
  sd_text(5,47,sd_phase_name(phase),UI_WHITE);
  sd_text(5,64,"PC",UI_GREY);
  sd_hex(23,64,pc);
  sd_text(5,78,"TICKS",UI_GREY);
  sd_number(41,78,ticks,UI_WHITE);
  sd_sample_details(phase);
  push_fb();
  *sd_previous_keys=sd_keys();
  sd_wait_key(SD_C);
}
static void sd_hw_close(void){
  __asm__ volatile("cpsid i":::"memory");
  REG(SD_TICK_CSR)=0;
  REG(0xE000ED04u)=SD_TICK_CLEAR;
  REG(0xE000E180u)=1u<<15;
  REG(0x40024000u)=0; /* Disable the SD engine before reusing its SRAM buffers. */
  REG(0xE000E280u)=1u<<15;
  REG(CLK+0x20u)=0x42u; /* Idle display and UART setting. */
  REG(GPIO2+0x08)=(REG(GPIO2+0x08)&~(3u<<6))|(2u<<6);
  flashctl_init();
}

/* Flash and card images use the same layout as Studio's native My Lab
 * writer. Leave the boot driver, cold entry, protected rescue, and all
 * save blocks in place while the card is in use. */
typedef struct { int keep_saves, only_changes; } SdWriteOptions;
static int sd_keep(u32 off,SdWriteOptions options){
  return off==0x50000u || (off>=SD_BOOT_COPY && off<SD_META) ||
    (off>=0xFC0000u && (off<0xFD0000u || off>=0xFEC000u)) ||
    (options.keep_saves && ((off>=0xA6C000u && off<0xC64000u) || off==0xC65000u ||
      (off>=0xCA1000u && off<0xE00000u) || (off>=0xFD0000u && off<0xFEC000u)));
}
static int sd_match(const u8 *a,const volatile u8 *b,u32 n){
  while(n--) if(*a++!=*b++) return 0;
  return 1;
}
static const volatile u8 *sd_flash(u32 off){ return (const volatile u8*)(0x60000000u+off); }
static int sd_tag(const u8 *p,const char *s){
  while(*s) if(*p++!=(u8)*s++) return 0;
  return 1;
}
static int sd_table(const u8 *p,u32 config,u32 start,u32 size){
  if(!sd_tag(p,"SONIXDEV") || rd32(p+8)!=config || rd32(p+0x10)!=0x60000000u+start ||
     rd32(p+0x14)!=size || rd32(p+0x1F8)!=0x5A5A0033u) return 0;
  u32 sum=0;
  for(u32 i=0;i<0x1FC;i+=4) sum+=rd32(p+i);
  return sum==rd32(p+0x1FC);
}
static int sd_primary(void){
  if(!sd_tag(sec,"SONIXDEV") || rd32(sec+8)!=0x13 || rd32(sec+0x10)!=0x60001000u ||
     rd32(sec+0x14)!=0x10000u || rd32(sec+0x24)!=SD_BOOT_CRC ||
     rd32(sec+0x1F8)!=0x5A5A0033u) return 0;
  if(reset_boot_valid()) return sd_match(sec,sd_flash(0),SD_SECTOR);
  const volatile u8 *rescue=sd_flash(SD_RESCUE_TABLE);
  /* Match the boot identity retained by the protected rescue table. */
  return sd_match(sec+0x0C,rescue+0x0C,4) && sd_match(sec+0x18,rescue+0x18,12) &&
         sd_match(sec+0x28,rescue+0x28,0x80-0x28) &&
         sd_match(sec+0x84,rescue+0x84,0x1FC-0x84) &&
         sd_match(sec+0x200,rescue+0x200,SD_SECTOR-0x200);
}
static int sd_rescue_ok(void){
  for(u32 i=0;i<0x200u;i++) sec[i]=sd_flash(SD_RESCUE_TABLE)[i];
  return sd_table(sec,0x12,MY_LAB_RESCUE,0xE000) &&
    ~sd_crc(0xFFFFFFFFu,(const volatile u8*)(0x60000000u+MY_LAB_RESCUE),0xE000)==rd32(sec+0x24);
}
static int sd_read_page(SdFat *fs,SdStream *stream){
  return sd_file_read(fs,stream,sec,SD_SECTOR/512);
}
static void sd_rom_screen(const char *title,const char *footer){
  sd_screen(title,footer);
  sd_text(5,99,"DO NOT REMOVE MICROSD",UI_ORANGE);
}
static const char *sd_check(SdFat *fs,const SdEntry *entry,SdWriteOptions options,u32 *changed){
  if(entry->size!=FLASH_SIZE){
    SdStream prefix;
    sd_file_open(&prefix,entry);
    if(entry->size>=512 && sd_file_read(fs,&prefix,sec,1) && sd_tag(sec,"BTPUPPKG"))
      return "USE MY LAB SETTINGS";
    return "EXPECTED A 16 MB ROM";
  }
  if(!sd_rescue_ok()) return "RESCUE CHECK FAILED";
  SdStream stream;
  sd_file_open(&stream,entry);
  u32 wanted_menu=0,menu_length=0,menu_crc=0xFFFFFFFFu;
  u32 arc_end=0,wanted_arc=0,arc_sum=0;
  *changed=0;
  sd_rom_screen("CHECKING SD ROM","C CANCEL");
  for(u32 off=0;off<FLASH_SIZE;off+=SD_SECTOR){
    if(!(off&0x7FFFFu)){
      if(sd_keys()&SD_C) return "CHECK CANCELLED";
      draw_live(st_comparing,off,FLASH_SIZE);
    }
    if(!sd_read_page(fs,&stream)) return "SD READ ERROR";
    if(!off){
      if(sd_tag(sec,"BTPUPPKG")) return "USE MY LAB SETTINGS";
      if(!sd_primary()) return "DIFFERENT BOOT ROM";
      for(u32 i=0;i<SD_SECTOR;i++) sd_header[i]=sec[i];
    }
    if(off>=0x1000u && off<SD_NATIVE_END){
      if(!sd_match(sec,sd_flash(off),SD_SECTOR)) return "DIFFERENT BOOT ROM";
    }
    if(off==SD_MENU && (rd32(sec+0x140)!=0x444C4546u || rd32(sec+0x160)!=0x36000u))
      return "NEEDS MY LAB PARAMIX";
    if(off>=SD_MENU && off<SD_MENU+0xE000u){
      /* The menu descriptor appears later in the file. Save the CRC at
       * each allowed length, in the reply buffer next to the header. */
      menu_crc=sd_crc(menu_crc,sec,SD_SECTOR);
      ((u32*)(sd_header+SD_SECTOR))[(off-SD_MENU)/SD_SECTOR]=~menu_crc;
    }
    if(off==SD_META){
      if(!sd_tag(sec+0x100,"PXMLAB02")) return "NEEDS MY LAB PARAMIX";
      menu_length=rd32(sec+0x108);
      wanted_menu=rd32(sec+0x10C);
      if(!menu_length || menu_length>0xE000u || (menu_length&(SD_SECTOR-1)) ||
         ((u32*)(sd_header+SD_SECTOR))[menu_length/SD_SECTOR-1]!=wanted_menu)
        return "MENU CHECK FAILED";
    }
    if(off==SD_ARC){
      u32 length=rd32(sec+8);
      if(!sd_tag(sec,"ARC2") || length<4 || length>0xA6B000u-SD_ARC-16u)
        return "ASSET DATA INVALID";
      arc_end=SD_ARC+16u+length;
      wanted_arc=rd32(sec+4);
    }
    if(off>=SD_ARC && off<arc_end){
      u32 limit=arc_end-off<SD_SECTOR ? arc_end-off:SD_SECTOR;
      for(u32 i=off==SD_ARC?8:0;i<limit;i++) arc_sum+=sec[i];
    }
    if(off>=SD_NATIVE_END && !sd_keep(off,options)){
      sd_crcs[off/SD_SECTOR]=~sd_crc(0xFFFFFFFFu,sec,SD_SECTOR);
      if(!options.only_changes || !sd_match(sec,sd_flash(off),SD_SECTOR)) (*changed)++;
    }
  }
  if(arc_sum!=wanted_arc) return "ASSET CHECK FAILED";
  draw_live(st_comparing,FLASH_SIZE,FLASH_SIZE);
  return 0;
}

static int sd_write(u32 off){
  /* Never let the SD IRQ fetch XIP code during SPI NOR programming. */
  __asm__ volatile("cpsid i":::"memory");
  prog_sector_fu(off,SECBUF);
  flashctl_init();
  __asm__ volatile("cpsie i":::"memory");
  return sd_match(sec,sd_flash(off),SD_SECTOR);
}
static const char *sd_update(SdFat *fs,const SdEntry *entry,SdWriteOptions options,u32 changed){
  if(!changed && reset_boot_valid()) return 0;
  if(!sd_rescue_ok()) return "RESCUE CHECK FAILED";
  g_reset->writing=1;
  sd_rom_screen("WRITING SD ROM","KEEP POWER ON");
  draw_live(st_writing,0,changed+1);
  for(u32 i=0;i<SD_SECTOR;i++) sec[i]=0xFF;
  if(!sd_write(0)) return "HEADER ERASE FAILED";

  SdStream stream;
  sd_file_open(&stream,entry);
  u32 written=0;
  for(u32 off=0;off<(options.keep_saves?0xFC0000u:0xFEC000u);off+=SD_SECTOR){
    if(!sd_read_page(fs,&stream)) return "SD ERROR - RETRY";
    if(off<SD_NATIVE_END || sd_keep(off,options)) continue;
    if(sd_crcs[off/SD_SECTOR]!=~sd_crc(0xFFFFFFFFu,sec,SD_SECTOR)) return "FILE CHANGED - RETRY";
    if(options.only_changes && sd_match(sec,sd_flash(off),SD_SECTOR)) continue;
    if(!sd_write(off)) return "WRITE ERROR - RETRY";
    written++;
    if(written==1 || !(written&15u) || written==changed)
      draw_live(st_writing,written,changed+1);
  }
  for(u32 i=0;i<SD_SECTOR;i++) sec[i]=sd_header[i];
  if(!sd_write(0)) return "BOOT WRITE FAILED";
  draw_live(st_writing,changed+1,changed+1);
  g_reset->writing=0;
  return 0;
}

static u16 sd_option_color(int enabled){ return enabled?UI_GREEN:UI_GREY; }
static void sd_confirm(SdFat *fs,const SdEntry *entry){
  SdWriteOptions options={1,1};
  u32 selected=0;
  for(;;){
    sd_screen("SD WRITE OPTIONS","A NEXT  B SELECT  C BACK");
    sd_name(5,17,entry->name,24,UI_WHITE,0);
    sd_text(15,39,"KEEP SAVES",UI_WHITE);
    sd_text(135,39,options.keep_saves?"ON":"OFF",sd_option_color(options.keep_saves));
    sd_text(15,56,"ONLY WRITE CHANGES",UI_WHITE);
    sd_text(135,56,options.only_changes?"ON":"OFF",sd_option_color(options.only_changes));
    sd_text(15,73,"CONTINUE",UI_WHITE);
    sd_text(5,39+17*selected,">",UI_GOLD);
    push_fb();
    u32 key=sd_wait_key(SD_A|SD_B|SD_C);
    if(key&SD_C) return;
    if(key&SD_A){ selected=(selected+1)%3; continue; }
    if(selected==2) break;
    if(selected==0) options.keep_saves=!options.keep_saves;
    else options.only_changes=!options.only_changes;
  }
  sd_screen("WRITE SD ROM?","B WRITE  C BACK");
  sd_name(5,18,entry->name,25,UI_WHITE,0);
  sd_text(5,43,options.keep_saves?"KEEP DEVICE SAVES":"REPLACE DEVICE SAVES",sd_option_color(options.keep_saves));
  sd_text(5,61,options.only_changes?"WRITE CHANGED SECTORS":"REWRITE WRITABLE SECTORS",sd_option_color(options.only_changes));
  push_fb();
  if(sd_wait_key(SD_B|SD_C)&SD_C) return;
  u32 changed;
  const char *error=sd_check(fs,entry,options,&changed);
  if(!error && (changed || !reset_boot_valid()) && bat_flash_low(bat_mv())){
    sd_rom_screen("LOW BATTERY","B WRITE ANYWAY  C BACK");
    sd_text(5,49,"POWER LOSS CAN",UI_WHITE);
    sd_text(5,60,"INTERRUPT THE UPDATE",UI_WHITE);
    push_fb();
    if(sd_wait_key(SD_B|SD_C)&SD_C) return;
  }
  if(!error) error=sd_update(fs,entry,options,changed);
  *sd_previous_keys|=sd_keys();
  if(error){
    sd_message("SD UPDATE",error);
    sd_wait_key(SD_C);
  } else {
    sd_screen("SD UPDATE","B RESTART  C BACK");
    sd_text(5,49,changed?"UPDATE COMPLETE":"ROM UP TO DATE",UI_GREEN);
    push_fb();
    if(sd_wait_key(SD_B|SD_C)&SD_B){ sd_hw_close(); reset_system(); }
  }
}
typedef struct { SdFat *fs; SdDirectory *dir; SdEntry *entry; int more; } SdScan;
static int sd_scan_entry(void *arg){
  SdScan *scan=arg;
  scan->more=sd_dir_next(scan->fs,scan->dir,scan->entry);
  return SD_OK;
}
static int sd_browser(SdFat *fs){
  SdDirectory dir;
  SdEntry entries[SD_VISIBLE];
  u32 count=0,index=0,first=0,picked=0;
  int more=1;
  sd_dir_open(fs,&dir);
  for(;;){
    if(index>=first+count && more){
      first=index;
      for(count=0;count<SD_VISIBLE;count++){
        SdScan scan={fs,&dir,&entries[count],0};
        int result=sd_guarded(sd_scan_entry,&scan,SD_PHASE_DIRECTORY);
        if(result!=SD_OK) return result;
        more=scan.more;
        if(more<=0) break;
      }
      if(more<0){ sd_message("SD CARD","DIRECTORY READ ERROR"); break; }
      if(!count){
        if(!index){ sd_message("SD CARD","NO BIN FILES"); break; }
        index=first=0;
        sd_dir_open(fs,&dir);
        more=1;
        continue;
      }
    }
    if(index>=first+count){
      index=first=0;
      count=0;
      more=1;
      sd_dir_open(fs,&dir);
      continue;
    }
    picked=index-first;
    sd_screen("SD CARD ROMS","A NEXT  B OPEN  C BACK");
    for(u32 i=0;i<count;i++){
      u32 y=21+i*17;
      u16 color=i==picked?UI_GOLD:UI_WHITE;
      if(i==picked) sd_text(5,y,">",color);
      sd_name(15,y,entries[i].alias[0]?entries[i].alias:entries[i].name,23,color,0);
    }
    sd_text(5,104,"FILE",UI_GREY);
    sd_number(35,104,index+1,UI_GREY);
    push_fb();
    u32 key=sd_wait_key(SD_A|SD_B|SD_C);
    if(key&SD_C) return SD_OK;
    if(key&SD_B){ sd_confirm(fs,&entries[picked]); continue; }
    index++;
  }
  sd_wait_key(SD_C);
  return SD_OK;
}
static void sd_poll(void){
  if(*sd_uart_seen || g_reset->writing) return;
  if(!(sd_keys()&SD_A)){ *sd_entry_armed=1; return; }
  if(!*sd_entry_armed) return;
  MS(8);
  if(!(sd_keys()&SD_A) || (U_LSR&1u)) return;
  *sd_previous_keys=SD_A;
  SdFat fs;
  sd_screen("SD CARD","C CANCEL");
  sd_text(5,49,"OPENING CARD...",UI_WHITE);
  push_fb();
  int result=sd_hw_open(&fs);
  if(result==SD_OK) result=sd_browser(&fs);
  sd_hw_close();
  if(result!=SD_OK && result!=SD_CANCELLED){
    sd_show_error("SD CARD",sd_open_error(result));
    sd_wait_key(SD_C);
  }
  rp_init(g_reset,!g_reset->writing && reset_boot_valid());
  *sd_entry_armed=0;
  draw(st_ready,0,1);
}

static void sd_ready_hint(const u8 *status){
  static const char hint[]="PRESS A TO LOAD SD CARD";
  /* The 5-pixel glyphs advance by 6 pixels, with no final gap. */
  const u32 width=(sizeof hint-1)*6-1;
  if(status==st_ready && !*sd_uart_seen) sd_text((SCR_W-width)/2,97,hint,UI_GREY);
}
static void sd_uart_activity(void){
  if(*sd_uart_seen) return;
  *sd_uart_seen=1;
  for(u32 y=97;y<104;y++)
    for(u32 x=0;x<SCR_W;x++) fb[fb_index(x,y)]=UI_BG;
}
