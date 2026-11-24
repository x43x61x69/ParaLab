/* Paradise hardware (SNC73410), taken from the mameise flash app
 * (display confirmed on the device). Runs from PRAM 0 after SYSRESETREQ. */
#include "io.h"
#include "hw.h"
#include "disp_power.h"
#define PANEL 0x4000E000u
#define FCTL_ 0x40022000u
#define F_STAT REG(FCTL_+0x000)
#if defined(FELD_MY_LAB) && !defined(FELD_MY_LAB_ON_PARADISE)
/* Native My Lab startup keeps WDT0 fed through the LCD wake delays. */
static void udelay(volatile u32 n){
  while(n--){
    if(!(n & 0x7FFFu)) hw_wdt_feed();
    __asm__ volatile("nop");
  }
}
#else
static void udelay(volatile u32 n){ while(n--) __asm__ volatile("nop"); }
#endif
#define MS(x) udelay((u32)(x)*16000u)
#define BB(reg,bit) (*(volatile u32*)(0x42000000u + (((u32)(reg)-0x40000000u)<<5) + ((u32)(bit)<<2)))
#define GPIO0 0x40018000u
#define GPIO1 0x40019000u
#define GPIO2 0x4001A000u
#define LCD_RST(v) (BB(GPIO0+0x00,4)=(v))
#define LCD_DC(v)  (BB(GPIO0+0x00,5)=(v))
#define SPI_CTRL REG(PANEL+0x00)
#define SPI_STAT REG(PANEL+0x0C)
#define SPI_DATA REG(PANEL+0x1C)
#define SPIWAIT 200000u
#define CT2 0x40002000u
#if defined(FELD_MY_LAB) && !defined(FELD_MY_LAB_ON_PARADISE)
static int my_lab_backlight_started;
#endif
TC_INIT static void clock_init(void){
  REG(CLK+0x00) |= 1u;
  REG(CLK+0x0C) = 0;
  REG(CLK+0x00) = 0x41u;
  { u32 r = (REG(CLK+0x34) & 0xF00u) | 0xA55A0000u; REG(CLK+0x04) = r; }
  REG(CLK+0x18) = 0x21u;
  REG(CLK+0x50) = 0;
  REG(CLK+0x10C) = 0x001FFFFDu;
  REG(CLK+0x110) = 0;
  REG(CLK+0x108) = 0;
  REG(CLK+0x10)  = 0;
  REG(CLK+0x00) |= 0x10u;
  for(u32 g=0; !((REG(CLK+0x08) >> 4) & 1u) && g<4000000u; g++){}
  REG(CLK+0x00) |= 0x4000u;
  REG(CLK+0x04) &= ~1u;
  REG(CLK+0x00) |= 0x8000u;
  for(u32 g=0; !((REG(CLK+0x08) >> 6) & 1u) && g<4000000u; g++){}
  { u32 r = (REG(CLK+0x0C) & ~7u) | 4u; REG(CLK+0x0C) = r; }
  for(u32 g=0; ((REG(CLK+0x0C) >> 4) & 7u) != (REG(CLK+0x0C) & 7u) && g<4000000u; g++){}  /* bounded: never hang forever */
  REG(CLK+0x100) = 0x00157EB7u;
}
TC_INIT static void flashctl_init(void){
  /* 1.4.2: enable XIP. We read through the 0x60000000 window that the XIP block
   * maps in. Without XIP that window only shows the config register (0x40), not
   * the flash data. The real Flash Utility does this at startup, our app did not
   * do it after reset until now. That is exactly what was missing. */
  REG(0x4002F004u)=0x60011000u;
  REG(0x4002F000u)=0x00000003u;
  /* 1.4.1: controller init word for word like the real Flash Utility (0x40022000).
   * This includes setting the read command/mode in 0x008 and 0x00c (0x3077 / 0xf000),
   * otherwise the chip only returns its config register (0x40) instead of flash data. */
  F_STAT=0x0000d018u;
  F_STAT=0x0000d000u;
  F_STAT=0x0000d080u;
  F_STAT=0x0000d088u;
  REG(FCTL+0x008)=0x00003077u;   /* read command/mode */
  REG(FCTL+0x00C)=0x0000f000u;
  REG(FCTL+0x004)=0x00000400u;
  REG(FCTL+0x004)=0x00004000u;
}
TC_INIT static void wdt_off(void){
  /* Set up the system/power block EXACTLY like the real Flash Utility. The only
     point where we deliberately differed before (bit0 of 0x40008000) might be the
     master enable for the display domain. The FU runs with bit0=1 without a
     reset, so we copy it 1:1 and feed the watchdog in the loop. */
  REG(0x4000900Cu)=0x5AFA55AAu; REG(0x40009000u)=0x5AFA0000u;   /* WDT1 */
  REG(0x40008000u)=0x5AFA0000u;                                  /* unlock */
  REG(0x40008004u)=0x5AFA0002u;
  REG(0x40008008u)=0x5AFA00FFu;   /* power/clock domains on (incl. display) */
  REG(0x4000800Cu)=0x5AFA55AAu;   /* feed the watchdog */
  /* Do NOT set bit0 (watchdog enable): otherwise it resets the Tama during
     display init (back to the planet). */
}
TC_INIT static void mailbox_clear(void){
  REG(0x20000000u)=0; REG(0x20000004u)=0; REG(0x20000008u)=0; REG(0x2000000Cu)=0;
}
TC_INIT static void periph_enable(void){ REG(CLK+0x20)=0x40u; }
TC_INIT static void pin_set(u8 id, u8 mode){ *(volatile u8*)(0xE000E400u + id) = (u8)(mode<<4); }
TC_INIT static void pin_mux(void){
  static const u8 m12[]={6,7,8,9,0xf,0x10,0x11,0x12,0x13,0x14,0x19,0x1f,0x20,0x22,
    0x24,0x25,0x2e,0x2f,0x35,0x36,0x1a,0x1b,0x1c,0x26,0x27,0x28,0x29,0x2a,0x2b,0x2c,0x2d,0x3a,0x3f};
  static const u8 m8[]={0,1,2,3};
  static const u8 m4[]={0x15,0x17};
  for(unsigned i=0;i<sizeof m12;i++) pin_set(m12[i],0xC);
  for(unsigned i=0;i<sizeof m8;i++) pin_set(m8[i],0x8);
  for(unsigned i=0;i<sizeof m4;i++) pin_set(m4[i],0x4);
}
#if defined(FELD_MY_LAB) && !defined(FELD_MY_LAB_ON_PARADISE)
static void my_lab_panel_power(void);
#endif
TC_INIT static void display_power(void){
#if defined(FELD_MY_LAB) && !defined(FELD_MY_LAB_ON_PARADISE)
  my_lab_panel_power();
#else
  /* Sequence from the real FU (clock enable, pin setup, timer CT32B3, GPIO1).
     As in the FU, 0x45000210..218 get the current contents of the GPIO
     data registers (the emulator had returned 0 there). */
  for(unsigned i=0;i<DISP_POWER_N;i++){
    u32 a=disp_power_address[disp_power_seq[i][0]], v=disp_power_value[disp_power_seq[i][1]];
    if(a>=0x45000210u && a<=0x45000218u) v=REG(0x4001803Cu + ((a-0x45000210u)>>2)*0x1000u);
    REG(a)=v;
  }
  /* Make sure the panel pins are outputs: reset, D/C, CS (P1.5 low), supply (P1.9 low) */
  LCD_RST(1); BB(GPIO0+0x04,4)=1;
  LCD_DC(0);  BB(GPIO0+0x04,5)=1;
  BB(GPIO1+0x00,5)=0; BB(GPIO1+0x04,5)=1;
  BB(GPIO1+0x00,9)=0; BB(GPIO1+0x04,9)=1;
#endif
  MS(20);
}
TC_INIT static void spi_init(void){
  /* like FU 0x3f44, as read-modify-write */
#if defined(LCD_FASTCLK) && (!defined(FELD_MY_LAB) || defined(FELD_MY_LAB_ON_PARADISE))
  REG(PANEL+0x08)=0;                                   /* clock divider: test in v0.8.18, twice as fast? */
#else
  REG(PANEL+0x08)=1;                                   /* clock divider */
#endif
  SPI_CTRL &= ~(1u<<18);
  REG(PANEL+0x04) &= ~6u; REG(PANEL+0x04) &= ~1u;
  SPI_CTRL &= ~0x10u; SPI_CTRL &= ~0x08u;
  REG(PANEL+0x20)=0;
  SPI_CTRL = (SPI_CTRL & ~0xF00u) | 0x700u;            /* 8 bit */
  REG(PANEL+0x24) |= 0x80000000u;
  REG(PANEL+0x24) &= ~0xFF0000u;
  REG(PANEL+0x24) |= 0x80000000u;
  REG(PANEL+0x24) &= ~0xFFu;
  SPI_CTRL |= 1u;                                      /* SPI on */
  SPI_CTRL |= 0xC0u;                                   /* flush FIFOs */
}
static void spi_tx(const u8* p, u32 n){
  for(u32 i=0;i<n;i++){
    for(u32 g=0; (SPI_STAT & 2u) && g<SPIWAIT; g++){}
    SPI_DATA=p[i];
  }
  udelay(8);
  for(u32 g=0; (SPI_STAT & 0x10u) && g<SPIWAIT; g++){}
  SPI_CTRL |= 0xC0u;
}
static void lcd_cmd(u8 c, const u8* par, u32 n){
  LCD_DC(0); spi_tx(&c,1);
  if(n){ LCD_DC(1); spi_tx(par,n); LCD_DC(0); }
}
#if defined(FELD_MY_LAB) && !defined(FELD_MY_LAB_ON_PARADISE)
#include "my_lab_panel.h"
#else
#include "paradise_panel.h"
#ifdef FELD_MY_LAB_ON_PARADISE
static int menu_panel_waiting_for_frame;
#endif
#endif
TC_INIT static void display_init(void){
  spi_init();
  LCD_RST(1); MS(10); LCD_RST(0); MS(20); LCD_RST(1); MS(150);   /* panel reset */
#if defined(FELD_MY_LAB) && !defined(FELD_MY_LAB_ON_PARADISE)
  my_lab_panel_init();
#elif defined(FELD_MY_LAB_ON_PARADISE)
  paradise_panel_init(0);
  menu_panel_waiting_for_frame=1;
#else
  paradise_panel_init(1);
#endif
}
static void pwm2(u32 mr1, int first){
  if(first) REG(CT2+0x34)=0;
  REG(CT2+0x00)=0;
  REG(CT2+0x18)=0; REG(CT2+0x1C)=0; REG(CT2+0x20)=0; REG(CT2+0x24)=0;
  REG(CT2+0x14)=0;
  REG(CT2+0x00)=2; REG(CT2+0x08)=0; REG(CT2+0x00)=0;
  REG(CT2+0x14)=0x400u;
  REG(CT2+0x24)=0x17700u;
  REG(CT2+0x1C)=mr1;
  REG(CT2+0x14)=0;
  REG(CT2+0x34)=0x00200002u;
  REG(CT2+0x00)=2;
  REG(CT2+0x3C)=0x1Fu;
  REG(CT2+0x00)=1;
}
TC_INIT static void backlight_on(void){
  REG(0x40007034u)=0;
  pwm2(0x17700u,1);
  REG(0x40009000u)=0x5AFA0000u; REG(0x40008000u)=0x5AFA0000u;     /* like FU */
#if defined(FELD_MY_LAB) && !defined(FELD_MY_LAB_ON_PARADISE)
  REG(0x40018034u)=0x15105155u; REG(0x40019034u)=0x55555400u;
#else
  REG(0x40018034u)=0x15555155u; REG(0x40019034u)=0x55540140u;
#endif
  pwm2(0,0);
  REG(CLK+0x20)=0x42u;
}

