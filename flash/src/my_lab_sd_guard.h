/* Bound native SD calls even if the stock polling code does not return.
 * Backup transfers defer user cancellation until the sector finishes.
 * Internal ROM programming never uses this guard. */
#include "my_lab_sd_reset.h"

#define SD_GUARD_SP_ADDR 0x1801A830
#define SD_TICK_CSR 0xE000E010u
#define SD_TICK_RELOAD 0xE000E014u
#define SD_TICK_CURRENT 0xE000E018u
#define SD_TICK_CLEAR (1u<<25)
#define SD_TICK_CYCLES 960000u /* 10 ms at the Flash Tool's 96 MHz clock */
#define SD_TIMEOUT_TICKS 500u
#define SD_WDT_CTRL 0x40008000u
#define SD_WDT_FEED 0x4000800Cu
#define SD_STRING_(x) #x
#define SD_STRING(x) SD_STRING_(x)

enum { SD_DRIVER_MISSING=-7, SD_IRQ_FAILED=-6, SD_XIP_FAILED=-5, SD_FAULT=-4, SD_NO_RESPONSE=-3,
       SD_CANCELLED=-2, SD_TIMED_OUT=-1, SD_FAILED=0, SD_OK=1 };

static volatile u32 *const sd_guard_sp=(u32*)SD_GUARD_SP_ADDR;
static volatile u32 *const sd_guard_ticks=(u32*)0x1801A834u;
static volatile u32 *const sd_guard_allow_cancel=(u32*)0x1801A838u;
static volatile u32 *const sd_guard_cancel_pending=(u32*)0x1801A83Cu;

typedef struct {
  u32 pc, phase, cfsr, hfsr, address, lr, xpsr;
} SdFault;
static volatile SdFault *const sd_last_fault=(SdFault*)0x1801A844u;

static void sd_guard_phase(u32 phase){
  REG(SD_RESET_BOX+12)=0;
  REG(SD_RESET_BOX+16)=0;
  REG(SD_RESET_BOX+20)=0; /* sampled LR */
  REG(SD_RESET_BOX+24)=0; /* sampled controller status */
  REG(SD_RESET_BOX+8)=phase;
  dsb();
}

/* The checkpoint has the original callee-saved registers and return address.
 * On timeout, the exception returns here instead of resuming the SD driver. */
