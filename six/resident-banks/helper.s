.syntax unified
.cpu cortex-m3
.thumb
.section .text
.p2align 2

.equ MAGIC,          0x31425352
#ifdef JADE
.equ VERSION,        2
.equ BANK_LIVE,      0x18001aa0
.equ SPLIT_READY,      0x18001ab8
.equ INACTIVE_MASK,  0x18001ab0
.equ LIVE_ROSTER,    0x18000d64
.equ DNA_SWITCH,     0x100fec64
.equ READ_CONT,      0x100161ad
.equ WRITE_CONT,     0x1007d5f1
.equ CAPACITY,       0x100161e5
.equ VALIDATE,       0x10015efd
.equ FLASH_PROGRAM,  0x1007dca5
#else
.equ VERSION,        1
.equ BANK_LIVE,      0x18001ae8
.equ SPLIT_READY,      0x18001af3
.equ INACTIVE_MASK,  0x18001b49
.equ READ_CONT,      0x100186ad
.equ WRITE_CONT,     0x10090941
.equ CAPACITY,       0x100186e5
.equ VALIDATE,       0x100183fd
.equ FLASH_PROGRAM,  0x10091027
#endif
.equ COMMITTED,      0x60fb7000
.equ HIGH_RECORDS,   0x60fb8000
.equ LOW_RECORDS,    0x60d01000
.equ FORCE_NATIVE,   0x40
.equ FORCE_PRIVATE,  0x80

.global _start
_start:
  .word MAGIC, VERSION
  .word read_record - _start, write_record - _start
  .word record_capacity - _start, release_result - _start
  .word COMMITTED, HIGH_RECORDS, LOW_RECORDS
#ifdef JADE
  .word swap_jade_roster - _start
#endif

@ The tagged indices are confined to the internal stock copy and validation
@ calls below. Public ghost IDs and the stock capacity table stay the same.
.thumb_func
read_record:
  uxtb r0, r0
  bic r1, r0, #(FORCE_NATIVE | FORCE_PRIVATE)
  subs r2, r1, #1
#ifdef JADE
  sub.w r3, r2, #4
  cmp r3, #3
#else
  cmp r2, #23
