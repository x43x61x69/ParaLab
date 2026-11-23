/* My Lab v1.0.00 on Paradise. Each section is linked to its original XIP
 * address. The 0x10093xxx sections occupy the port's separate grid-fit sector.
 * Reassemble with build_grid_fit.py and compare its output to the JS patch list. */
.syntax unified
.cpu cortex-m4
.thumb

@ Scene-specific layout record
.section .p159e4,"ax",%progbits
bl record

@ Scene-specific layout record
.section .p16332,"ax",%progbits
bl record

@ Scene-specific layout record
.section .p16372,"ax",%progbits
bl record

@ Move garden page and cursor together
.section .p1f2c8,"ax",%progbits
b.w garden_turn

@ Restore garden page
.section .p1f49e,"ax",%progbits
bl garden_restore_both

@ Restore selected page
.section .p1f8b0,"ax",%progbits
bl page_number

@ Restore selected cell
.section .p1f8e6,"ax",%progbits
bl slot

@ Keep the garden wallpaper fixed when the card group scrolls
.section .p3ac54,"ax",%progbits
movs r1,#0

@ Keep the garden wallpaper fixed when the card group scrolls
.section .p3afa6,"ax",%progbits
movs r1,#0

@ Build all thirty items
.section .p3b60c,"ax",%progbits
cmp r0,#29
bgt.w item_built

@ Cell template for absolute item
.section .p3b626,"ax",%progbits
bl item_frame

@ Icon template for absolute item
.section .p3b65a,"ax",%progbits
bl item_icon

