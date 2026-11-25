#!/bin/sh
set -eu
cd "$(dirname "$0")"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT HUP INT TERM
for name in helper helper-jade; do
  flags=
  if [ "$name" = helper-jade ]; then flags=-DJADE; fi
  clang --target=thumbv7m-none-eabi -mcpu=cortex-m3 -x assembler-with-cpp $flags -c helper.s -o "$work/helper.o"
  ld.lld -Ttext=0x100f8000 -e _start "$work/helper.o" -o "$work/helper.elf"
  "${LLVM_OBJCOPY:-llvm-objcopy}" -O binary -j .text "$work/helper.elf" "$name.bin"
  chmod 644 "$name.bin"
done
