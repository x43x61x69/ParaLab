.syntax unified
.thumb
.section .text
#include "../../../flash/src/my_lab_sd_reset.h"
#include "my_lab_paradise_entry.h"
// Count consecutive updates with both keys down. Run the native update
// until the hold reaches 60 updates.
push {r0-r3}
ldr r0, gpio
ldr r0, [r0]
ldr r1, counter
#ifdef FELD_MY_LAB_ON_PARADISE
tst.w r0, #0x600
#else
tst.w r0, #0xa000
#endif
bne released
ldr r2, [r1]
lsrs r3, r2, #16
movw r0, #0xe7a1
cmp r3, r0
it ne
lslne r2, r0, #16
adds r2, #1
str r2, [r1]
uxth r2, r2
cmp r2, #60
bhs start_menu
b run_native
released:
movs r0, #0
str r0, [r1]
run_native:
pop {r0-r3}
ldr.w pc, native_update
.org 0x40
start_menu:
#ifdef FELD_MY_LAB_ON_PARADISE
ldr r0, menu_source
ldr.w pc, launch
#else
b.w launch_native
#endif
.align 2
#ifdef FELD_MY_LAB_ON_PARADISE
gpio: .word 0x40018000
#else
gpio: .word 0x40019000
#endif
counter: .word 0x20000ff8
native_update: .word 0x10018e1d
#ifdef FELD_MY_LAB_ON_PARADISE
menu_source: .word MY_LAB_PARADISE_MENU_SOURCE
launch: .word MY_LAB_PARADISE_LAUNCH_FROM_GAME
#endif
.org 0x60
// Keep the stock scene transition for the four built-in Computer rows.
movw r1, #0x7ffe
cmp r0, r1
beq start_menu
ldr.w pc, change_scene
.align 2
change_scene: .word 0x10002b29

