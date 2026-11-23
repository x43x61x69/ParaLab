/* Paradise port of stock My Lab v1.0.00. The existing arrow timeline records
 * 0x79 and 0x7a animate the native yellow up/down triangles. Object-tree
 * ownership follows the page or dialog, so transitions dispose of all hints. */
.syntax unified
.cpu cortex-m3
.thumb

.section .p1f100,"ax",%progbits
    bl garden_alloc
.section .p1f4a4,"ax",%progbits
    b.w garden_restore_exit
.section .p1f264,"ax",%progbits
    bl garden_hints
.section .p3b8f2,"ax",%progbits
    bl item_hints
.section .p634d0,"ax",%progbits
    bl scrollbar_track
.section .p634e4,"ax",%progbits
    bl scrollbar_thumb
.section .p63658,"ax",%progbits
    b.w grid_hints

.section .p93480,"ax",%progbits
.ascii "GPAG0001"

/* r0 scene context, r1 parent, r2 timeline ID, r3 horizontal offset,
 * r4 vertical offset. Position the controller, leaving the timeline intact. */
.thumb_func
add_hint:
    push {r4-r6,lr}
    sub sp,#8
    mov r5,r3
    movs r3,#0
    str r3,[sp]
    bl object_create
    mov r6,r0
    cbz r5,1f
    ldr r1,[r6,#0x34]
    add.w r1,r1,r5,lsl #16
    add.w r0,r6,#0x14
    bl set_position
1:  cbz r4,2f
    ldr r1,[r6,#0x58]
    add.w r1,r1,r4,lsl #16
    add.w r0,r6,#0x38
    bl set_position
2:  add sp,#8
    pop {r4-r6,pc}

/* The garden widget stores one screen-fixed hint. Other callers of this
 * widget retain their original allocation, object tree and navigation. */
.thumb_func
garden_alloc:
    ldr r2,=0x18001708
    ldrh r2,[r2]
    cmp r2,#0x24
    it eq
    moveq r0,#16
    b.w allocate

.thumb_func
garden_hints:
    push {r4,lr}
    mov r4,r0
    bl widget_layer
    ldr r0,=0x18001708
    ldrh r0,[r0]
    cmp r0,#0x24
    bne 1f
    ldr r0,[r4,#0x11c]
    movs r1,#0
    str r1,[r0,#12]
    mov r0,r4
    bl garden_update
1:  pop {r4,pc}

.thumb_func
garden_restore_exit:
    ldr r0,=0x18001708
    ldrh r0,[r0]
    cmp r0,#0x24
    bne 1f
    ldr r0,[sp,#0x14]
    bl garden_update
1:  add sp,#0x18
    pop {r7,pc}

.thumb_func
garden_update:
    push {r4-r6,lr}
    sub sp,#8
    mov r4,r0
    ldr r5,[r4,#0x11c]
    ldrh r0,[r5]
    cmp r0,#4
    bls 3f
    ldrh r0,[r5,#2]
    cmp r0,#4
    ite lo
    movlo r6,#0x7a
    movhs r6,#0x79
    ldr r1,[r5,#12]
    cbz r1,2f
    ldr r0,[r1,#0xdc]     @ native timeline's original layout ID
    cmp r0,r6
    beq 3f
    ldr r0,[r1,#0x114]
    bl object_destroy
2:  ldr r0,[r4,#0x114]
    movs r1,#0
    mov r2,r6
    movs r3,#0
    str r3,[sp]
    bl object_create
    str r0,[r5,#12]
3:  add sp,#8
    pop {r4-r6,pc}

/* Collection page 2 of 3 already owns a down arrow. Add an up arrow to
 * its left, as a child of that controller so changing pages removes both. */
.thumb_func
item_hints:
    push {r4-r6,lr}
    sub sp,#8
    mov r5,r0
    str r3,[sp]        @ caller passes zero as both ID and callback
    bl object_create
    mov r6,r0
    ldr r0,=0x18011a8c
    ldr r0,[r0]
    ldrh r0,[r0,#0x28]
    cmp r0,#1
    bne 1f
    mov r0,r5
    mov r1,r6
    movs r2,#0x79
    mvn r3,#17
    movs r4,#0
    bl add_hint
1:  mov r0,r6
    add sp,#8
    pop {r4-r6,pc}

/* The research, pairing and recipient screens share a character selector.
 * The simulation results screen also uses this code and keeps its stock UI. */
.thumb_func
uses_page_hints:
    ldr r0,=0x18001708
    ldrh r0,[r0]
    cmp r0,#0x49
    beq 1f
    cmp r0,#0x4a
    beq 1f
    cmp r0,#0x4f
1:  bx lr

/* Keep both scrollbar objects on a one-page list: the retail restore path
 * still updates the thumb by its ID. Park them outside the drawing area. */
.thumb_func
scrollbar_track:
    push {r4,lr}
    mov r4,r1
    bl sprite_create
    b scroll_visibility
.thumb_func
scrollbar_thumb:
    push {r4,lr}
    mov r4,r1
    sub sp,#8
    mov.w ip,#0
    str.w ip,[sp]
    bl indexed_sprite_create
    add sp,#8
scroll_visibility:
    push {r0,r1}
    bl uses_page_hints
    bne 1f
    ldr r4,[r4,#0x11c]
    ldrh r0,[r4,#6]
    cmp r0,#1
    bhi 1f
    ldr r0,[sp]
    add r0,#0x14
    mov.w r1,#0x1000000
    bl set_position
1:  pop {r0,r1}
    pop {r4,pc}

/* Called once per visible research/recipient page, including a restored
 * page. Attach the arrows to that page so they share its slide transition.
 * A small inset keeps both arrows clear of the native scrollbar. */
.thumb_func
grid_hints:
    push {r4-r6,lr}
    bl uses_page_hints
    bne 3f
    ldr r0,[sp,#(0x24+16)]
    ldrh r5,[r0,#6]
    cmp r5,#1
    bls 3f
    ldrsh r6,[sp,#(0x2e+16)]
    subs r5,#1
    movs r4,#2
    cmp r6,#0
    beq 2f
    ldr r0,[sp,#(0x34+16)]
    ldr r1,[sp,#(0x28+16)]
    movs r2,#0x79
    mvn r3,#7
    cmp r6,r5
    it lo
    mvnlo r3,#25
    bl add_hint
2:  cmp r6,r5
    bhs 3f
    ldr r0,[sp,#(0x34+16)]
    ldr r1,[sp,#(0x28+16)]
    movs r2,#0x7a
    mvn r3,#7
    bl add_hint
3:  ldr r0,[sp,#(0x28+16)]
    pop {r4-r6,lr}
    add sp,#0x38
    pop {r7,pc}
.ltorg
