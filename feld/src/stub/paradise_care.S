.syntax unified
.cpu cortex-m3
.thumb
.section .text.care_entry,"ax",%progbits
.global care_entry
.thumb_func
care_entry:
  push {r0-r6,lr}
  ldr r4, care_save
  ldr r1, care_version
  mov r0, r4
  movs r2, #0
  ldr r3, care_options
  bl care_game
  mov r5, r0
  ldmia sp, {r0-r3}
  bl native_tick
  str r0, [sp]
  mov r0, r4
  ldr r1, care_version
  mov r2, r5
  ldr r3, care_options
  bl care_game
  pop {r0-r6,pc}

.org 0x40
.word 0x45524143
.word 0                       @ native tick flash offset (for uninstall)
care_save: .word 0            @ settings page address, including CRC offset
care_version: .word 0         @ save layout index
.thumb_func
native_tick:
  .word 0                     @ original tick prologue
  .word 0                     @ branch to tick + 4
.word 0x32524143
care_options: .word 0        @ installed optional gameplay patches
.word 0                      @ native fuel updater flash offset (for uninstall)
fuel_address: .word 0       @ address of the native fuel byte in the save
.thumb_func
fuel_update:
  ldr r1, fuel_address
  movs r0, #60
  strb r0, [r1]
  bx lr