#ifdef FELD_MY_LAB_ON_PARADISE
.org 0x70
// Settings only: scene 0x21 is the stock SD updater.
cmp r0, #0x21
bne settings_stock
ldr r1, =MY_LAB_PARADISE_BOOT_BOX
ldr r2, =MY_LAB_PARADISE_FLASH_REQUEST
str r2, [r1]
b start_menu
settings_stock:
ldr.w pc, change_scene
.ltorg
#else
// Only the game-to-menu entry uses a direct handoff. The native reset path
// remains available for cold boots. The handoff sets up the core context
// required by Reset_Handler without relying on SYSRESETREQ.
.org 0x70
launch_native:
cpsid i
ldr r0, =0x4000800c
ldr r1, =0x5afa55aa
str r1, [r0]
ldr r3, =0x45000000
movw r2, #0x8041
str r2, [r3]
movs r2, #4
str r2, [r3, #0xc]
mov.w r1, #0x400000
1:
ldr r2, [r3, #0xc]
cmp r2, #0x44
beq 2f
subs r1, #1
bne 1b
2:
ldr r0, =0x60037000
movs r1, #0
mov.w r2, #0x10000
3:
ldr r3, [r0], #4
str r3, [r1], #4
subs r2, #4
bne 3b
movs r0, #0
ldr r1, =0xe000e010
str r0, [r1]
ldr r1, =0xe000ed04
mov.w r2, #0x0a000000
str r2, [r1]
str r0, [r1, #4]
msr control, r0
msr basepri, r0
dsb
isb
ldr r1, [r0]
ldr r2, [r0, #4]
msr msp, r1
bx r2
.ltorg
#endif

#ifndef FELD_MY_LAB_ON_PARADISE
// This block is installed at flash 0x50000. The stock boot loader calls it
// once after configuring the button inputs and their pull-ups, before the game.
.org 0x100
b.n cold_entry
.align 2
.ascii "PXMLCOLD"
cold_entry:
push {r1-r3, lr}
ldr r1, =0x20000ffc
ldr r2, [r1]
ldr r3, =0x4c584d50        // PMXL: the Paramix menu is returning to the game.
cmp r2, r3
bne cold_check
movs r2, #0
str r2, [r1]
b cold_continue
cold_check:
// A watchdog during SD I/O gets one attempt to reopen Flash Tool.
ldr r1, =SD_RESET_BOX
ldr r2, [r1]
ldr r3, =SD_RESET_ARMED
cmp r2, r3
bne cold_check_buttons
ldr r2, [r1, #4]
mvns r3, r3
cmp r2, r3
bne cold_check_buttons
str r3, [r1]
b cold_rescue
cold_check_buttons:
ldr r1, =0x45000304
ldr r2, [r1]
cmp r2, #30                // Ignore a late wake with the RTC still running.
bhs cold_continue
ldr r1, =0x40019000
movs r3, #5
cold_sample:
ldr r2, [r1]
and r2, r2, #0xe000        // Active low: P1.15 A, P1.14 B, P1.13 C.
cmp r2, #0xc000
bne cold_continue
subs r3, #1
beq cold_rescue
movw r2, #60000
cold_settle:
subs r2, #1
bne cold_settle
b cold_sample

cold_rescue:
ldr r0, =0x60fc0000
add r3, r0, #0xf000
ldr r1, [r3]
ldr r2, =0x4c4d5850        // PXMLFT01 marks Studio's updatable Flash Tool.
cmp r1, r2
bne cold_fallback
ldr r1, [r3, #4]
ldr r2, =0x31305446
cmp r1, r2
bne cold_fallback
bl cold_validate
cmp r1, #0
bne cold_run
cold_fallback:
ldr r0, =0x60ff0000
bl cold_validate
cmp r1, #0
beq cold_continue
cold_run:
b cold_launch

cold_validate:
add r1, r0, #0xe000
ldr r2, [r1]
ldr r3, =0x494e4f53        // SONIXDEV
cmp r2, r3
bne cold_invalid
ldr r2, [r1, #4]
ldr r3, =0x56454458
cmp r2, r3
bne cold_invalid
ldr r2, [r1, #8]
cmp r2, #0x12
bne cold_invalid
ldr r2, [r1, #0x10]
cmp r2, r0
bne cold_invalid
ldr r2, [r1, #0x14]
cmp r2, #0xe000
bne cold_invalid

// Check the full rescue program and its vectors before leaving stock startup.
push {r4-r7}
ldr r7, [r1, #0x24]
ldr r4, =0xedb88320
mov r5, r0
add r6, r0, #0xe000
movs r2, #0
mvns r2, r2
cold_crc_byte:
ldrb r3, [r5], #1
eors r2, r3
movs r1, #8
cold_crc_bit:
lsrs r2, #1
it cs
eorcs r2, r4
subs r1, #1
bne cold_crc_bit
cmp r5, r6
bne cold_crc_byte
mvns r2, r2
cmp r2, r7
pop {r4-r7}
bne cold_invalid
ldr r1, [r0]
ldr r2, =0x18000000
subs r1, r1, r2
tst r1, #7
bne cold_invalid
cmp r1, #0x20000
bhs cold_invalid
ldr r1, [r0, #4]
tst r1, #1
beq cold_invalid
cmp r1, #0xe000
bhs cold_invalid

movs r1, #1
bx lr
cold_invalid:
movs r1, #0
bx lr

cold_launch:
// Copy from uncached flash while executing out of the stock loader's XIP map.
cpsid i
ldr r1, =0x4000800c
ldr r2, =0x5afa55aa
str r2, [r1]
ldr r3, =0x45000000
movw r2, #0x8041
str r2, [r3]
movs r2, #4
str r2, [r3, #0xc]
mov.w r1, #0x400000
cold_clock:
ldr r2, [r3, #0xc]
cmp r2, #0x44
beq cold_load
subs r1, #1
bne cold_clock
cold_load:
movs r1, #0
mov.w r2, #0xe000
cold_copy:
ldr r3, [r0], #4
str r3, [r1], #4
subs r2, #4
bne cold_copy
movs r0, #0
ldr r1, =0xe000e010
str r0, [r1]
ldr r1, =0xe000ed04
mov.w r2, #0x0a000000
str r2, [r1]
str r0, [r1, #4]            // VTOR = 0
msr control, r0
msr basepri, r0
dsb
isb
ldr r1, [r0]
ldr r2, [r0, #4]
msr msp, r1
bx r2

cold_continue:
// A verified slot source stays intact until a restore completes. Re-enter
// Paramix to resume before the stock game can read a partly restored slot.
ldr r1, =0x60c64000
ldr r2, [r1]
ldr r3, =0x4c4d5850
cmp r2, r3
bne cold_stock
ldr r2, [r1, #4]
ldr r3, =0x31305653
cmp r2, r3
bne cold_stock
add r1, r1, #0x1000
ldr r2, [r1]
ldr r3, =0x4a534c4d
cmp r2, r3
bne cold_stock
ldr r2, [r1, #4]
mvns r3, r3
cmp r2, r3
bne cold_stock
ldr r0, =0x60037000
ldr r2, [r0, #0x140]
ldr r3, =0x444c4546       // FELD
cmp r2, r3
beq cold_launch
cold_stock:
pop {r1-r3, lr}
movs r0, #0                  // Replay the two overwritten stock instructions.
strh r0, [r1]
bx lr
.ltorg
#endif
