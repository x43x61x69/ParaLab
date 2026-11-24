#!/bin/sh
# Build the Paramix field switch (feld.bin, runs from PRAM 0)
set -e
cd "$(dirname "$0")"
python3 gen_version.py
CF="--target=thumbv7m-none-eabi -mcpu=cortex-m3 -mthumb -ffreestanding -nostdlib -ffunction-sections -fdata-sections -flto -Os -fno-common -Wall -Wno-initializer-overrides -Wno-unused-const-variable -fno-builtin-memset -DTONE_FIX -DBL_BLACK -DBL_OFFFIX -DBL_SLEEP -DFAST_LCD -DLCD_FASTCLK -DCLEAN -DPARA_BACK -DPARA_MB_KEEP -DPARA_FLASH -DPARA_FLASH_LATE -DFELD_AUTO -DFELD_BFALL -DFELD_BFALL_NOA -DCLEAN_AUTO -DBAT_SHOW -DBAG_DEL -DFELD_PW -DFELD_TAMA_ANY -DFELD_NOCLK -DFELD_BSETTLE -DFELD_SEEN $XCF"
O=""
for f in main.c hw.c libc.c flash.c; do
  n=${f%.c}
  case "$n" in
    main|flash|hw) OPT=-Oz ;;
    libc) OPT="-Oz -fno-lto" ;; # Keep the ARM runtime symbols available to LTO code generation.
    *) OPT= ;;
  esac
  clang $CF $OPT -c "$f" -o "$n.o"
  O="$O $n.o"
done
N=${OUT:-feld}
ld.lld --gc-sections --icf=safe -T link.ld --no-rosegment $O -o $N.elf
llvm-objcopy -O binary -j .text $N.elf $N.bin
python3 gen_version.py "$N.bin"
case " $XCF " in
  *" -DFELD_MY_LAB "*)
    clang --target=thumbv7m-none-eabi $XCF -c ../stub/my_lab_hook.S -o "$N-hook.o"
    llvm-objcopy -O binary -j .text "$N-hook.o" "$N-hook.bin"
    ;;
esac
llvm-size $N.elf; ls -l $N.bin
# 1.7.2 CLEAN_ROM: a second build for ROMs without the Paradise (own clock); the start device keeps the build above
if [ -z "$XCF" ]; then
  XCF=-DFELD_CLEAN OUT=feldc sh ./build.sh --inner
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  clang --target=thumbv7m-none-eabi -mcpu=cortex-m3 -mthumb -ffreestanding -fropi -Oz -c paradise_care_game.c -o "$work/game.o"
  clang --target=thumbv7m-none-eabi -c ../stub/paradise_care.S -o "$work/entry.o"
  printf 'SECTIONS { .text 0 : { *(.text.care_entry) *(.text*) *(.rodata*) } /DISCARD/ : { *(.ARM.exidx*) } }\n' > "$work/link.ld"
  ld.lld --entry=care_entry -T "$work/link.ld" "$work/entry.o" "$work/game.o" -o "$work/game.elf"
  llvm-objcopy -O binary -j .text "$work/game.elf" ../../paradise-care.bin
fi
