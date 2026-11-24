#!/usr/bin/env python3
"""Generate the on-device Menu version and tag release artifacts."""
import re
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

def read_version(path):
    version = path.read_text().strip()
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?', version):
        raise ValueError(f'Unsupported version in {path}')
    return version

def main():
    if len(sys.argv) == 2:
        artifact = Path(sys.argv[1])
        stamp = ('PMXBLD:' + read_version(ROOT / 'VERSION')).encode('ascii')
        if len(stamp) >= 32 or artifact.stat().st_size > 0x10000 - 32:
            raise ValueError('Menu release tag does not fit in the artifact')
        with artifact.open('ab') as output:
            output.write(stamp.ljust(32, b'\0'))
        return
    version = read_version(ROOT / 'feld/VERSION')
    if len(version) * 6 - 1 > 126:
        raise ValueError('About version exceeds display width')
    (HERE / 'version.h').write_text(
        '/* Generated from feld/VERSION by gen_version.py. */\n'
        '#ifndef PARAMIX_VERSION_H\n#define PARAMIX_VERSION_H\n'
        f'#define PARAMIX_VERSION "{version}"\n'
        '#ifndef HOST\n'
        '#ifdef __ELF__\n'
        '#define PARAMIX_VERSION_SECTION __attribute__((section(".pmxversion")))\n'
        '#else\n#define PARAMIX_VERSION_SECTION\n#endif\n'
        f'static const char paramix_version_tag[] __attribute__((used)) PARAMIX_VERSION_SECTION = "PMXVER:{version}";\n'
        '#undef PARAMIX_VERSION_SECTION\n'
        '#endif\n#endif\n')

if __name__ == '__main__':
    main()
