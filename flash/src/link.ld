ENTRY(Reset_Handler)
SECTIONS {
  .text 0x0 : {
    KEEP(*(.vectors))
    KEEP(*(.capabilities))
    /* My Lab restores the stock SD driver's lower PRAM while browsing. */
    . = DEFINED(FLASH_CODE_ORIGIN) ? FLASH_CODE_ORIGIN : .;
    *(.text*)
    *(.rodata*)
    KEEP(*(.tool_version))
    . = ALIGN(4);
  }
  /DISCARD/ : { *(.data*) *(.bss*) *(COMMON) *(.comment) *(.ARM.*) *(.note*) }
}