/* ---------------- our own additions ---------------- */
/* Buzzer on timer 7, started and stopped exactly like the firmware does:
 * period in 72 MHz clock ticks, short pulse (quiet, like on the Paradise). */
#define CT7 0x40007000u
#ifdef TONE_FIX
/* v0.8.15: the counter runs periodically (MCTRL bit 10 = restart at MR3, like the backlight with 0x400).
 * Before, MCTRL ended up at 0: only a single pulse per call, so a click instead of a tone.
 * If only the pitch changes, only MR0/MR3 are set again (no restart, no click). */
void hw_tone(u32 hz){
  static u32 on;
  if(!hz){ REG(CT7+0x34)=0; REG(CT7+0x00)=0; on=0; return; }
  u32 per = 72000000u / hz, mr0 = per - per/32u;
  if(on){ REG(CT7+0x24)=per; REG(CT7+0x18)=mr0; return; }
  REG(CT7+0x34)=0;
  REG(CT7+0x00)=2; REG(CT7+0x08)=0; REG(CT7+0x00)=0;
  REG(CT7+0x18)=mr0; REG(CT7+0x1C)=0; REG(CT7+0x20)=0;
  REG(CT7+0x24)=per;
  REG(CT7+0x14)=0x400u;
  REG(CT7+0x34)=0x00100001u;
  REG(CT7+0x3C)=0x1Fu;
  REG(CT7+0x00)=1;
  on=1;
}
#else
void hw_tone(u32 hz){
  if(!hz){ REG(CT7+0x34)=0; return; }
  u32 per = 72000000u / hz, mr0 = per - per/32u;
  REG(CT7+0x34)=0;
  REG(CT7+0x00)=0;
  REG(CT7+0x18)=0; REG(CT7+0x1C)=0; REG(CT7+0x20)=0; REG(CT7+0x24)=0;
  REG(CT7+0x14)=0;
  REG(CT7+0x00)=2; REG(CT7+0x08)=0; REG(CT7+0x00)=0;
  REG(CT7+0x14)=0x600u;
  REG(CT7+0x24)=per;
  REG(CT7+0x18)=mr0;
  REG(CT7+0x14)=0;
  REG(CT7+0x34)=0x00100001u;
  REG(CT7+0x00)=2;
  REG(CT7+0x3C)=0x1Fu;
  REG(CT7+0x00)=1;
}
#endif
void hw_bl_pwm_off(void){ REG(CT2+0x00)=0; REG(CT2+0x34)=0; }   /* backlight off only (when leaving) */
#ifdef BL_SLEEP
/* v0.8.18: off = put the display to sleep (DISPOFF, SLPIN) and stop the backlight timer,
 * PWM output off (like panel_down in the Flash Tool). On = SLPOUT, short wait, DISPON, restart backlight.
 * MR1 values alone (v0.8.17) had no effect on the device. */
