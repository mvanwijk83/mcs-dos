# Font sources

Downloaded unchanged on 2026-09-10 from Rob Hagemans' hoard-of-bitfonts:

| Local file | Source |
| --- | --- |
| amiga-ks10-topaz-08.yaff | https://raw.githubusercontent.com/robhagemans/hoard-of-bitfonts/refs/heads/master/amiga/amiga-ks10-topaz-08.yaff |
| atari-st-8x8.yaff | https://raw.githubusercontent.com/robhagemans/hoard-of-bitfonts/refs/heads/master/atari/st/atari-st-8x8.yaff |
| pet.yaff | https://raw.githubusercontent.com/robhagemans/hoard-of-bitfonts/refs/heads/master/commodore/pet/pet.yaff |
| vic-20.yaff | https://raw.githubusercontent.com/robhagemans/hoard-of-bitfonts/refs/heads/master/commodore/vic20/vic-20.yaff |
| zx-spectrum.yaff | https://raw.githubusercontent.com/robhagemans/hoard-of-bitfonts/refs/heads/master/sinclair/zx-spectrum.yaff |

Original comments, attribution and ROM provenance are retained in the files.
The Amiga source identifies Topaz/8, Kickstart v1.0 (1985), from an A1000 ROM;
this is the specific supplied variant, rather than a claim about all A500 ROMs.
The Atari source identifies the 8x8 system font from tos206uk.img.
The PET source identifies ROM 901447-10, with its mixed-case bank at index
$80 (no stored inverse bank). The VIC-20 source identifies ROM 901460-03,
with its mixed-case bank at $100. These numeric labels are ROM screen indices,
not PETSCII character bytes. The Spectrum source identifies the default font
from the linked ZX Spectrum character-set bitmap.

scripts/make-yaff-charsets.js checks the original SHA-256 hashes and extracts
the 88 permitted glyphs into AMIGA.CPI, ATARIST.CPI, PET.CPI and
ZXSPECTRUM.CPI. Text comes from the mixed-case bank for PET and from
ASCII-compatible positions for the other sources. Backslash is mapped into
screen slot 96: PET's native backslash at $9C and source character $5C for
Amiga, Atari ST and Spectrum. The eight bitmap
rows are preserved as the complete cell. YAFF shift-up/ascent/descent describe
baseline placement, not extra bitmap rows; no shift, crop or scaling is applied.
The C64 loader generates inverse glyphs and retains the machine's ROM graphics.

vic-20.yaff is retained as a reference but is no longer built or packaged:
its 87 regular mapped glyphs are identical to PET's, differing only in the
backslash chosen for slot 96.