#endif
  bhi native_lookup
  tst r0, #FORCE_PRIVATE
  bne private_lookup
  tst r0, #FORCE_NATIVE
  bne native_lookup
  ldr r3, =BANK_LIVE
  ldrb r3, [r3]
  cmp r3, #1
  bne native_lookup
  ldr r3, =COMMITTED
  ldr r3, [r3, r2, lsl #2]
  ldr r12, =MAGIC
  cmp r3, r12
  beq private_lookup
native_lookup:
  mov r0, r1
  push {r7, lr}
  sub sp, #8
  ldr r12, =READ_CONT
  bx r12
private_lookup:
  cmp r2, #14
  blo high_lookup
  subs r2, #14
  ldr r0, =LOW_RECORDS
  b add_record_offset
high_lookup:
  ldr r0, =HIGH_RECORDS
add_record_offset:
  add.w r0, r0, r2, lsl #14
  bx lr

.thumb_func
record_capacity:
  bic r0, r0, #(FORCE_NATIVE | FORCE_PRIVATE)
  ldr r12, =CAPACITY
  bx r12

@ A bank 1 release always uses its separate record. A bank 0 release can
@ overwrite the shared legacy address only after preserving any occupied
@ bank 1 record there. The commit word survives later private record rewrites.
.thumb_func
write_record:
  uxtb r0, r0
  subs r2, r0, #1
#ifdef JADE
  sub.w r3, r2, #4
  cmp r3, #3
  bhi write_other
#else
  cmp r2, #23
  bhi native_write
#endif
  push {r4-r6, lr}
  mov r4, r0
  mov r5, r1
  ldr r3, =BANK_LIVE
  ldrb r3, [r3]
  cmp r3, #1
  beq write_private
  ldr r3, =SPLIT_READY
  ldrb r3, [r3]
  cmp r3, #0x5a
  bne write_native_resident
  ldr r3, =COMMITTED
  ldr r3, [r3, r2, lsl #2]
  ldr r12, =MAGIC
  cmp r3, r12
  beq write_native_resident
  ldr r3, =INACTIVE_MASK
#ifdef JADE
  ldrh r3, [r3]
  lsrs r3, #6
  and r6, r2, #3
#else
  lsrs r6, r2, #3
  ldrb r3, [r3, r6, lsl #2]
  and r6, r2, #7
#endif
  lsrs r3, r6
  lsls r3, #31
  beq write_native_resident
  orr r0, r4, #FORCE_NATIVE
  bl validate_record
  cbz r0, write_native_resident
  orr r1, r4, #FORCE_NATIVE
  mov r0, r4
  bl copy_private_record
  cbz r0, finish_write
write_native_resident:
  mov r0, r4
  mov r1, r5
  bl native_write
  movs r0, #1
  b finish_write
write_private:
  bl copy_private_record
finish_write:
  pop {r4-r6, pc}

.thumb_func
native_write:
  push {r7, lr}
  sub sp, #0x30
  ldr r12, =WRITE_CONT
  bx r12

@ Store ownership only after stock validation of the completed record; a
@ power loss during a first copy still leaves the old shared record readable.
.thumb_func
copy_private_record:
  push {r4-r6, lr}
  mov r4, r0
  orr r0, r0, #FORCE_PRIVATE
  bl native_write
  orr r0, r4, #FORCE_PRIVATE
  bl validate_record
  cbz r0, private_done
  subs r4, #1
  ldr r5, =COMMITTED
  add.w r5, r5, r4, lsl #2
  ldr r6, =MAGIC
  ldr r0, [r5]
  cmp r0, r6
  beq private_ok
  sub sp, #8
  str r6, [sp, #4]
  movs r0, #1
  str r0, [sp]
  add r3, sp, #4
  movs r2, #4
  mov r1, r5
  movs r0, #3
  cpsid i
  ldr r12, =FLASH_PROGRAM
  blx r12
  cpsie i
  add sp, #8
  ldr r0, [r5]
  cmp r0, r6
  bne private_failed
private_ok:
  movs r0, #1
  b private_done
private_failed:
  movs r0, #0
private_done:
  pop {r4-r6, pc}

@ Called from the stock release immediately after write_record. An aborted
@ migration must not advance the roster cursor against the unchanged record.
.thumb_func
release_result:
  cbz r0, validation_done
  ldrb.w r0, [sp, #3]
validate_record:
  ldr r12, =VALIDATE
  bx r12
validation_done:
  bx lr
#ifdef JADE
.thumb_func
write_other:
  push {r4, lr}
  bl native_write
  movs r0, #1
  pop {r4, pc}

@ The Water slot is the only shared field on Jade. Leave the existing
@ roster assigned to the previously active bank on a save's first switch.
.thumb_func
swap_jade_roster:
  push {r1-r5, lr}
  ldr r4, =BANK_LIVE
  ldrb r5, [r4]
  ldr r12, =DNA_SWITCH
  ldr r12, [r12]
  blx r12
  ldrb r1, [r4]
  cmp r1, r5
  beq 3f
  ldr r1, =SPLIT_READY
  ldr r2, =INACTIVE_MASK
  ldrb r3, [r1]
  cmp r3, #0x5a
  beq 1f
  movs r3, #0x5a
  strb r3, [r1]
  movs r3, #0
  str r3, [r2]
  str r3, [r2, #4]
1:
  ldr r1, =LIVE_ROSTER
  ldmia r1, {r3-r4}
  ldmia r2, {r5,r12}
  stmia r1, {r5,r12}
  stmia r2, {r3-r4}
3:
  pop {r1-r5, pc}
#endif

.ltorg
