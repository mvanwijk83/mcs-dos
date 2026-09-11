# Startup character sets

`SET CHARSET=NAME` in AUTOEXEC.BAT selects NAME.CPI after the startup batch has
finished (also after cancellation). The file is read from the original startup
device, even if AUTOEXEC changes the current drive. No AUTOEXEC or an empty
setting keeps the default RAM copy of the ROM font, with a backslash added.
A later interactive SET only changes the stored
environment value. REBOOT clears it and processes AUTOEXEC anew. There is no
CHARSET command. Every nonempty name selects a matching file, including C64.CPI
when CHARSET=C64. Names are
case-insensitive stems of 1–12 letters, digits, spaces, hyphens or underscores;
surrounding spaces are ignored. Omit the extension: the loader appends `.CPI`.
Twelve stem characters plus the suffix fit the native 16-character filename.
For example, AMIGA500 selects AMIGA500.CPI and ATARIST selects ATARIST.CPI.
CGA.CPI, AMIGA.CPI, ATARIST.CPI, PET.CPI and ZXSPECTRUM.CPI are
supplied. Use SET CHARSET=PET or ZXSPECTRUM in AUTOEXEC.BAT to select
the new fonts. Additional files require no shell changes: users may
create their own MCPI v1 files using the format below. All sets retain the
same C64 mixed-case screen-code mapping and protected graphics slots.

The build extracts the opaque, monochrome 8x8 cells from cga.png using
scripts/make-charset.ps1. The atlas is 32 columns by 8 rows, in PC glyph order;
black pixels are foreground, with the left pixel in bit 7. The output is the
800-byte CGA.CPI sequential file (four disk blocks). No C64 character-ROM bytes
are distributed in it. The .CPI suffix is a DOS naming reference, not a claim
of compatibility with DOS CPI files.

AMIGA.CPI is Topaz/8 from Kickstart 1.0; ATARIST.CPI is the Atari ST 8x8
system font from TOS 2.06 UK. Each contains the same 88 replacement slots and
occupies 800 bytes (four disk blocks). The loader generates reversed glyphs.
Neither font increases the shell PRG or its RAM requirement.

PET.CPI uses the mixed-case bank of PET ROM 901447-10. ZXSPECTRUM.CPI uses the Spectrum's
default 8x8 font. Each has 88 records and occupies 800 bytes (four disk blocks).
Their source backslashes replace slot 96: PET's native glyph at $9C
and Spectrum's reverse solidus at $5C. Ordinary
space stays at slot 32; C64 graphics outside the permitted text/backslash
slots remain intact. No shell or loader changes are needed for these fonts.

Their original YAFF sources are kept under assets/fonts with provenance in
[assets/fonts/README.md](assets/fonts/README.md). The build runs
scripts/make-yaff-charsets.js locally, verifying the downloaded hashes before
conversion. It preserves all eight cell rows without shifting or resizing;
YAFF baseline metrics do not change the C64's fixed cell placement.
`node tests/charset.js --assets-only` checks all four YAFF fonts against the
source pixels, including reverse glyphs and every preserved ROM graphic.

## MCPI version 1

| Bytes | Meaning |
| --- | --- |
| 0–3 | ASCII `MCPI` (77, 67, 80, 73) |
| 4 | Version: 1 |
| 5 | Record count: 1–88 |
| Next count × 9 | One C64 screen code, then eight bitmap row bytes |
| Last two | Sum of all record bytes modulo 65536, low byte first |

Codes must be strictly increasing, without duplicates. Allowed codes are
0–27, 29, 32–63, 65–90, and 96. Codes 1–26 contain PC lowercase a–z; 65–90
contain uppercase A–Z. Code 0 is @; 27 and 29 are square brackets. Codes
32–63 contain the matching PC space, punctuation and digits. C64 pound and
arrow slots, all other graphics, and their reverse forms are untouched, except
for the duplicate space at code 96 (and its reverse at 224).

Code 96 contains the font's backslash (source character 92). The default font
copies it from the machine's uppercase/graphics ROM. The supplied external sets
use their own source glyphs. Older MCPI v1 files without a code-96 record still
load and retain the default backslash. Updated 88-record files require the new
loader; their record structure and checksum format remain MCPI v1.

PROMPT $H and PETSCII $A0 (Shift-SPACE) select code 96. Ordinary space remains
at code 32. Literal byte 96 in external text displays as ordinary space in
shell output, command-line display and EDIT; this display conversion does not
alter file bytes, redirected output, printer data, or editor save data.

Startup copies the machine's 2048-byte mixed-case ROM set and adds backslash
to both the active font and a staging area. Each external-font
record replaces its selected slot and writes the bitwise complement at
code + 128. It validates the header, code ordering/ranges, checksum and EOF
before copying the staged font into the active font. Partial reads or errors
leave the default font intact. The checksum detects accidental damage, not
deliberate edits.

## Memory layout

The normal CPU program/BSS and full 2 KiB C stack remain below $D000. Both
default and custom shell fonts use RAM beneath KERNAL ROM, starting before
AUTOEXEC so that prompts and batch output can already display backslash:

| Address | Use |
| --- | --- |
| $E000–$E3FF | Screen and sprite pointers |
| $E400–$E43F | Underscore caret sprite |
| $E800–$EFFF | Complete hybrid font, including reverse glyphs |
| $F000–$F7FF | External font staging area during startup |
| $FFFA–$FFFB | RAM NMI vector during temporary ROM banking |

VIC bank 3 and $D018=$8A select this screen/font. CPU writes go through to
the underlying RAM; KERNAL PLOT and conio use screen page $E0 in $0288.
The ROM cursor stays disabled. Scrolling briefly disables IRQs and maps out
KERNAL to read screen RAM, restoring both mapping and processor status.
ROM copying uses a short character-ROM mapping with the same protection;
a RAM NMI return stub allows RESTORE to interrupt these copies. No raster
interrupt or per-frame copying is installed. Colours remain at $D800.

REBOOT restores bank 0 before clearing and preparing the RAM display anew. EXIT and PRG launch
also restore bank 0, screen page $04, and the uppercase/graphics ROM font.
The custom font is session-local and does not stay active in launched PRGs.

Verification: `node tests/charset.js` (PAL) and `node tests/charset.js --ntsc`.
The tests own and close their VICE instance and use a disposable disk image.