void hw_backlight(int on){
  static int is_on=1;
  if(on){ if(is_on) return; lcd_cmd(0x11,0,0); MS(10); lcd_cmd(0x29,0,0); pwm2(0u,1); is_on=1; }
  else  { if(!is_on) return; REG(CT2+0x00)=0; REG(CT2+0x34)=0; lcd_cmd(0x28,0,0); lcd_cmd(0x10,0,0); is_on=0; }
}
#elif defined(BL_OFFFIX)
/* v0.8.17: duty cycle 0 = full brightness. MR1 equal to the period (0x17700) never matches, so it stayed bright.
 * One tick before the end of the period is practically dark. */
void hw_backlight(int on){ pwm2(on ? 0u : 0x176FFu, 0); }
#else
void hw_backlight(int on){ pwm2(on ? 0u : 0x17700u, 0); }
#endif
void hw_wdt_feed(void){ REG(0x4000800Cu)=0x5AFA55AAu; REG(0x4000900Cu)=0x5AFA55AAu; }

static void init_boot_hardware(void){
  wdt_off(); mailbox_clear(); clock_init(); periph_enable(); flashctl_init(); pin_mux();
}
#if defined(FELD_MY_LAB_ON_PARADISE) && !defined(HOST)
void hw_init_game_boot(void){
  init_boot_hardware();
  // Sample the recovery key without running the Flash Tool's full GPIO sweep.
  REG(GPIO0+4u) &= ~0xF00u;
  REG(GPIO0+8u) &= ~(0xFFu<<16);
  REG(GPIO0+0x34u) = 0x15555155u;
  MS(2);
}
#endif
TC_INIT void hw_init(void){
#if !defined(FELD_MY_LAB_ON_PARADISE) || defined(HOST)
  init_boot_hardware();
#endif
  display_power(); display_init();
#if defined(FELD_MY_LAB) && !defined(FELD_MY_LAB_ON_PARADISE)
  REG(GPIO1+0x04) &= ~(7u<<13);
  REG(GPIO1+0x08) &= ~(0x3Fu<<26);
  REG(GPIO1+0x34) = (REG(GPIO1+0x34) & ~(0x3Fu<<26)) | (0x15u<<26);
#else
  backlight_on();
  /* Buttons: P0.8 wheel, P0.9 A, P0.10 C, P0.11 B as inputs (active low) */
  REG(GPIO0+0x04) &= ~((1u<<8)|(1u<<9)|(1u<<10)|(1u<<11));
#endif
  flashctl_init();
}

