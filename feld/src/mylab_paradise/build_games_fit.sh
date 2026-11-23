#!/bin/sh
# Print the nativeCode base64 used by src/mylab_games_fit.js.
set -eu
cd "$(dirname "$0")"
work=$(mktemp -d "${TMPDIR:-/tmp}/mylab-games-fit.XXXXXX")
trap 'rm -rf "$work"' EXIT
clang --target=thumbv7m-none-eabi -mcpu=cortex-m3 -mthumb -ffreestanding -fropi -ffunction-sections -fdata-sections -Oz -DPARA_SLEEP_TEST_WITHOUT_EXTRA_CLOCK -c games_fit.c -o "$work/fit.o"
echo 'SECTIONS { .text 0x10095000 : { *(.games_entry) *(.text*) *(.rodata*) } }' > "$work/fit.ld"
ld.lld --gc-sections --entry=present_fitted_games -T "$work/fit.ld" "$work/fit.o" -o "$work/fit.elf"
llvm-objcopy -O binary -j .text "$work/fit.elf" "$work/fit.bin"
test "$(wc -c < "$work/fit.bin")" -le 2304
base64 < "$work/fit.bin" | tr -d '\n'
printf '\n'
