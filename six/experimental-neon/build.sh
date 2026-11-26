#!/bin/sh
set -eu
if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
    echo "usage: sh build.sh /path/to/growth.bin [gen1|jade|gen3]" >&2
    exit 2
fi
case "$1" in /*) output=$1;; *) output="$(pwd)/$1";; esac
case ${2:-gen3} in
    gen1) profile="-DGROWTH_TAMA=0x104 -DGROWTH_FIELD=0x1b3 -DGROWTH_SPECIES_SP=0x90 -DGROWTH_CARE_SP=0x20 -DGROWTH_FOOD_HISTORY=0x12e -DGROWTH_INLINE_FOOD" ;;
    jade) profile="-DGROWTH_TAMA=0x108 -DGROWTH_FIELD=0x1b7 -DGROWTH_SPECIES_SP=0xc0 -DGROWTH_CARE_SP=0x30 -DGROWTH_JADE_SKY -DGROWTH_FOOD_HISTORY=0x132 -DGROWTH_FOOD_ACCEPT=0x1000e801 -DGROWTH_FOOD_REJECT=0x1000e8b3" ;;
    gen3) profile="-DGROWTH_FOOD_HISTORY=0x13e" ;;
    *) echo "unknown growth profile: $2" >&2; exit 2 ;;
esac
case ${2:-gen3} in
    gen1) eyes="-DGROWTH_CACHED_EYE=0x10015e35 -DGROWTH_DEFAULT_EYE=0x10006139" ;;
    jade) eyes="-DGROWTH_CACHED_EYE=0x10016135 -DGROWTH_DEFAULT_EYE=0x10006245" ;;
    gen3) eyes="-DGROWTH_CACHED_EYE=0x10018635 -DGROWTH_DEFAULT_EYE=0x100077b5" ;;
esac
cd "$(dirname "$0")"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
clang --target=thumbv7m-none-eabi $profile $eyes -c growth.S -o "$work/hook.o"
clang --target=thumbv7m-none-eabi -std=c11 -Wall -Wextra -Werror -Oz -ffreestanding \
    -fno-unwind-tables -fno-asynchronous-unwind-tables $profile -c growth.c -o "$work/growth.o"
ld.lld --no-rosegment -T link.ld "$work/hook.o" "$work/growth.o" -o "$work/growth.elf"
llvm-objcopy -O binary -j .text "$work/growth.elf" "$output"
