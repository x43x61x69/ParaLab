'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const VENEERS = ['release_initialize', 'release_send', 'release_poll', 'release_draw', 'release_confirm',
  'list_constructor', 'native_egg_body', 'ordinary_growth'];
const STOCK = { 1: [0x70, 0x90], 4: [0x68, 0xc0], 5: [0x68, 0xc8] };

function buildHelper(family) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'paralab-food-'));
  const file = name => path.join(directory, name);
  const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' });
  try {
    fs.writeFileSync(file('layout.ld'), 'ENTRY(allocate_probe)\nSECTIONS { .text 0 : { *(.text.entry) *(.text*) *(.rodata*) } /DISCARD/ : { *(.ARM.exidx*) *(.ARM.extab*) } }\n');
    run(process.env.CLANG || 'clang', ['--target=thumbv7m-none-eabi', '-Oz', '-ffreestanding', '-fpie',
      '-fno-unwind-tables', '-fno-asynchronous-unwind-tables', '-Wall', '-Wextra', '-Werror', `-DFIRMWARE=${family}`,
      '-c',
      path.join(__dirname, 'receiver.c'), '-o', file('helper.o')]);
    const objects = [file('helper.o')];
    const [eggStack, growthStack] = STOCK[family];
    const veneers = VENEERS.map(name =>
      `.global ${name}\n.thumb_func\n${name}:\n  .inst.w 0xf000b800\n`).join('');
    fs.writeFileSync(file('veneers.s'), '.syntax unified\n.thumb\n.text\n' + veneers +
      '.global original_new_egg\n.thumb_func\noriginal_new_egg:\n  push {r7, lr}\n' +
      `  sub sp, #${eggStack}\n  b.w native_egg_body\n` +
      `.global stock_growth\n.thumb_func\nstock_growth:\n  ldrh.w r1, [sp, #${growthStack}]\n  bx lr\n` +
      '.section .rodata\n.balign 2\n.global special_food_targets\nspecial_food_targets:\n' + '.short 0xffff\n');
    run(process.env.CLANG || 'clang', ['--target=thumbv7m-none-eabi', '-c', file('veneers.s'), '-o', file('veneers.o')]);
    objects.push(file('veneers.o'));
    run(process.env.LLD || 'ld.lld', ['-T', file('layout.ld'), ...objects, '-o', file('helper.elf')]);
    run(process.env.LLVM_OBJCOPY || 'llvm-objcopy', ['-O', 'binary', '-j', '.text', file('helper.elf'), file('helper.bin')]);
    const symbols = run(process.env.LLVM_NM || 'llvm-nm', ['--defined-only', file('helper.elf')]);
    const entries = Object.fromEntries([...symbols.matchAll(/^([0-9a-f]+) [TtRr] (\w+)$/gm)].map(([, address, name]) => [name, parseInt(address, 16)]));
    return { code: fs.readFileSync(file('helper.bin')), entries };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function writePrograms(output) {
  const programs = Object.fromEntries([1, 4, 5].map(family => {
    const { code, entries } = buildHelper(family);
    return [family, { hex: code.toString('hex'), entries }];
  }));
  fs.writeFileSync(output, JSON.stringify(programs) + '\n');
}

module.exports = { writePrograms };
if (require.main === module) writePrograms(process.argv[2] || path.join(__dirname, "helper.json"));
