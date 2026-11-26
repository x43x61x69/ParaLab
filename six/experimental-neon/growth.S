#ifndef GROWTH_SPECIES_SP
#define GROWTH_SPECIES_SP 0xc8
#define GROWTH_CARE_SP 0x38
#endif

.syntax unified
.thumb
.cpu cortex-m3

.section .text.header,"ax"
.global neon_growth_header
neon_growth_header:
  .word 0x5747524E             @ NRGW
  .word 4                      @ hold A during baby growth to select the Neon route
  .word neon_growth_hook - neon_growth_header
  .word neon_growth_config - neon_growth_header

.section .text.hook,"ax"
.thumb_func
.global neon_growth_hook
neon_growth_hook:
  push {r0,r2,r3,lr}           @ r0 is the native settings payload
  ldrh.w r1,[sp,#(GROWTH_SPECIES_SP + 16)]         @ species selected by the original growth routine
  ldr r2,[sp,#(GROWTH_CARE_SP + 16)]            @ original adult lineage and care index
  bl neon_growth_pick
  strh.w r0,[sp,#(GROWTH_SPECIES_SP + 16)]         @ later native growth calls reuse this species
  mov r1,r0
  pop {r0,r2,r3,pc}           @ return the selected species in r1

#ifdef GROWTH_FOOD_HISTORY
#ifndef GROWTH_FOOD_ACCEPT
#define GROWTH_FOOD_ACCEPT 0x10010289
#define GROWTH_FOOD_REJECT 0x1001033b
#endif
#ifdef GROWTH_INLINE_FOOD
#define FOOD_CHARACTER_SP 0x44
#define FOOD_KIND_SP 0x48
#define FOOD_ITEM_SP 0x4c
#undef GROWTH_FOOD_ACCEPT
#undef GROWTH_FOOD_REJECT
#define GROWTH_FOOD_ACCEPT 0x1000e765
#define GROWTH_FOOD_REJECT 0x1000e817
#else
#define FOOD_CHARACTER_SP 0x2c
#define FOOD_KIND_SP 0x30
#define FOOD_ITEM_SP 0x34
#endif
.org 0x30
.thumb_func
neon_food_hook:
  ldr r0,[sp,#FOOD_CHARACTER_SP] @ reproduce the two displaced instructions
  ldrh r0,[r0,#0xe]
  subs r2,r0,#7
  cmp r2,#2
  bhi 1f
  ldr r1,[sp,#FOOD_KIND_SP]
  ldr r2,[sp,#FOOD_ITEM_SP]
  ldrh r2,[r2]
  push {r3,lr}
  bl neon_food_kind
  cbz r0,2f
  str r0,[sp,#(FOOD_KIND_SP + 8)]
  ldr lr,=GROWTH_FOOD_ACCEPT @ increment the native food counter
  pop {r3}
  add sp,#4
  bx lr
2:ldr lr,=GROWTH_FOOD_REJECT @ skip straight to the other meal effects
  pop {r3}
  add sp,#4
1:bx lr
.ltorg
#endif

/* The old renderer may replace a Neon youngster's eye layer with a blank
 * resident-record eye. Keep the source animation's eye for those sprites. */
.org 0x90
.thumb_func
neon_field_eye_hook:
  ldrh.w r12,[sp,#0xe6]      @ body animation used by the sprite renderer
  push {r0}
  ldr r0,neon_eye_range
  uxth r0,r0
  cmp r12,r0
  blo 1f
  ldr r0,neon_eye_range
  cmp r12,r0,lsr #16
  bhs 1f
  pop {r0}
  ldr r12,=GROWTH_DEFAULT_EYE
  bx r12
1:pop {r0}
  ldr r12,=GROWTH_CACHED_EYE
  bx r12
.ltorg
.org 0xd0
neon_eye_range:
  .word 0
