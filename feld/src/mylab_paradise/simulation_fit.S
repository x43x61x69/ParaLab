/* Extend the installed four-cell selector to the simulation results (scene
 * 0x4b). The existing GridFit and PageHints implementations handle page
 * sizes, record lookup, pointer movement, restoration, and the native scrollbar. */
.syntax unified
.cpu cortex-m3
.thumb

/* The four scrollbar lists share this constructor. Resume the stock
 * epilogue without creating additional corner arrows. */
.section .p63658,"ax",%progbits
    ldr r0,[sp,#0x28]
    add sp,#0x38

.section .p9302e,"ax",%progbits
    b.w simulation_records
.section .p9307a,"ax",%progbits
    b.w simulation_size
.section .p93576,"ax",%progbits
    b.w simulation_hints

/* The down arrow reaches one pixel farther during its bounce. Keep its
 * bottom outline inside the panel throughout the native animation. */
.section .p93600,"ax",%progbits
    bl down_hint

.section .p93640,"ax",%progbits
.ascii "GSIM0001"

.thumb_func
simulation_records:
    cmp r1,#0x4b
    beq.w character_records
    cmp r1,#0x4a
    beq.w character_records
    b.w other_records

.thumb_func
simulation_size:
    cmp r3,#0x4b
    beq.w four_cells
    cmp r3,#0x4a
    beq.w four_cells
    b.w other_size

.thumb_func
simulation_hints:
    cmp r0,#0x4b
    it ne
    cmpne r0,#0x4a
    it ne
    cmpne r0,#0x4f
    bx lr

.thumb_func
down_hint:
    movs r4,#1
    b.w add_hint
