/* Copy the verified tool from uncached flash without executing from PRAM. */
.syntax unified
.thumb
.section .text.flash_reload,"ax",%progbits
.balign 4
.global flash_reload_start, flash_reload_end
flash_reload_start:
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
1:  ldr r2, [r3, #0xc]
    cmp r2, #0x44
    beq 2f
    subs r1, #1
    bne 1b
2:  movs r1, #0
#ifdef FLASH_MY_LAB
    mov.w r2, #0xe000
#else
    mov.w r2, #0x10000
#endif
3:  ldr r3, [r0], #4
    str r3, [r1], #4
    subs r2, #4
    bne 3b
    dsb
    isb
#ifdef FLASH_MY_LAB
    /* Same entry as the native cold Flash Tool launcher. */
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
#else
    /* Match the Paradise Menu launcher's PRAM reset. */
    ldr r0, =0xe000ed08
    movs r1, #0
    str r1, [r0]
    ldr r0, =0xe000ed0c
    ldr r1, [r0]
    and r1, r1, #0x700
    ldr r2, =0x05fa0004
    orrs r1, r2
    str r1, [r0]
    dsb
4:  b 4b
#endif
    .ltorg
    .balign 4
flash_reload_end:
