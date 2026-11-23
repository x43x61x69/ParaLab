/* Install the selected food's actual sprite at its native pixel scale.
 * The plate, highlight, quantity text and availability retain their own
 * controllers and do not share this sprite's scale. */
.syntax unified
.cpu cortex-m3
.thumb
.section .p3c52c,"ax",%progbits
    bl food_sprite

.section .p936b0,"ax",%progbits
.ascii "GFOO0001"
.thumb_func
food_sprite:
    strh r0,[r1,#0x12]          @ Original assignment from the item record.
    push {r1,lr}
    add.w r0,r1,#0x7c
    movw r1,#328                @ The plate contributes 200/256; (200*328)>>8 = 256.
    bl set_value
    pop {r1,lr}
    ldr r0,[sp,#0xa0]           @ Original quantity, including unlimited foods.
    bx lr

/* Override only the four plate objects, their food objects, and the selector.
 * The object's game sprite ID is retained for inventory and for the top tray.
 * Only the temporary draw descriptor uses a precomputed compact tile. */
.section .p7c2c,"ax",%progbits
    bl compact_tile
.section .p936e0,"ax",%progbits
.ascii "GFOO0002"
.thumb_func
compact_tile:
    ldr r0,[sp,#4]             @ Calculated render scale, 16.16.
    push {r1-r4}
    ldr r1,=0x18001708
    ldrh r1,[r1]
    cmp r1,#0x2b
    bne done
    ldr r1,=0x18011a98
    ldr r1,[r1]
    cbz r1,done
    ldr r2,[sp,#(0x6c+16)]    @ Current drawable.
    ldr r3,[r1,#0x64]
    cmp r2,r3
    beq selector
    add r1,#0x34
    movs r4,#8
1:  ldr r3,[r1],#4            @ Four plate pointers, then four food pointers.
    cmp r2,r3
    beq found
    subs r4,#1
    bne 1b
    b done
selector:
    movs r3,#0
    b lookup
found:
    cmp r4,#4
    bls food
    movs r3,#1
    b lookup
food:
    ldrh r3,[r2,#0x12]
    subw r3,r3,#1307
    cmp r3,#90
    bhi done
    adds r3,#2
lookup:
    ldr r1,=0x601d8000
    ldrh.w r3,[r1,r3,lsl #1] @ Sparse, archive-relative 16-bit offsets.
    cbz r3,done
    adds r1,r3
    str r1,[sp,#(0x28+16)]
    mov.w r0,#0x10000
done:
    pop {r1-r4}
    str r0,[sp,#0x38]
    bx lr
.ltorg