@ Place item on its page
.section .p3b6ac,"ax",%progbits
bl item_position
ldrh.w r0,[sp,#0x56]

@ Advance original item ID
.section .p3b6b4,"ax",%progbits
adds r0,#1
strh.w r0,[sp,#0x56]
b item_loop

@ Three-page wrap
.section .p3b838,"ax",%progbits
cmp r1,#3
it hs
movhs r1,#0

@ Up indicator on last page
.section .p3b8d4,"ax",%progbits
cmp r0,#2
.hword 0xd012 @ beq.n 0x1003b8fe (last-page arrow)

@ Page count
.section .p63464,"ax",%progbits
bl page_count

@ Number of real cells on this page
.section .p63522,"ax",%progbits
bl remaining
str r0,[sp,#8]

@ First item on page
.section .p6356c,"ax",%progbits
bl absolute_index

@ Preserve wheel direction and detect a 4- or 6-cell page boundary
.section .p63702,"ax",%progbits
bl wheel_page

@ Render new page
.section .p637cc,"ax",%progbits
bl page_number

@ Animate cursor to selected cell
.section .p63892,"ax",%progbits
bl slot

@ Grid Thumb routines
.section .p93000,"ax",%progbits

.ascii "PGRD0001"
.thumb_func
record:
    add.w r0,r0,r1,lsl #1
    cmp.w r2,#0x2c0
    bhs 9f
    cmp r2,#0x87
    blo 9f
    push {r1-r5,lr}
    ldr r1,=0x1800d940
    ldr r4,[r1]
    @ Check the base against the active record pack, because other packs reuse these IDs.
    sub.w r5,r0,r4
    cmp.w r5,#0x10000
    bhs 8f
    ldr r1,=0x18001708
    ldrh r1,[r1]
    cmp r1,#0x49
    beq 1f
    cmp r1,#0x4a
    beq 2f
    cmp r1,#0x4f
    beq 2f
    cmp r1,#0x24
    beq 3f
    cmp r1,#0x34
    bne 8f
    movs r3,#8
    b 4f
1:  movs r3,#3
    b 4f
2:  movs r3,#2
    b 4f
3:  movs r3,#4
4:  ldr r5,=0x10093800
    ldrh r4,[r5],#2
5:  cbz r4,8f
    ldrh r1,[r5]
    cmp r1,r2
    bne 6f
    ldrh r1,[r5,#2]
    tst r3,r1
    beq 6f
    ldrh r1,[r5,#4]
    ldr r0,=0x10093800
    adds r0,r1
    b 8f
6:  adds r5,#6
    subs r4,#1
    b 5b
8:  pop {r1-r5,pc}
9:  bx lr
.thumb_func
size:
    ldr r3,=0x18001708
    ldrh r3,[r3]
    cmp r3,#0x49
    beq 1f
    cmp r3,#0x4a
    beq 1f
    cmp r3,#0x4f
    beq 1f
    movs r3,#6
    bx lr
1:  movs r3,#4
    bx lr
.thumb_func
page_count:
    push {r3,lr}
    bl size
    adds r0,r3
    subs r0,#1
    udiv r0,r0,r3
    pop {r3,pc}
.thumb_func
page_number:
    push {r3,lr}
    bl size
    udiv r0,r0,r3
    pop {r3,pc}
.thumb_func
slot:
    push {r1,r3,r4,lr}
    bl size
    udiv r1,r0,r3
    mls r0,r1,r3,r0
    pop {r1,r3,r4,pc}
.thumb_func
remaining:
    push {r3,lr}
    bl size
    mls r0,r1,r3,r0
    cmp r0,r3
    it gt
    movgt r0,r3
    pop {r3,pc}
.thumb_func
absolute_index:
    push {r3,lr}
    bl size
    mla r1,r2,r3,r1
    pop {r3,pc}
.thumb_func
garden_turn:
    ldr r0,=0x18001708
    ldrh r0,[r0]
    cmp r0,#0x24
    bne 1f
    ldr r0,[sp,#0x24]
    ldr r1,[r0,#0x11c]
    ldrsh r1,[r1,#2]
    bl garden_select
    b.w garden_sfx
1:  ldr r0,[sp,#0x1c]
    ldr r1,[r0,#8]
    add.w r2,r1,#0x14
    str r2,[sp,#0xc]
    b.w garden_resume
.thumb_func
garden_restore:
    ldr r0,=0x18001708
    ldrh r0,[r0]
    cmp r0,#0x24
    it ne
    bxne lr
    push {r0-r3,r4,lr}
    ldr r4,[sp,#(0x14+24)]
    ldr r1,[r4,#0x11c]
    ldrsh r1,[r1,#2]
    cmp r1,#4
    mov.w r1,#0
    it hs
    movths r1,#0xff80
    add.w r0,r4,#0x38
    bl pos
    pop {r0-r3,r4,pc}
.thumb_func
item_frame:
    movs r3,#12
    udiv ip,r2,r3
    mls r2,ip,r3,r2
    addw r2,r2,#0x2a1
    bx lr
.thumb_func
item_icon:
    movs r3,#12
    udiv ip,r2,r3
    mls r2,ip,r3,r2
    addw r2,r2,#0x2b0
    movs r3,#0
    bx lr
.thumb_func
item_position:
    push {r0-r3,r4,lr}
    ldrh r2,[sp,#(0x56+24)]
    movs r3,#12
    udiv r2,r2,r3
    ldr r0,[sp,#(0x50+24)]
    ldr r1,[r0,#0x58]
    add.w r1,r1,r2,lsl #23
    adds r0,#0x38
    bl pos
    pop {r0-r3,r4,pc}
.ltorg


@ Grid Thumb routines
.section .p93300,"ax",%progbits
.thumb_func
garden_restore_both:
push {r2,lr}
bl pos
pop {r2,lr}
b.w garden_restore

@ Grid Thumb routines
.section .p93400,"ax",%progbits
 .thumb_func
wheel_page:
    push {r4-r6,lr}
    mov r4,r0
    ldrh r5,[r4,#4]
    bl advance
    bl size
    udiv r5,r5,r3
    ldrh r0,[r4,#4]
    udiv r0,r0,r3
    subs r0,r5
    it ne
    movne r0,#1
    pop {r4-r6,pc}

