.syntax unified
.thumb
.section .text

// Computer menu dispatcher. Keep the stock handler for the four native rows.
movw r12, #0x7ffd
cmp r0, r12
beq start_flash_tool
ldr.w pc, stock_scene

start_flash_tool:
cpsid i
ldr r0, =0x4000800c
ldr r1, =0x5afa55aa
str r1, [r0]
// Reuse the native My Lab Flash Tool handoff clock setting.
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
ldr r0, =0x601af000
movs r1, #0
mov.w r2, #0xe000
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
.align 2
stock_scene: .word 0x10002b29
.ltorg
