// My Lab v1.0.00, after decoding a text record. Assemble the stub used in
// src/mylab_text_fit.js with clang --target=thumbv7m-none-eabi -c text_fit.S
// and ld.lld -Ttext=0x10097E00 --defsym=resume=0x10015D2C --oformat=binary.
.syntax unified
.cpu cortex-m4
.thumb
.global text_fit
.thumb_func
text_fit:
    ldrh r0, [r0]               // displaced text ID load
    ldr r1, [sp, #16]           // displaced destination object load
    ldrh.w r2, [sp, #22]        // layout record ID
    ldr r3, =0x18001708         // current scene
    ldrh r3, [r3]
    cmp r3, #0x50               // Tama sitting, centered explanations
    bne confirmation
    cmp r2, #0x9b
    beq tighten
    b done
confirmation:
    cmp r3, #0x24               // garden invitation
    beq check_prompt
    cmp r3, #0x48               // skill test
    bne letter
check_prompt:
    cmp r2, #0x9d
    bne done
    movs r2, #24
    strh r2, [r1, #2]
    ldr r3, =0x180006EA         // language bits 9..12 in the game options
    ldrh r2, [r3]
    ubfx r2, r2, #9, #4
    cmp r2, #1                  // Japanese, Chinese and Korean prompts fit
    beq done                    // with the original full-width glyph spacing
    cmp r2, #8
    bhs done
    b tighten
letter:
    cmp r3, #0x5b
    bne done
    movw r3, #0x24d
    cmp r2, r3
    bne done
    ldr r3, =0x180006EA
    ldrh r2, [r3]
    ubfx r2, r2, #9, #4
    cmp r2, #8                  // the shorter Chinese greeting and signature
    beq letter_chinese          // fit with their original lettering
    movs r2, #27
    strh r2, [r1, #2]
    b tighten
letter_chinese:
    movs r2, #27
    strh r2, [r1, #2]
    b done
tighten:
    movs r2, #2
    rsbs r2, r2, #0
    strh r2, [r1, #8]           // horizontal tracking, in pixels
done:
    b.w resume
.ltorg
