// Build from this directory:
// clang --target=thumbv7m-none-eabi -c settings_layout.S -o /tmp/settings_layout.o
// llvm-objcopy -O binary -j .text /tmp/settings_layout.o ../../my-lab-settings-layout.bin
// Optional My Lab v1.0.00 Settings layout. Replaces the last instruction
// loading the return value in the native layout-record decoder (0x10016274).
// The decoder's stack still holds the normalized record ID, bank and output.
.syntax unified
.thumb
.text
.thumb_func
settings_layout:
    ldr r0, =0x18001708
    ldrh r0, [r0]
    cmp r0, #0x32              // Computer > Settings
    bne done
    ldrh.w r0, [sp, #14]
    cbnz r0, done              // main asset bank only
    ldrh.w r0, [sp, #22]
    cmp r0, #0x79
    blo done
    cmp r0, #0x8a
    bhi done
    ldr r1, [sp, #16]
    cmp r0, #0x7a
    bhi row
    ldrh r2, [r1, #4]
    adds r2, #2
    strh r2, [r1, #4]
    movs r2, #80               // center the page indicator below the list
    b set_x
row:
    ldrh r2, [r1, #4]
    subs r2, #5                // reserve a footer below the fourth row
    strh r2, [r1, #4]
    cmp r0, #0x7f
    blo inset
    cmp r0, #0x82
    bhi inset
    movw r2, #0xf00            // row artwork: 120 px instead of 128
    strh r2, [r1, #10]
    b done
inset:
    ldrh r2, [r1, #2]          // labels, selection cursor and status marks
    adds r2, #4
set_x:
    strh r2, [r1, #2]
done:
    ldrsb.w r0, [sp, #5]
    add sp, #24
    pop {r7, pc}
.ltorg


// The cursor animation also asks for its original Y directly, bypassing
// the decoder. Apply the same inset when calculating its destination.
.org 0x60
.thumb_func
cursor_y:
    ldrsh.w r0, [r0, #4]
    cmp r2, #0x83
    blo return_y
    cmp r2, #0x86
    bhi return_y
    ldrh.w r1, [sp, #4]
    cbnz r1, return_y
    ldr r1, =0x18001708
    ldrh r1, [r1]
    cmp r1, #0x32
    it eq
    subeq r0, #5
return_y:
    add sp, #8
    pop {r7, pc}
.ltorg
