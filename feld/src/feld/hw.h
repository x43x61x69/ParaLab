#ifndef HW_H
#define HW_H
#include "io.h"
#define BTN_A 1u
#define BTN_B 2u
#define BTN_C 4u
#define BTN_WHEEL 8u
#if defined(FELD_MY_LAB) && !defined(FELD_MY_LAB_ON_PARADISE)
#define FELD_SCREEN_W 160
#else
#define FELD_SCREEN_W 128
#endif
#define FELD_SCREEN_H 128
#ifndef PARADISE_REBOOT
#define PARADISE_REBOOT 0x100FF568u
#endif
void hw_init(void);
#if defined(FELD_MY_LAB_ON_PARADISE) && !defined(HOST)
void hw_init_game_boot(void);
#endif
void hw_wdt_feed(void);
u32  hw_buttons(void);
#if defined(FELD_MY_LAB) && !defined(FELD_MY_LAB_ON_PARADISE) && !defined(HOST)
#define MY_LAB_BUTTON_TICKS_PER_MS 4u
void hw_start_buttons(void);
void hw_stop_buttons(void);
void hw_poll_button_a(void);
void hw_button_tick(void);
u32  hw_take_button(u32 mask);
#endif
void hw_push(const u16* fb, u32 stride, u32 x0, u32 y0, u32 x1, u32 y1);
void hw_back_to_paradise(void);
void hw_backlight(int on);
void hw_bl_pwm_off(void);
void hw_tone(u32 hz);              /* 0 = off */
#ifdef FAST_LCD
void hw_px_begin(u32 x0, u32 y0, u32 x1, u32 y1);
void hw_px_row(const u16* r, u32 n);
void hw_px_end(void);
#endif
#endif
