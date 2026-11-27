#!/bin/sh
set -eu
out=$1
case "${2:-}" in
  '') test_flag=-DPARA_SLEEP_TEST_WITHOUT_EXTRA_CLOCK ;;
  --without-b-wake) test_flag=-DPARA_SLEEP_TEST_WITHOUT_B ;;
  --without-extra-clock) test_flag=-DPARA_SLEEP_TEST_WITHOUT_EXTRA_CLOCK ;;
  *) printf 'Usage: %s output.bin [--without-b-wake | --without-extra-clock]\n' "$0" >&2; exit 2 ;;
esac
cd "$(dirname "$0")"
work=$(mktemp -d "${TMPDIR:-/tmp}/paramix-mylab-game.XXXXXX")
trap 'rm -rf "$work"' EXIT
clang --target=thumbv7m-none-eabi -mcpu=cortex-m3 -mthumb -ffreestanding -fropi -Oz $test_flag -c game.c -o "$work/game.o"
clang --target=thumbv7m-none-eabi -c launch.S -o "$work/launch.o"
printf 'SECTIONS { .text 0x1008D000 : { *(.entry) *(.text*) *(.rodata*) } }\n' > "$work/link.ld"
ld.lld --entry=0x1008D001 -T "$work/link.ld" "$work/game.o" "$work/launch.o" -o "$work/game.elf"
llvm-objcopy -O binary -j .text "$work/game.elf" "$out"
