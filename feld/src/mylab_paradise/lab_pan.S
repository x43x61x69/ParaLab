/* Pan the centred laboratory viewport before dispatching to the fitted renderer. */
.syntax unified
.cpu cortex-m3
.thumb
.equ lab_destination, 0x40
.equ lab_bias, 0x41
.equ lab_last_cursor, 0x42
.equ lab_manual, 0x43
.equ lab_step, 4
.section .p18dc4,"ax",%progbits
movs r0,#0x44
.section .p35c68,"ax",%progbits
bl lab_keys
.section .p537a4,"ax",%progbits
b.w lab_window
.section .p98000,"ax",%progbits
.ascii "LABPAN05"
.thumb_func
lab_keys:
 push {r4,lr}
 bl edge
 cbnz r0,done
 ldr r1,=0x1008f000
 ldr r1,[r1]
 ldr r2,=0x3252424d
 cmp r1,r2
 bne done
 ldr r1,=0x18001730
 ldr r1,[r1]
 tst r1,#3
 bne done
 movs r0,#4
 bl edge
 cbz r0,done
 ldr r4,=0x18011a18
 ldr r4,[r4]
 ldrb r1,[r4,#lab_destination]
 adds r1,#1
 cmp r1,#3
 it hs
 movhs r1,#0
 strb r1,[r4,#lab_destination]
 movs r0,#1
 strb r0,[r4,#lab_manual]
 movs r0,#0
 movs r1,#100
 bl sound
 movs r0,#0
done:
 pop {r4,pc}
.thumb_func
lab_window:
 ldr r1,=0x18001708
 ldrh r1,[r1]
 cmp r1,#0x20
 bne render
 ldr r1,=0x18011a18
 ldr r1,[r1]
 cbz r1,render
 // Follow the native cursor while it exists. A new selection releases
 // the manual C override. Zero records that no cursor has been seen.
 ldr r2,[r1,#0x2c]
 cbz r2,pan
 ldrh r2,[r1,#0x34]
 cmp r2,#3
 bhi pan
 adds r2,#1
 ldrb r3,[r1,#lab_last_cursor]
 cmp r2,r3
 bne new_cursor
 ldrb r3,[r1,#lab_manual]
 cbnz r3,pan
 b follow
new_cursor:
 strb r2,[r1,#lab_last_cursor]
 movs r3,#0
 strb r3,[r1,#lab_manual]
follow:
 cmp r2,#4
 beq guest
 adr r3,cursor_destinations
 ldrb r2,[r3,r2]
 b save_destination
guest:
 // Combine the actor's room anchor with its signed walk offset.
 ldr r2,[r1,#0x30]
 cbz r2,guest_center
 ldr.w r2,[r2,#0x120]
 cbz r2,guest_center
 ldrsh.w r3,[r2,#0x4a]
 ldrsh.w r2,[r2,#0x0e]
 adds r3,r2
 movs r2,#1
 cmp r3,#64
 blt save_destination
 movs r2,#2
 cmp r3,#96
 bge save_destination
guest_center:
 movs r2,#0
save_destination:
 strb r2,[r1,#lab_destination]
pan:
 ldrb r2,[r1,#lab_destination]
 adr r3,lab_destinations
 ldrsb r2,[r3,r2]
 ldrsb.w r3,[r1,#lab_bias]
 // All destinations and the initial bias are multiples of the step.
 cmp r3,r2
 itt lt
 addlt r3,#lab_step
 strblt r3,[r1,#lab_bias]
 itt gt
 subgt r3,#lab_step
 strbgt r3,[r1,#lab_bias]
 // The framebuffer stores reversed 256-byte columns.
 add.w r0,r0,r3,lsl #8
render:
 b.w draw
.balign 4
cursor_destinations:
 .byte 0,1,0,2 // No cursor, door, computer, clock.
lab_destinations:
 .byte 0,16,-16
.ltorg