__attribute__((naked, used)) static void sd_guard_return(void){
  __asm__ volatile(
    "ldr r1, =" SD_STRING(SD_GUARD_SP_ADDR) "\n"
    "ldr r2, [r1]\n"
    "mov sp, r2\n"
    "movs r2, #0\n"
    "str r2, [r1]\n"
    "ldr r1, =0xE000E010\n"
    "str r2, [r1]\n"
    "cpsie i\n"
    "pop.w {r3-r11, pc}\n.ltorg\n");
}
__attribute__((naked, noinline)) static int sd_guard_call(int (*call)(void *),void *arg){
  __asm__ volatile(
    "push.w {r3-r11, lr}\n"
    "ldr r2, =" SD_STRING(SD_GUARD_SP_ADDR) "\n"
    "mov r3, sp\n"
    "str r3, [r2]\n"
    "ldr r2, =0xE000E010\n"
    "movs r3, #7\n"
    "str r3, [r2]\n"
    "mov r12, r0\n"
    "mov r0, r1\n"
    "blx r12\n"
    "b sd_guard_return\n.ltorg\n");
}
static int sd_guarded_mode(int (*call)(void *),void *arg,u32 allow_cancel,u32 phase){
  if(sd_keys()&SD_C){
    *sd_guard_cancel_pending=1;
    if(allow_cancel) return SD_CANCELLED;
  }
  *sd_guard_allow_cancel=allow_cancel;
  *sd_guard_ticks=SD_TIMEOUT_TICKS;
  REG(SD_TICK_RELOAD)=SD_TICK_CYCLES-1u;
  REG(SD_TICK_CURRENT)=0;
  REG(0xE000ED04u)=SD_TICK_CLEAR;
  sd_guard_phase(phase);
  /* WDT0 runs from the low-speed oscillator. Arm it only when the device
   * can reboot normally, including after a failed SD ROM update. */
  u32 watchdog=!g_reset->writing && reset_boot_valid();
  if(watchdog){
    REG(SD_RESET_BOX+4)=SD_RESET_DELIVERED;
    REG(SD_RESET_BOX)=SD_RESET_ARMED;
    dsb();
    REG(SD_WDT_FEED)=0x5AFA55AAu;
    REG(SD_WDT_CTRL)=0x5AFA0001u;
  }
  int result=sd_guard_call(call,arg);
  if(watchdog){
    REG(SD_WDT_CTRL)=0x5AFA0000u;
    REG(SD_RESET_BOX)=0;
  }
  return result;
}
static int sd_guarded(int (*call)(void *),void *arg,u32 phase){
  *sd_guard_cancel_pending=0;
  return sd_guarded_mode(call,arg,1,phase);
}
static void sd_guard_abort(u32 *frame,int result){
  __asm__ volatile("cpsid i":::"memory");
  REG(0xE000E180u)=1u<<15;
  REG(0xE000E280u)=1u<<15;
  frame[0]=(u32)result;
  frame[6]=(u32)sd_guard_return&~1u;
  frame[7]=(frame[7]&(1u<<9))|(1u<<24); /* preserve alignment, clear IT state */
}
__attribute__((used)) static void sd_guard_tick(u32 *frame,u32 exception_return){
  if(!*sd_guard_sp) return;
  REG(SD_RESET_BOX+12)=frame[6];
  REG(SD_RESET_BOX+20)=frame[5];
  if(REG(SD_RESET_BOX+8)==SD_PHASE_CARD)
    REG(SD_RESET_BOX+24)=REG(0x40024000u);
  REG(SD_RESET_BOX+16)+=1u;
  if(sd_keys()&SD_C) *sd_guard_cancel_pending=1;
  int cancelled=*sd_guard_allow_cancel && *sd_guard_cancel_pending;
  if(*sd_guard_ticks) --*sd_guard_ticks;
  /* A nested exception cannot abandon an active SD IRQ. Let WDT0 expire
   * if the IRQ stays active, or unwind once thread mode resumes. */
  if(!(exception_return&8u)) return;
  if(cancelled || !*sd_guard_ticks){
    sd_guard_abort(frame,cancelled?SD_CANCELLED:SD_TIMED_OUT);
    return;
  }
  REG(SD_WDT_FEED)=0x5AFA55AAu;
}
__attribute__((naked)) static void sd_systick(void){
  __asm__ volatile("mrs r0, msp\nmov r1, lr\nb sd_guard_tick");
}
__attribute__((used)) static void sd_guard_fault(u32 *frame,u32 exception_return){
  if(*sd_guard_sp){
    u32 cfsr=REG(0xE000ED28u);
    sd_last_fault->pc=frame[6];
    sd_last_fault->lr=frame[5];
    sd_last_fault->xpsr=frame[7];
    sd_last_fault->phase=REG(SD_RESET_BOX+8);
    sd_last_fault->cfsr=cfsr;
    sd_last_fault->hfsr=REG(0xE000ED2Cu);
    if(cfsr&(1u<<15)) sd_last_fault->address=REG(0xE000ED38u);
    else if(cfsr&(1u<<7)) sd_last_fault->address=REG(0xE000ED34u);
    REG(SD_RESET_BOX+12)=frame[6];
  }
  if(!*sd_guard_sp || !(exception_return&8u)){
    if(!g_reset->writing && reset_boot_valid()) reset_system();
    for(;;){} /* Cannot unwind a fault outside the card I/O checkpoint. */
  }
  REG(0xE000ED28u)=sd_last_fault->cfsr; /* clear CFSR */
  REG(0xE000ED2Cu)=sd_last_fault->hfsr; /* clear HFSR */
  sd_guard_abort(frame,SD_FAULT);
}
__attribute__((naked)) static void sd_fault(void){
  __asm__ volatile("mrs r0, msp\nmov r1, lr\nb sd_guard_fault");
}
