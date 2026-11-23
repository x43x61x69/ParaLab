// Link .draw_hook at 0x1003F89C, .draw_code at 0x100D2020 and thumb
// resume_draw at 0x1003F8A1. The assembled bytes are in mylab_dialog_wrap.js.
// The original draw function receives the active text object in r0. Match
// its original string pointer against the live ARC2 language table, so other
// messages which share the same layout keep their original spacing.
.syntax unified
.cpu cortex-m3
.thumb
.section .draw_hook,"ax",%progbits
b.w fit_draw
.section .draw_code,"ax",%progbits
.thumb_func
fit_draw:
 push {r4,r5,r6,lr}
 mov r4,r0
 ldr r1,=0x18001708
 ldrh r1,[r1]
 cmp r1,#0x46
 blo unchanged
 cmp r1,#0x50
 bhi unchanged
 ldr r0,=0x180006ea
 ldrh r0,[r0]
 ubfx r0,r0,#9,#4
 subs r0,#1
 cmp r0,#8
 bhi unchanged
 ldr r2,=0x60211000
 ldr r3,[r2,#52]
 add r2,r3
 add.w r3,r2,r0,lsl #4
 ldr r3,[r3,#20]
 add r2,r3
 adr.w r5,tracking_rows
again:
 ldrb r3,[r5]
 cbz r3,unchanged
 cmp r3,r1
 bne advance
 ldrh r3,[r5,#2]
 ldrh.w r3,[r2,r3,lsl #1]
 add.w r3,r2,r3,lsl #1
 ldr r6,[r4]
 cmp r3,r6
 bne advance
 add.w r3,r5,#4
 ldrsb r3,[r3,r0]
 cbz r3,unchanged
 ldrh r6,[r4,#32]
 strh r3,[r4,#32]
 mov r0,r4
 bl native_draw
 strh r6,[r4,#32]
 pop {r4,r5,r6,pc}
advance:
 adds r5,#14
 b again
unchanged:
 mov r0,r4
 pop {r4,r5,r6,lr}
native_draw:
 push {r7,lr}
 sub sp,#0x60
 b.w resume_draw
.ltorg
.balign 2
// Row format: scene, padding, native table index, signed tracking for JP,
// EN, FR, DE, PT, ES, IT, ZH and KO, then alignment. Zero keeps the
// existing spacing. Layouts cap the longest centered pages at eight lines.
tracking_rows:
 .byte 0x46,0
 .hword 574
 .byte 0,0,0,0,0,0,-2,0,0,0
 .byte 0x47,0
 .hword 583
 .byte 0,0,-1,0,-1,0,-2,0,0,0
 .byte 0x48,0
 .hword 615
 .byte 0,-2,-2,-2,-2,-1,-2,0,-1,0
 .byte 0x4e,0
 .hword 629
 .byte -2,0,0,-1,-1,0,0,0,0,0
 .byte 0x4f,0
 .hword 637
 .byte -2,-1,-2,-2,-1,-2,-2,0,-2,0
 .byte 0x4f,0
 .hword 639
 .byte -1,0,0,0,0,0,0,0,-2,0
 .byte 0x4f,0
 .hword 640
 .byte -2,0,-1,-1,-1,-1,-1,0,-2,0
 .byte 0x4f,0
 .hword 641
 .byte -1,0,0,0,0,0,0,0,-1,0
 .byte 0x50,0
 .hword 641
 .byte -1,0,0,0,0,0,0,0,-1,0
 .byte 0
