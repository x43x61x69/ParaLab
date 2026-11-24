#!/bin/sh
# Builds the flash app (Cortex-M4, Thumb) into ../flashapp.bin.
# Needs clang, ld.lld and llvm-objcopy. The result is byte-identical to the
# flashapp.bin shipped in this folder.
set -e
cd "$(dirname "$0")"
case "${1:-}" in
  '') target=thumbv7em-none-eabi; cpu=cortex-m4; variant=; layout=; output=../flashapp.bin ;;
  --my-lab) target=thumbv7m-none-eabi; cpu=cortex-m3; variant=-DFLASH_MY_LAB; layout=--defsym=FLASH_CODE_ORIGIN=0x8000; output=../flashapp-mylab.bin ;;
  --my-lab-bootstrap) target=thumbv7m-none-eabi; cpu=cortex-m3; variant='-DFLASH_MY_LAB -DFLASH_UART_BOOTSTRAP'; layout=--defsym=FLASH_CODE_ORIGIN=0x8000; output=../flashapp-mylab-bootstrap.bin ;;
  --my-lab-read-only) target=thumbv7m-none-eabi; cpu=cortex-m3; variant='-DFLASH_MY_LAB -DFLASH_READ_ONLY'; layout=; output=../flashapp-mylab-read-only.bin ;;
  --my-lab-on-paradise) target=thumbv7em-none-eabi; cpu=cortex-m4; variant=-DFLASH_MY_LAB_ON_PARADISE; layout=; output=../flashapp-mylab-paradise.bin ;;
  *) printf 'Usage: %s [--my-lab | --my-lab-bootstrap | --my-lab-read-only | --my-lab-on-paradise]\n' "$0" >&2; exit 2 ;;
esac
# The writable My Lab tools share the 56 KiB rescue image with stock PRAM.
opt=-Os
case "${1:-}" in --my-lab|--my-lab-bootstrap) opt=-Oz ;; esac
output=${OUT:-$output}
build_dir=$(mktemp -d "${TMPDIR:-/tmp}/paramix-flash.XXXXXX")
trap 'rm -rf "$build_dir"' EXIT
clang --target="$target" -mcpu="$cpu" -mthumb -ffreestanding -nostdlib "$opt" -fno-common -DFW_PRECHECK $variant -c fw.c -o "$build_dir/fw.o"
set -- "$build_dir/fw.o"
case "$variant" in
  *FLASH_READ_ONLY*|*FLASH_MY_LAB_ON_PARADISE*) ;;
  *)
    clang --target="$target" -mcpu="$cpu" $variant -c reload.S -o "$build_dir/reload.o"
    set -- "$@" "$build_dir/reload.o"
    ;;
esac
ld.lld -T link.ld --no-rosegment $layout "$@" -o "$build_dir/fw.elf"
llvm-objcopy -O binary "$build_dir/fw.elf" "$output"
if [ "$variant" = '-DFLASH_MY_LAB -DFLASH_READ_ONLY' ]; then
  clang --target=thumbv7m-none-eabi -c ../../feld/src/stub/my_lab_uart_entry.S -o "$build_dir/uart-entry.o"
  llvm-objcopy -O binary -j .text "$build_dir/uart-entry.o" ../../feld/my-lab-uart-entry.bin
fi
python3 - "$output" <<'CHECK'
import sys
from pathlib import Path
p=Path(sys.argv[1])
if p.stat().st_size > 0xE000:
    raise SystemExit(f"{p.name} exceeds the rescue region (0xE000)")
print(f"done: {p.name} ({p.stat().st_size} bytes)")
CHECK
