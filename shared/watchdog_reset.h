#ifndef WATCHDOG_RESET_H
#define WATCHDOG_RESET_H

/* Restart through Boot ROM instead of re-entering the current PRAM image. */
static inline void reset_system(void){
  __asm__ volatile("cpsid i");
  REG(0x40008000u)=0x5AFA0000u;
  REG(0x40008008u)=0x5AFA00FFu; /* retain the proven WDT0 timeout */
  REG(0x4000800Cu)=0x5AFA55AAu;
  REG(0x40008000u)=0x5AFA0001u;
  dsb(); for(;;){} /* stop feeding WDT0 */
}

#endif