u32 hw_buttons(void){
#if defined(FELD_MY_LAB) && !defined(FELD_MY_LAB_ON_PARADISE)
  u32 d = REG(GPIO1+0x00), b = 0;
  if(!(d & (1u<<15))) b |= BTN_A;
  if(!(d & (1u<<14))) b |= BTN_B;
  if(!(d & (1u<<13))) b |= BTN_C;
#else
  u32 d = REG(GPIO0+0x00);
  u32 b = 0;
  if(!(d & (1u<<9)))  b |= BTN_A;
  if(!(d & (1u<<11))) b |= BTN_B;
  if(!(d & (1u<<10))) b |= BTN_C;
  if(!(d & (1u<<8)))  b |= BTN_WHEEL;
#endif
  return b;
}

#if defined(FELD_MY_LAB) && !defined(FELD_MY_LAB_ON_PARADISE)
#define BUTTON_QUEUE 64u
#define BUTTON_A_PIN 15u
#define BUTTON_A_GPIO (1u<<BUTTON_A_PIN)
#define BUTTON_A_PRESS_TICKS (2u*MY_LAB_BUTTON_TICKS_PER_MS)
static u32 button_previous, button_older, button_stable;
static volatile u8 button_a_down;
static u8 button_confirm_ticks, button_a_press_ticks;
// SysTick and idle polling enqueue events. The foreground advances the head.
static volatile u8 button_events[BUTTON_QUEUE];
static volatile u32 button_first, button_next;

