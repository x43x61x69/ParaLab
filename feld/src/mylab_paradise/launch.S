.syntax unified
#include "../stub/my_lab_paradise_entry.h"
.thumb
.text
.global launch_port_app
.thumb_func
// r0 is the uncached flash address. This code runs from XIP while replacing PRAM.
launch_port_app:
    cpsid i
    ldr r4, =MY_LAB_PARADISE_TRACE_BOX
    ldr r2, =MY_LAB_PARADISE_LOADER_SOURCE
    cmp r0, r2
    bne 5f
    movs r2, #MY_LAB_TRACE_CLOCK
    str r2, [r4, #4]
    b 0f
5:  ldr r2, =MY_LAB_PARADISE_MENU_SOURCE
    cmp r0, r2
    bne 6f
    movs r2, #0
    str r2, [r4]              // Intentional return to Menu.
    ldr r1, =MY_LAB_PARADISE_BOOT_BOX
    ldr r2, [r1]
    ldr r3, =MY_LAB_PARADISE_FLASH_REQUEST
    cmp r2, r3
    beq 6f                    // Settings > Update takes precedence.
    ldr r2, =MY_LAB_PARADISE_MENU_REQUEST
    str r2, [r1]
6:  movs r4, #0
0:
    ldr r1, =0x4000800c
    ldr r2, =0x5afa55aa
    str r2, [r1]
    ldr r1, =0x4000900c
    str r2, [r1]

    ldr r3, =0x45000000
    movw r2, #0x8041
    str r2, [r3]
    movs r2, #4
    str r2, [r3, #0xc]
    mov.w r1, #0x400000
1:  ldr r2, [r3, #0xc]
    cmp r2, #0x44
    beq 2f
    subs r1, #1
    bne 1b

2:  cbz r4, 0f
    movs r2, #MY_LAB_TRACE_COPY
    str r2, [r4, #4]
0:  movs r1, #0
    mov.w r2, #0x10000
3:  ldr r3, [r0], #4
    str r3, [r1], #4
    subs r2, #4
    bne 3b

    movs r0, #0
    ldr r1, =0xe000e010
    str r0, [r1]              // SysTick
    ldr r1, =0xe000e180
    mov.w r2, #-1
    str r2, [r1]              // Disable external interrupts.
    str r2, [r1, #4]
    str r2, [r1, #0x100]      // Clear pending external interrupts.
    str r2, [r1, #0x104]
    ldr r1, =0xe000ed04
    mov.w r2, #0x0a000000
    str r2, [r1]              // Clear pending SysTick and PendSV.
    str r0, [r1, #4]          // VTOR = 0
    msr control, r0
    msr basepri, r0
    msr faultmask, r0
    ldr r1, [r0]
    ldr r2, [r0, #4]
    msr msp, r1
    cbz r4, 0f
    movs r3, #MY_LAB_TRACE_LOADER
    str r3, [r4, #4]
0:
    dsb
    isb
    cpsie i
    bx r2
.ltorg
