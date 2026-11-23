"""Reassemble all grid hooks and verify the bytes embedded in their corresponding JS modules.

Run python3 build_grid_fit.py with clang, ld.lld and llvm-objcopy on PATH.
The output uses only the requested section, padded with 16-bit Thumb NOPs
when a hook replaces more bytes than its emitted instructions occupy.
"""
from pathlib import Path
import re
import subprocess
import tempfile

here = Path(__file__).resolve().parent
def verify(name, entry):
    js = (here.parents[2] / f"src/mylab_{name}.js").read_text()
    rows = re.findall(r"\[0x([0-9a-f]+), '([0-9a-f]*)',\s*'([0-9a-f]+)'\]", js)
    rows += re.findall(r"at: XIP \+ 0x([0-9a-f]+), old: hex\('([0-9a-f]*)'\), code: hex\('([0-9a-f]+)'\)", js)
    source = (here / f"{name}.S").read_text()
    sections = set(re.findall(r"^\.section \.p([0-9a-f]+),", source, re.M))
    if sections != {section for section, _, _ in rows}:
        raise SystemExit("Grid assembly and JavaScript sections differ")

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        subprocess.run(["clang", "--target=thumbv7m-none-eabi", "-c", str(here / f"{name}.S"),
                        "-o", "fit.o"], cwd=work, check=True)
        subprocess.run(["ld.lld", f"--entry={entry}", "-T", str(here / f"{name}.ld"),
                        "fit.o", "-o", "fit.elf"], cwd=work, check=True)
        for section, original, expected in rows:
            subprocess.run(["llvm-objcopy", "--dump-section", f".p{section}=section.bin",
                            "fit.elf"], cwd=work, check=True)
            code = (work / "section.bin").read_bytes()
            padding = len(bytes.fromhex(original)) - len(code)
            if original and (padding < 0 or padding % 2):
                raise SystemExit("Grid hook exceeds its slot at 0x" + section)
            if original:
                code += bytes.fromhex("00bf") * (padding // 2)
            if code.hex() != expected:
                raise SystemExit("Grid hook differs at 0x" + section + "\n" + code.hex())
    print(f"Verified {len(rows)} {name} sections.")


verify("grid_fit", "0x10093008")
verify("page_hints", "0x10093489")
verify("simulation_fit", "0x10093649")
verify("food_fit", "0x100936b9")