void hw_start_buttons(void){
  // A+C may still be held after launching the menu.
  button_previous=button_older=button_stable=hw_buttons();
  button_a_down=(button_stable&BTN_A)!=0;
  button_confirm_ticks=button_a_press_ticks=0;
  button_first=button_next=0;
  // Use the stock GPIO single-edge mode. A pulls the pin low, so latch
  // the falling edge even if software missed the preceding release.
  BB(GPIO1+0x0Cu,BUTTON_A_PIN)=0;
  BB(GPIO1+0x10u,BUTTON_A_PIN)=0;
  BB(GPIO1+0x14u,BUTTON_A_PIN)=1;
  REG(GPIO1+0x20u)=BUTTON_A_GPIO;
  BB(GPIO1+0x18u,BUTTON_A_PIN)=1;
}
void hw_stop_buttons(void){
  BB(GPIO1+0x18u,BUTTON_A_PIN)=0;
  REG(GPIO1+0x20u)=BUTTON_A_GPIO;
}

static void button_enqueue(u32 key){
  u32 tail=button_next, next=(tail+1u)%BUTTON_QUEUE;
  if(next==button_first) return;
  button_events[tail]=(u8)key;
  button_next=next;
}
static u32 button_a_pressed(void){ return BB(GPIO1+0x00,BUTTON_A_PIN)==0; }
static u32 button_a_latched(void){ return REG(GPIO1+0x1Cu)&BUTTON_A_GPIO; }

static void button_sample_a(int tick){
  u32 latched=button_a_latched();
  if(latched) REG(GPIO1+0x20u)=BUTTON_A_GPIO;
  u32 down=button_a_pressed();
  if(!down) button_a_press_ticks=0;
  else if(latched || !button_a_down) button_a_press_ticks=BUTTON_A_PRESS_TICKS;
  else if(tick && button_a_press_ticks && !--button_a_press_ticks) button_enqueue(BTN_A);
  button_a_down=(u8)down;
}
void hw_poll_button_a(void){
  if(button_a_pressed()==button_a_down && !button_a_latched()) return;
  // Idle polling handles edges promptly between timer ticks. Serialize
  // only changes with the interrupt handler, which also samples during draws.
  u32 mask;
  __asm__ volatile("mrs %0, primask\n cpsid i" : "=r"(mask) :: "memory");
  button_sample_a(0);
  __asm__ volatile("msr primask, %0" :: "r"(mask) : "memory");
}
void hw_button_tick(void){
  u32 raw=hw_buttons();
  button_sample_a(1);
  if(++button_confirm_ticks!=MY_LAB_BUTTON_TICKS_PER_MS) return;
  button_confirm_ticks=0;
  // Confirmation and exit retain their millisecond debounce.
  u32 changed=(raw^button_stable)&~((raw^button_previous)|(raw^button_older))&(BTN_B|BTN_C);
  button_older=button_previous;
  button_previous=raw;
  button_stable^=changed;
  if(raw&changed&BTN_B) button_enqueue(BTN_B);
  if(raw&changed&BTN_C) button_enqueue(BTN_C);
}

