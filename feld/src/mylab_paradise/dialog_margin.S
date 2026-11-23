// Linked at hook 0x10015D2C and helper 0x100D1020, with thumb resume
// 0x10015D39. This hook follows the existing text-fit layout decoder.
.syntax unified
.cpu cortex-m3
.thumb
.section .hook,"ax",%progbits
b.w fit_confirm
.section .code,"ax",%progbits
.thumb_func
fit_confirm:
 strh r0,[r1]             // displaced native text ID store
 ldrh.w r2,[sp,#22]
 cmp r2,#0x9d             // confirmation text layout record
 bne finish
 ldr r2,=0x18001708
 ldrh r2,[r2]
 cmp r2,#0x24
 beq set_left
 cmp r2,#0x47
 beq set_left
 cmp r2,#0x48
 beq set_left
 cmp r2,#0x4f
 beq set_left
 cmp r2,#0x50
 beq set_left
 cmp r2,#0x64
 bne finish
set_left:
 movs r2,#28              // centered crop x=16; first visible ink at x=6
 strh r2,[r1,#2]
 ldr r2,=0x180006ea
 ldrh r2,[r2]
 ubfx r2,r2,#9,#4         // localized text tracking, as in text_fit.S
 cmp r2,#1
 beq finish
 cmp r2,#8
 bhs finish
 movs r2,#2
 rsbs r2,r2,#0
 strh r2,[r1,#8]
finish:
 b.w resume
.ltorg
