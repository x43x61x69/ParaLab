/* Paradise partner record header. Thumb addresses in the stock My Lab XIP space.
 * ROM 0x126c64 / CPU 0x10015c64 branches to name_spacing at 0x100dd000.
 * ROM 0x16843c / CPU 0x1005743c calls size_name at 0x100dd050.
 * Compile with clang -target armv7m-none-eabi -c record_badge.S -o record_badge.o
 * Link with ld.lld -Ttext=0x100dd000 --defsym=initialize_text=0x10040159
 *   --defsym=resume=0x10015c68 --oformat=binary -o record_badge.bin record_badge.o
 */
.syntax unified
.thumb
.cpu cortex-m4
.global name_spacing
.thumb_func
name_spacing:
 @ Replay overwritten layout instructions, then select the partner-title record.
 ldr r1,[sp,#16]
 movs r0,#0
 ldrh.w r2,[sp,#22]
 cmp.w r2,#0x194
 bne done
 ldr r2,=0x18001708
 ldrh r2,[r2]
 cmp r2,#0x55
 bne done
 ldr r2,=0x180006ea
 ldrh r2,[r2]
 ubfx r2,r2,#9,#4
 @ Korean keeps the original tracking. All six Latin slots use the same glyphs.
 cmp r2,#9
 beq center
 cmp r2,#1
 bne western
 movs r2,#82
 strh r2,[r1,#2]
 ldrh r2,[r1,#4]
 adds r2,#1
 strh r2,[r1,#4]
 b done
western:
 cmp r2,#2
 blo done
 cmp r2,#7
 bhi done
 movs r0,#2
 rsbs r0,r0,#0
center:
 movs r2,#84
 strh r2,[r1,#2]
done:
 b.w resume
.ltorg

.p2align 2
.global size_name
.thumb_func
size_name:
 push {r4,r5,r6,lr}
 @ Save the output descriptor, layout ID and localized glyph stream.
 mov r6,r0
 mov r4,r1
 mov r5,r2
 bl initialize_text
 cmp.w r4,#0x194
 bne size_done
 ldr r0,=0x18001708
 ldrh r0,[r0]
 cmp r0,#0x55
 bne size_done
 ldr r0,=0x180006ea
 ldrh r0,[r0]
 ubfx r0,r0,#9,#4
 cmp r0,#1
 bne size_done
 @ Short Japanese names retain their native spacing. At nine glyphs close each
 @ advance by one pixel, and at ten or more close it by two.
 movs r1,#0
loop:
 ldrh r0,[r5,r1]
 cbz r0,size_done
 adds r1,#2
 cmp r1,#18
 blo loop
 ldrh r0,[r5,#18]
 movs r1,#1
 cmp r0,#0
 it ne
 movne r1,#2
 rsbs r1,r1,#0
 strh r1,[r6,#0x20]

size_done:
 pop {r4,r5,r6,pc}
.ltorg