u32 hw_take_button(u32 mask){
  u32 head=button_first;
  if(head==button_next) return 0;
  u32 pressed=button_events[head];
  if(!(pressed&mask)) return 0;
  button_first=(head+1u)%BUTTON_QUEUE;
  return pressed;
}
#endif

/* Send a rectangle from the RGB565 framebuffer to the panel. */
void hw_push(const u16* fb, u32 stride, u32 x0, u32 y0, u32 x1, u32 y1){
#if defined(FELD_MY_LAB) && !defined(FELD_MY_LAB_ON_PARADISE)
  (void)stride; (void)x0; (void)y0; (void)x1; (void)y1;
  // Flash Tool sends its first frame before starting the backlight. Keep
  // the same peripheral setting for subsequent menu transfers, too.
  const u32 peripheral_setting = REG(CLK+0x20);
  periph_enable();
  my_lab_push_frame(fb);
  REG(CLK+0x20) = peripheral_setting;
  if(!my_lab_backlight_started){
    backlight_on();
    my_lab_backlight_started = 1;
  }
  hw_wdt_feed();
#else
  u8 ca[4]={0x00,(u8)(x0+2),0x00,(u8)(x1+1)};
  u8 ra[4]={0x00,(u8)(y0+1),0x00,(u8)(y1)};
  lcd_cmd(0x2a,ca,4); lcd_cmd(0x2b,ra,4);
  LCD_DC(0); { u8 c=0x2c; spi_tx(&c,1); }
  LCD_DC(1);
  for(u32 y=y0;y<y1;y++){
    const u16* r=fb+y*stride;
    for(u32 x=x0;x<x1;x++){
      u8 two[2]={(u8)(r[x]>>8),(u8)r[x]};
      spi_tx(&two[0],1); spi_tx(&two[1],1);   /* byte by byte like the FU (1.3.8) */
    }
  }
  LCD_DC(0);
#ifdef FELD_MY_LAB_ON_PARADISE
  if(menu_panel_waiting_for_frame && !x0 && !y0 && x1==128 && y1==128){
    lcd_cmd(0x29,0,0);
    menu_panel_waiting_for_frame=0;
  }
#endif
#endif
}

#ifdef FAST_LCD
/* v0.8.17: pixel output in one go per rectangle, 16 bytes per SPI pass (like the gamma tables
 * in display init, which work this way on the device). Before, per byte: wait, pause of 8, wait. */
void hw_px_begin(u32 x0, u32 y0, u32 x1, u32 y1){
  u8 ca[4]={0x00,(u8)(x0+2),0x00,(u8)(x1+1)};
  u8 ra[4]={0x00,(u8)(y0+1),0x00,(u8)(y1)};
  lcd_cmd(0x2a,ca,4); lcd_cmd(0x2b,ra,4);
  LCD_DC(0); { u8 c=0x2c; spi_tx(&c,1); }
  LCD_DC(1);
}
void hw_px_row(const u16* r, u32 n){
  u8 b[16]; u32 k=0;
  for(u32 i=0;i<n;i++){ b[k++]=(u8)(r[i]>>8); b[k++]=(u8)r[i]; if(k==16u){ spi_tx(b,16); k=0; } }
  if(k) spi_tx(b,k);
}
void hw_px_end(void){ LCD_DC(0); }
#endif

/* Back to the Paradise: firmware routine that reloads the encrypted PRAM image
   and restarts (flash 0x110568, XIP 0x100FF569). */
void hw_back_to_paradise(void){
  __asm__ volatile("cpsid i");
  ((void(*)(void))(PARADISE_REBOOT|1u))();
  for(;;){}
}
