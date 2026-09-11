# Verification

## 512-byte environment and compiler comparison (2026-09-11)

ENVSIZE is now 512; command length, ten-entry history, and the 64-character
SET value limit remain unchanged. README/manual and the legacy environment
capacity checks were updated. The reduction saves 512 bytes of static RAM;
the normal cc65 -O build has 2409 bytes free before its unchanged 2048-byte
stack. PRG size is 37,717 bytes.

tests/environment-capacity.js passed in VICE with a no-device, empty-environment
startup: seven 69-byte entries plus one 29-byte entry fill exactly 512 bytes;
growth fails atomically, equal-sized replacement works while full, deletion
allows reuse, and the 64-character value limit is preserved. The test accepts
the current no-device :> prompt. --shell resumes against an already booted,
empty no-device shell; otherwise start at BASIC. No disk fixture is required.

Build/D64 verification passes, and the existing development build mode with
personal AUTOEXEC was preserved. The packaged manual and SHA256SUMS were rebuilt.
No physical hardware test was performed. The normal compiler flags are unchanged.
Temporary compiler variants and their measurements are documented in
build/optimization-20260911/ASSESSMENT.md; they were compiled, not runtime-qualified.

## Reduced MEM/CHKDSK switches (2026-09-11)

Removed MEM /T /U /F /R and CHKDSK /T /A /F, including disk unit options.
Both full reports retain /S. Updated help and README.
`node tests/amount-switches.js` passes full-report formatting, /S in either
argument order, rejected removed switches/invalid drives, and DEL /P checks.
Development build and D64 content verification pass. PRG decreases from
38,260 to 37,717 bytes (543 bytes saved). No full VICE session or hardware
test for this change. The earlier switch test results below are historical.


## Boot splash (2026-09-11)

The original seven-row PETSCII logo is retained in assets/LOGO.TXT and embedded
in src/bootsplash.h. The splash uses the ROM mixed-case font, blue on black,
two top rows, and three blank rows before the centered white VERSION label.
A centered white copyright line follows immediately below; the pause is four seconds.
Its call precedes the restart label, so REBOOT bypasses both rendering and delay.
The development build and D64 content verification pass. The build also required
removing an existing stray `z` after the VER entry in command-help.json.
tests/bootsplash.js checks the original logo cells, spacing, colors, version,
delay and no-device REBOOT in an owned VICE instance; --ntsc selects NTSC.
The PAL screenshot was visually inspected. Physical C64U testing remains pending.

## DEL, MEM and CHKDSK switches (2026-09-10)

`node tests/amount-switches.js` passes 22 simulator checks of the production
handlers with mocked memory/disk/I/O: numeric values, comma suppression,
bytes/blocks, CHKDSK /A (rejecting /U), MEM /U (rejecting /A), invalid/conflicting switches, and DEL confirmation/suppression.
The development build and full D64 content verification pass. PRG: 37,779
bytes. These new switches have not been tested on physical hardware or in
a full VICE shell session.


## Help pagination and startup PROMPT environment (2026-09-10)

Disk-backed help pauses after 22 displayed rows, counting blank lines and
automatic 40-column wrapping. It uses the existing any-key/RUN-STOP pager,
resets the row count for each help read/retry, and closes the help channel on
cancellation. Redirected help remains byte-exact and never emits page prompts.
The supplied PROMPT help text was not shortened or otherwise edited.

After AUTOEXEC unwinds, startup copies an existing PROMPT environment value
into the active prompt, after charset initialization. This overrides PROMPT
commands in AUTOEXEC; when the variable is absent, the batch's active prompt
is retained. Interactive SET only stores/removes the variable. PROMPT still
changes the active prompt immediately, and REBOOT reruns startup normally.

node tests/help-prompt.js passes in owned PAL VICE on disposable disks:
startup/batch precedence, interactive SET isolation, direct PROMPT changes,
REBOOT, a 64-byte value, deleted/absent values, first/last PROMPT help pages,
/? paging, RUN/STOP cancellation, subsequent help, exact redirected bytes,
and synthetic multi-page help with blank lines/wrapping across read boundaries.
Both real help pages were visually inspected. The fixture waits for actual
page/shell prompts rather than assuming a fixed disk-I/O duration.

Prompt, PRINT and TYPE-wrap simulator checks pass, as do release/development
builds and D64 verification. Oscar64 O1 compiles (not runtime-tested). PRG:
36,841 bytes; static allocation ends at $BD29, leaving 2774 bytes below the
unchanged C stack. The final D64 is the development image with the user's
personal AUTOEXEC. MANUAL.TXT source was not edited; no physical hardware test.

## Personal development AUTOEXEC (2026-09-10)

The default build includes dev/AUTOEXEC.BAT.txt as a PETSCII SEQ AUTOEXEC.BAT:
echo off, DRIVEIDS=DOS, CHARSET=CGA, COLOR /PRESET:2, PROMPT $p$c$h$g, VER.
build.ps1 -Release recreates the D64 without that file. BUILDING.md documents
the modes, and build/BUILD-TYPE.txt identifies the last build.

Both release and development builds pass full D64 content verification.
Development verification checks the exact AUTOEXEC bytes against its source;
release verification was also checked to reject the development image.
The final build/MCS-DOS.d64 is the personal development image, with refreshed
checksums. Shell code and MANUAL.TXT source were not edited.

## PET, VIC-20 and ZX Spectrum font assets (2026-09-10)

PET.CPI, VIC20.CPI and ZXSPECTRUM.CPI are generated from the requested,
vendored YAFF files, with SHA-256 verification and source provenance retained.
Each contains 88 records and occupies 800 bytes (four disk blocks). PET text
comes from its mixed-case bank at $80 and VIC-20 text from its bank at $100;
the YAFF indices are ROM screen positions. Backslash at destination slot 96
uses PET's native $9C glyph, VIC-20's graphics $4D diagonal and Spectrum's
$5C reverse solidus. Other C64 graphics remain protected.

The release build and D64 sector/content verification pass with all three new
SEQ font files packaged. The shell PRG remains 36,774 bytes; its code and RAM
requirements were not changed for these additions.

node tests/charset.js --assets-only passes in owned PAL VICE with a disposable
disk. All five YAFF fonts (including Amiga and Atari ST regressions) load by
their environment names. Tests independently compare all 2048 font bytes with
source pixels, generated inverses and preserved ROM graphics; prompt backslash,
unchanged M/m and EXIT restoration also pass. Alphabet/punctuation and backslash
screenshots for each new font were visually inspected. No physical hardware
test was performed by the agent. MANUAL.TXT source was not edited.

## Backslash glyph and duplicate-space compatibility (2026-09-10)

The default shell display now uses its RAM font before AUTOEXEC. Screen slot
96 contains a backslash copied from the uppercase/graphics ROM, and slot 224
contains its inverse. PROMPT $H emits PETSCII $A0 (Shift-SPACE); ordinary M/m,
space at slot 32 and the pound glyph remain intact. CGA, Amiga and Atari ST
converters map source character 92 into slot 96. Each CPI now has 88 records
and is 800 bytes. Older 87-record CPI files inherit the default backslash.

The loader stages external fonts at $F000–$F7FF and commits only after complete
validation, leaving the default font intact on missing/corrupt resources.
Literal byte 96 displays as byte 32 in shell output, input and EDIT, without
changing stored data. Shared monitor screen reads follow the active RAM page.

The production prompt, PRINT and TYPE-wrap simulator tests pass. The owned
VICE prompt regression passes. The charset suite verifies font pixels and
inverse glyphs, cursor/scrolling/EDIT, REBOOT, EXIT, PRG launch, no-device
startup, corrupt-font fallback, older CPI compatibility, external-byte display,
EDIT redraw/save and exact redirected TYPE bytes in a disposable D64.
The full PAL charset suite passes, including independent CGA atlas and all
88 Amiga/Atari source-glyph comparisons. Backslash screenshots for default,
CGA, Amiga and Atari ST were visually inspected alongside unchanged M/m.

Release build and D64 content verification pass. PRG: 36,774 bytes; static
allocation ends at $BCE6, leaving 2841 bytes below the unchanged C stack.
Font staging uses an additional 2 KiB beneath KERNAL, outside that allocation.
Oscar64 O1 compiles with the bounded case-insensitive comparison added to its
adapter; this experimental build was not runtime-tested. MANUAL.TXT source
was not edited. No physical hardware test was performed.

## Custom command prompts (2026-09-10)

PROMPT stores literal text and expands the supplied case-insensitive dollar
codes at display time. Startup, REBOOT and bare PROMPT use $d$c$g; $D always
uses the drive letter, while $P follows DRIVEIDS. With no selected device,
$D is empty and $N/$P display 0. Interactive prompts, batch echo and completion
error redraws share the renderer. PROMPT owns its raw tail, including literal
quotes, spaces, unknown dollar sequences and greater-than signs. The command's
help comes from prompt cmd.txt, with PETSCII graphics conversion in the resource.

node tests/prompt.js passes production-code checks under sim65 for all codes,
case folding, graphics bytes, dynamic drives, literal preservation, reset and
help. node tests/prompt-vice.js passes in its owned emulator and disposable disk:
custom/default prompts, drive changes and DRIVEIDS, literal text, line breaks,
version, typing after a 39-column prompt, and PETSCII graphics in screen RAM.
The fixture synchronizes BASIC startup and decodes bracket screen codes.

Release build and D64 content verification pass. PRG: 36,620 bytes; static
allocation ends at $BC4C, leaving 2995 bytes before the unchanged C stack.
MANUAL.TXT source was not edited. No physical hardware test was performed.

## Help disk insertion and retry (2026-09-10)

Unavailable detailed help now prompts on screen: "Insert MCS-DOS disk and press
any key when ready". A key retries the requested topic from its beginning;
RUN/STOP cancels. Retry clears KERNAL status and uses the drive's non-destructive
initialize command to refresh media state and invalidate the directory cache.
Refreshing only the shell state was insufficient in repeated rapid-swap tests.

tests/disk-help.js --recovery passed missing/version/count/truncated resources,
prompt cancellation, repeated wrong-disk retries, successful insertion for a
late topic, no-device fallback, and subsequent help after cancellation. With
same-drive redirection the command ends before allowing a swap, keeping an
open destination file on its original disk. Its diagnostic remains on screen.

tests/help-drive-swap.js --basic passed with VICE started with -drive9type 1541:
drive 9 remains selected while help loads from startup drive 8; swapping a
missing help disk in drive 8 resumes output redirected to drive 9; the insertion
prompt stays on screen and does not enter the output file. The test waits for
BASIC startup before loading the PRG. Use disposable fixtures from disk-help.js.
No physical hardware test was performed.

Release PRG: 35,984 bytes; free memory: 3717 bytes, with the C stack unchanged.
The retry and same-drive output protection add 128 bytes over the first disk-help
release. Build/D64 verification pass; the packaged manual and SHA256SUMS are
updated.

## Disk-backed detailed help (2026-09-10)

Detailed help now streams from COMMANDS.HLP; the command list and COLOR palette
remain resident. The resource uses the startup drive, or the selected drive
after a no-device startup. src/command-help.json preserves the existing text;
scripts/make-help.js validates topic coverage and emits the five-byte MCH v1
header followed by NUL-terminated PETSCII topics in shell command order.
The normal build packages COMMANDS.HLP as SEQ and verifies its exact contents.

VICE verification in tests/disk-help.js passed all 27 redirected topics against
their source text, /? forms, aliases, COLOR palette, startup-drive selection,
source-file redirection protection, missing/version/count/truncated resources,
resident HELP without the resource, errors staying on screen during redirection,
resource restoration, no-device fallback, RUN/STOP cancellation and subsequent
I/O. Error/recovery cases were rerun with --recovery after correcting fixture
mounting and the test's assumption about empty SEQ representation. VICE refuses
to mount the same writable image on two drives; the suite now checks attachment
success and detaches its secondary fixture before reusing it on drive 8.

Start the full suite at BASIC with its help-*.d64 fixtures detached. --recovery
resumes the failure/recovery portion at a shell started from drive 8 with those
fixtures already created. Tests only modify disposable images. No physical
hardware testing was performed.

The release PRG is 35,856 bytes. Static allocation ends at $B8FA inclusive,
leaving 3845 bytes before the unchanged 2048-byte stack at $C800. Relative to
the fresh pre-change build (797 free), net RAM saving is 3048 bytes. The
COMMANDS.HLP resource is 3560 bytes. Release disk content verification passes;
the packaged manual and SHA256SUMS were rebuilt. EDIT and message-printing
implementations were not changed.

## Drive aliases, COLOR colons, and wildcard deletion (2026-09-10)

Release build and D64 content verification pass (38,926-byte PRG).
`node tests/misc.js` passes in its owned VICE instance with a disposable disk:
A/B/W drive aliases, combined colon COLOR switches, preset selection, invalid
values and mixed options leaving colors unchanged, and DEL/DELETE/ERASE `*`
with both confirmation and cancellation. After emulator shutdown, c1541
independently reports an empty image with 663 blocks free. Native scratch
semantics apply, including locked-file protection. Help, manual, examples,
and affected existing test commands were updated; physical hardware was not
tested.


## Amiga and Atari ST font assets (2026-09-10)

AMIGA.CPI (Kickstart 1.0 Topaz/8) and ATARIST.CPI (TOS 2.06 UK 8x8) are
generated from the vendored, hash-checked YAFF sources in assets/fonts.
Each file is 791 bytes, with the same 87 shared-text slots as CGA. The build
packages both as SEQ files, and D64 sector-chain/content verification passes.

`node tests/charset.js --assets-only` passes in owned PAL VICE. It independently
reads the source YAFF pixel rows and compares the entire 2048-byte loaded font:
all replacement pixels, all inverse pixels, and every untouched ROM graphic.
Both sets load through their environment names and restore the ROM display on
EXIT. Screenshots build/charset-amiga.png and build/charset-atarist.png were
visually inspected. The shell PRG stays 38,889 bytes; no loader or RAM-layout
changes were needed. The existing loader was previously tested on PAL/NTSC;
these new font assets were tested on PAL, not physical hardware.

## No reserved charset names (2026-09-09)

Removed the CHARSET=C64 special case. Missing, empty or whitespace-only
settings keep the ROM font; every nonempty name now selects NAME.CPI.
`node tests/charset.js --names-only` passes in owned PAL VICE, including
loading C64.CPI when present and reporting the normal missing-file error
when it is absent. The generic-name and blank-setting checks also pass.
The rebuilt 38,889-byte release PRG leaves 813 bytes below the unchanged
2 KiB stack. Release D64 content verification passes. This supersedes the
reserved-C64 behavior recorded in the earlier generic-name test below.

## Generic charset names (2026-09-09)

`node tests/charset.js --names-only` passes in an owned PAL VICE instance.
Renamed CGA test payloads load as AMIGA500.CPI, ATARIST.CPI, AMIGA 500.CPI
and a 12-character stem containing digits, a hyphen and the native $5F
underscore byte. These fixtures are not new Amiga or Atari glyph designs.
The test removes CGA.CPI for the other names, changes the current drive in
AUTOEXEC, and verifies loading still uses the startup disk. Case/whitespace
normalization, missing-file diagnostics, invalid/overlong names, preservation
of a prior setting after rejection, blank settings and reserved C64 all pass.

The rebuilt release PRG is 38,967 bytes and has 735 bytes of main-memory
headroom below the unchanged 2048-byte stack. D64 content verification passes.
The experimental Oscar64 O0 build now exceeds available RAM; O1, O2 and Os
compile separately, but remain runtime-unqualified. See OSCAR64.md.

## Startup CGA charset (2026-09-09)

The release build includes the 791-byte CGA.CPI SEQ file. Its 87 glyph records
replace shared text characters in the machine's mixed-case ROM font and produce
matching reverse glyphs. The active screen, sprite and font use RAM beneath
KERNAL; the existing main memory layout and 2048-byte C stack remain intact.
The 38,589-byte PRG leaves 1,113 bytes between BSS and the reserved stack.

`node tests/charset.js` and `node tests/charset.js --ntsc` pass in owned PAL
and NTSC VICE instances. They compare all
2048 font bytes against the ROM plus replacements, including untouched graphics
and reversed text. It checks the relocated screen/caret, scrolling, reversed
EDIT status and coordinates, startup-only SET, REBOOT, EXIT, startup-drive
selection, PRG launch restoration, no-device startup, missing AUTOEXEC and
missing/truncated/corrupt/version-invalid/graphics-slot/trailing-data fonts.
Screenshots are retained in build/charset-pal.png and build/charset-ntsc.png.
The fixture waits for BASIC readiness and verifies the loaded PRG header;
an initial NTSC attempt reached BASIC without starting the shell before these
synchronization checks were added.

The existing `node tests/editor-session.js` default-display regression passes,
as do all 30 TYPE wrapping cases, PRINT/redirection unit checks, and release D64
content verification. All four experimental Oscar64 builds compile after
translating the charset assembly and removing their unused heap reservation;
they remain runtime-unqualified. No physical hardware test was performed.

## File redirection and printer selection (2026-09-09)

`node tests/redirection.js` passes against the release build in an owned VICE
instance with disposable 1541 disk images. It verifies actual closed SEQ file
contents for overwrite, append (including block boundaries), append/create,
quoted arguments, ECHO., 55-character unwrapped text, raw 1025-byte TYPE data
containing every byte value, same-drive and cross-drive transfers, numeric and
DOS-style destinations, and all six supported commands. Batch redirection,
RUN/STOP partial output, disk-full errors, subsequent output, invalid and absent
destinations, non-SEQ protection, TYPE self-target protection, and rejection of
multiple operators/printer redirection also pass. Errors stay on screen; an
unwritten output matches a plain BASIC OPEN/CLOSE SEQ file (one CR on this 1541).
The test owns and closes its emulator and reads disk chains directly for byte
verification. `--verify-only` rechecks the completed fixture images.

`node tests/print.js` passes under sim65 using the production TYPE/PRINT handler:
default device 4, explicit 4:/5:, case-insensitive LPT1/LPT2, secondary address 7,
unaltered bytes across read boundaries, argument rejection, and open/write
failure cleanup. `node tests/type-wrap.js` retains all 30 display wrapping,
line-ending, blank-line and pagination checks. Physical printers were not tested.

The rebuilt PRG is 37,583 bytes. Code/static workspace occupies 47,032 bytes,
leaving 2,119 bytes below the unchanged 2 KiB C stack. D64 content verification
passes; the packaged manual and checksums are refreshed. All four experimental
Oscar64 optimization variants compile; they were not runtime-qualified here.
SET's read-only input parameter is const-correct for that compiler.

## EDIT status layout retained; custom theme removed (2026-09-09)

Removed /MODERN, the raster assembly, its runtime state, build integration,
experimental compiler adapter and theme-only tests. EDIT uses shell colours
and does not install an IRQ handler. The status retains line:column and the
filename (or Untitled). RUN/STOP:quit starts at column 27 (one-based) and ends
at column 39, leaving one trailing space and at least two spaces after a
16-character filename.

The 35,484-byte release PRG and rebuilt D64 pass content verification.
`node tests/editor-session.js` passes in one owned VICE instance: Untitled and
full-length filename alignment, right padding, coordinate movement, watchpoints
on unchanged status cells, unchanged shell colours/IRQ vector/mask, save/reload,
overwrite refusal, cancellation, invalid-name errors, and rejection of the
removed switch. The status screenshot was inspected. The test process closes
its emulator automatically. Physical hardware was not tested.

## Exact PETSCII completion (2026-09-09)

Completed filename bytes are retained in the command buffer. Compact bitmaps
carry their provenance through editing, tokenization, all ten history entries,
and draft restoration. Editing a completed name clears its provenance without
affecting other completed operands. Batch input starts without completion flags.
The mixed-case ROM font remains in use; command-line display sanitizes controls.

The cc65 build adds 1133 bytes of code and 145 bytes of static storage (1278
bytes total). The PRG is 35,318 bytes, leaving 4534 bytes before the unchanged
2048-byte C stack. No extra directory cache or character set is allocated.

tests/petscii-completion.js creates a disposable D64 with $C1/$C2 filename
bytes and an ordinary-letter name that would collide after case conversion.
It exercises exact file reads, history after DIR, draft restoration, edited-name
fallback, appending a destination, and two completed drive-qualified operands.
All checks passed in VICE. tests/command-limits.js also passed full-length
input/recall, ten-entry history wrap and draft restoration, SET boundaries,
and batch overflow rejection. Release build and D64 content verification pass;
the packaged manual and SHA256SUMS were rebuilt. No physical hardware test
was performed.

## Smaller command and environment buffers (2026-09-09)

Commands now allow 85 characters, SET values 64 characters, and the packed
environment 1024 bytes. All ten history entries remain available. HELP remains
resident, and the C stack reservation remains 2048 bytes.

Build and D64 content verification pass. In VICE, tests/environment.js passed
value/name boundaries, exact 1024-byte capacity, rejected growth while full,
deletion/reuse, drive aliases, DIR settings, colors, and SET help. Its disk wait
was increased after a repeat run sampled DIR before completion.
tests/command-limits.js passed full-length input and recall, ignored excess
interactive input, ten-entry history wrap and draft restoration, and acceptance
of an 85-character batch command followed by rejection/abort at 86 characters.
tests/startup.js passed AUTOEXEC with 64-character values and no-device defaults.
Tests use a disposable disk; the command-limit fixture refreshes the directory
cache after an external disk edit. No physical hardware test was performed.

Static buffers shrink by 3932 bytes, and compiled code by another 80 bytes.
The PRG is 34,185 bytes. Shell/static allocation is 43,339 bytes, leaving 5812
bytes free before the unchanged stack, versus 1800 previously. Release PRG,
D64, packaged manual, and SHA256SUMS were rebuilt.

## REBOOT and five color presets (2026-09-08)

Build and D64 content verification pass. `node tests/reboot.js` passed in
VICE on its disposable test-reboot.d64: all five foreground/background/border
values, invalid preset rejection, COLOR and REBOOT help, environment reset,
AUTOEXEC rerun on the original startup drive, termination of the previous
batch, and no-device reboot defaults. Release PRG: 34,265 bytes.


## DOS message and command changes (2026-09-08)

`node tests/dos-messages.js` exercises the single invalid-drive diagnostic,
LABEL with explicit and default drives, prompted label clearing, uncached
Commodore-key completion without a duplicate prompt, FORMAT with a supplied
disk ID, and exact CHKDSK spacing and blank lines. Run at a shell prompt with
a disposable disk in drive 8: the test formats that disk.

CHKDSK's block-description line fills all 40 screen columns; it relies on the
screen writer's automatic wrap rather than adding another newline. Memory
figures report 65,536 installed bytes and the gap between static workspace
and the reserved C stack. These checks use VICE, not physical C64 hardware.

## KERNAL I/O optimizations (2026-09-08)

Startup reuses its directory snapshot unless a preference write invalidates it.
Cross-drive COPY passes the source type directly to the reader, avoiding a
second source listing. EDIT packs trimmed lines and CRs into its existing
256-byte buffer. DISKCOPY retains two host logical files (2 and 3), each using
secondary address 2 on its own drive, and closes both on completion or abort.
Explicit DIR still rereads the disk, and block-level error checks remain.

Tests ran in VICE x64sc with standard 1541 drives and disposable images.
The benchmark uses a persistent monitor connection and a breakpoint at prompt
output to read the emulated CPU cycle counter. Identical disk fixtures were
used for the saved baseline PRG and the optimized PRG. These are individual
runs, not statistical averages or physical Ultimate measurements.

| Operation | Before (million cycles) | After | Reduction |
| --- | ---: | ---: | ---: |
| Startup (saved CFG, no AUTOEXEC) | 4.93 | 3.58 | 27.3% |
| Save 24-row editor file | 9.67 | 9.47 | 2.1% |
| Cross-drive COPY, 8 KiB SEQ | 41.88 | 39.90 | 4.7% |
| Full 35-track DISKCOPY | 1270.60 | 1253.79 | 1.3% |

Both full DISKCOPY runs produced destination images identical to their sources
across all 174,848 bytes. The 8 KiB binary SEQ copy and the 960-byte editor save
also matched their fixtures byte-for-byte. The final editor refinement uses
memcpy to pack whole lines; --quick repeated startup/save/file-copy checks
for that build, retaining the earlier measurement of the unchanged DISKCOPY
implementation. Detailed counts are in build/io-benchmark.json.

To repeat: preserve the unoptimized build as build/baseline-io.prg,
build/baseline-io.lbl and build/baseline-io.d64 before rebuilding. Start VICE's
localhost:6510 monitor at BASIC or a shell prompt, then run
node tests/io-benchmark.js. It creates and mounts only test-io-*.d64 fixtures.
The --quick option repeats file tests and retains the saved full-disk result.

tests/io-cancel.js passed cancellation and subsequent DIR access on both
drives. tests/editor-save.js passed save/reload, sparse first/last rows,
overwrite refusal, cancellation and invalid filename checks on the final build.
The startup-input regression also passed during the initial optimization pass.

Final PRG: 29,542 bytes, an increase of 237 bytes. No additional transfer buffer
was allocated. Build and release D64 structure/content verification pass, and
SHA256SUMS are rebuilt.


## Startup confirmation input fix (2026-09-07)

Reproduced the double prompt in VICE by selecting 1 then entering Y + RETURN.
The single-key confirmation left RETURN queued as an empty shell command.
Startup now drains queued setup input before clearing the screen. The same
regression (tests/startup-input.js) showed two prompts before the fix and one
after it. Build and D64 verification pass; rebuilt PRG is 29,305 bytes.


## Startup preferences and AUTOEXEC (2026-09-07)

Built with cc65 and tested in VICE on disposable `build/test-startup.d64`.
Initial disk startup detected drive 8, displayed the scheme selector, and saved
preferences after selecting scheme 4 and answering Y. `node tests/startup.js`
then passed saved-color reload through a fresh BASIC LOAD/RUN, `/SAVE` with
individual colors and `/SCHEME`, AUTOEXEC execution after color restoration,
and direct monitor loads with KERNAL device markers 0 and 1. Both markers
produced `0:>` without a save prompt; DIR, TYPE, COLOR /SAVE, VOL and CHKDSK
refused disk access, and `8:` restored a selected disk. Tape was simulated via
its device marker; physical tape/Ultimate loading has not been tested.

The suite creates AUTOEXEC through EDIT and ends in BASIC. Use a fresh copy
of the release disk for a repeat run, following the setup comments in the test.


The existing `tests/update.js` regression suite also passed HELP ordering, DIR
formatting and switches, COLOR presets/combinations/exclusivity, and cursor
position/blinking. Final PRG is 29,293 bytes. Release D64 contents and sector
chains pass `scripts/verify-image.js`; release SHA256SUMS were rebuilt.
## Version 0.8 (2026-09-07)

Built and checked in VICE with a disposable `build/test-layout.d64` copied from
the release image. `tests/editor-status.js` verifies the changes directly:

- Watchpoints on fixed status text and the entire status color row receive no
  writes while typing and moving across one-/two-digit line and column values.
  Only changed coordinate fields are updated; the bar is drawn once on entry.
- At normal emulator speed, `Saving . . .` is visible after filename entry,
  with document contents intact. Completion clears to the shell prompt.
- MEM reports the linked memory budget, and the runtime C stack pointer is
  inside its new $C800–$CFFF reservation.

`tests/editor-save.js`, `tests/update.js`, `tests/tweaks.js`, and `tests/help.js`
also pass: save/reload and cancellation, visible errors, DIR and COLOR, cursor
position/blinking, RUN DEMO, and EXIT followed by usable BASIC. Reload the shell
and wait for its prompt between suites that end in BASIC. True-drive loading
can take longer than a fixed test delay. The status test creates `STATUS-SAVE`;
start with a fresh disposable image for its new-file save check.

The build now uses cc65's standard ceiling of $D000 instead of $A000. BASIC ROM
was already disabled by the runtime. This adds 12,288 bytes of capacity while
retaining the full 2,048-byte C stack. MEM derives both values from linker symbols.
Final PRG: 28,457 bytes. Code/static workspace: 36,974 bytes ($0801–$986E), with
12,177 bytes free before the stack. Release D64 structure and embedded PRG/SEQ
contents pass the build verifier; SHA256SUMS are updated. No physical hardware test.

## Version 0.7 (2026-09-07)

Built and checked in VICE on disposable D64 images. `tests/update.js`,
`tests/editor-save.js`, and `tests/dir-boundaries.js` pass:

- DIR uses 17 filename/separator columns, `blks`, a three-character file count,
  and two single-line totals. All standard file and summary rows occupy 39
  columns, with their final parenthesis at column 39 and opening block-count
  parenthesis at column 30 (one-based).
- Verified six-digit byte counts with a 100,000-byte SEQ file, a 16-character
  filename, 101 listed files, zero matching files, and wide-list pagination.
  CHKDSK still explicitly reports allocated bytes and blocks.
- EDIT's save, filename, and overwrite prompts stay in the status row. The
  full 24-row document remains unchanged while answering those prompts.
  Saving and reloading preserve the bottom row. Declining save or overwrite,
  and RUN/STOP at the filename prompt, leave a clear shell screen. Invalid
  filenames leave their error visible on a cleared screen.
- Existing HELP, COLOR, DIR switches, and shell cursor position/blink checks pass.

Start the shell using disposable `build/test-layout.d64` (a copy of the release
image). Run `tests/update.js` before the save test, which creates `UI-NOTES`.
`tests/dir-boundaries.js` creates and mounts its own disposable boundary fixture,
then restores `test-layout.d64`.

Release PRG: 28,283 bytes. Code/static workspace: 36,800 bytes, ending at $97C0.
The full 2 KiB stack remains reserved, with 63 bytes spare before it. Release
D64 contents, PRG and SEQ data, directory entries, and sector chains pass the
build verifier. Updated SHA256SUMS accompany both release files.

## Version 0.6 (2026-09-07)

Built with cc65 and verified on VICE with standard 1541 drives and disposable
D64 images. `node tests/update.js`, `node tests/help.js`, and
`node tests/tweaks.js` pass from their documented starting states:

- DIR keeps even a 16-character label on the volume header line and displays
  `Disk ID is MC` on the next line. File rows and allocated/free totals use
  comma-separated byte counts and parenthesized block counts. Wide listings,
  HELP, COLOR, and the shell's blinking cursor still pass.
- EDIT tracks line/column changes and uses the same blinking sprite underscore
  as shell input. Position and both blink phases were checked in VIC registers.
- EXIT clears to uppercase BASIC; immediate arithmetic, NEW, and BASIC program
  entry/RUN work. RUN DEMO clears shell text before launch, preserves DEMO's
  output, and leaves working uppercase BASIC with font switching restored.
- Same-drive and cross-drive REL copies preserve binary contents, record length,
  block allocation, and valid newly generated side-sector indexes. Tested a
  10,600-byte sparse fixture and a 700-byte fixture with seven 100-byte records,
  including zero, CR, and high-bit bytes across sector boundaries. Existing
  destinations were overwritten through the confirmation prompt.
- Raw block reads now clear per-channel EOF after U1, permitting multiple
  sectors to be read through the same direct-access buffer.
- The C version is defined once; startup, VER, and the generated disk README
  use that value.

REL test helpers use `build/test-tweaks.d64` and `build/test-rel-target.d64`.
With BASIC READY and the disposable source mounted as drive 8, run
`node tests/rel-fixture.js`. Then reload the shell, enable a standard 1541 as
drive 9, and run `node tests/rel-copy.js`. The verifier compares all fixture
bytes and checks the destination side-sector pointers after detaching disks.
`tests/tweaks.js` changes/restores the label on its disposable source and ends
in BASIC after RUN DEMO. `tests/help.js` also ends in BASIC; reload between suites.

Final PRG: 28,314 bytes. Code/static workspace: 36,831 bytes, ending at $97DF.
The full 2 KiB C stack remains reserved at $9800–$9FFF, with 32 bytes of unused
space before it. Both release files and SHA256SUMS are rebuilt; D64 structure
and embedded contents pass `scripts/verify-image.js`. No physical hardware test.

## Version 0.5 (2026-09-07)

DIR uses comma-separated allocated bytes and parenthesized, padded block counts.
The normal 1541 rows fit 40 columns without adding an extra blank line when
they wrap. `node tests/update.js` checks both normal and wide listings, totals,
COLOR combinations, HELP ordering, and the bottom-row blinking caret.

EXIT now uses cc65's runtime exit instead of jumping directly into BASIC's
READY routine. This restores the saved zero page, CPU stack, and memory mapping
and runs library destructors. `node tests/help.js` checks the clear uppercase
screen, then immediate arithmetic, NEW, entering a BASIC line, and RUN.

The intermittent physical C64 Ultimate menu lockout has not been reproduced
or confirmed fixed. The user subsequently could open the menu after tests both
with and without MEM. REU probing is unchanged in this build.

PRG size: 27,007 bytes. Both PRG and D64 are rebuilt and image contents verified.

## Version 0.4 (2026-09-07)

`node tests/help.js` passes against the built D64 in VICE:

- Updated general HELP sentence, terser COLOR syntax and scheme names, and
  Classic PC naming.
- All 16 palette entries verified directly in color RAM, with 38 reverse-video
  spaces and corresponding non-reversed decimal labels. Two-digit numbers get
  wider swatches so all labels remain spaced and fit one 40-column row.
- EXIT clears prior output and selects uppercase/graphics ROM characters
  ($D018 bit 1 clear). Only BASIC's READY prompt remains. Also visually checked.

PRG size: 26,817 bytes. Code/static workspace: 35,358 bytes. Reserved C stack:
2,048 bytes. Spare RAM before the stack: 1,505 bytes. `FUTURE.md` is assessment
only; no PC charset or MCSD command is implemented.

## Version 0.3 (2026-09-07)

Tested on the same VICE 3.10 stock C64/1541 setup. `node tests/update.js`
passes checks for:

- Alphabetical HELP, including DISKID between DISKCOPY and ECHO.
- `DIR/O` and `DIR/W/O`, no headings, per-file blocks and bytes, both allocation
  totals, and blank space before the returning prompt.
- All four COLOR schemes and their border/background registers; combined
  foreground/background/border switches; mixed SCHEME commands rejected without
  changing the existing colors.
- The DISKID input prompt on screen row 24. The cursor sits at column 35
  (sprite X=304, Y=242), and both blink phases were observed at normal speed.
  This reproduces and fixes the previous horizontal wrap bug.

Additional emulator checks:

- MEM with no REU, and with 128 KiB, 512 KiB, and 16 MiB REUs.
- Loaded a patterned 512 KiB REU image, ran MEM, saved the REU image, and compared
  every byte with the original. Contents were unchanged.
- DISKID followed by VOL and TYPE on both D64 and G64 test images: the new ID was
  visible and files remained readable, including G64's physical sector headers.

The 0.3 PRG is 26,747 bytes. Code and static workspace occupy 35,288 bytes;
the separate C stack reserves 2,048 bytes, with 1,575 bytes spare before it.
No physical Ultimate or printer test was performed by the agent. The user tested
the preceding builds on their Ultimate.

## Version 0.1 baseline

Tested with cc65 V2.19, Git e11fb5c (downloaded 2026-09-06), and VICE 3.10 x64sc.
The emulator uses a stock C64 and 1541 drives; Drive8TrueEmulation is enabled.
Warp mode accelerates wall-clock testing but does not replace the emulated disk
protocol with a fastloader. Disk-writing tests use disposable copies of the D64.

Verified interactively through VICE's local monitor:

- Startup from PRG, and actual disk autostart from the final D64.
- Directory listing with native filenames and separate PRG/SEQ types.
- Reading the included SEQ text and executing the included PETSCII batch.
- Same-drive COPY, cross-drive COPY, REN and confirmed DEL.
- FORMAT produced an empty 664-block disk. MOVE renamed a copied file and removed
  its source; a fresh directory listing confirmed the result.
- Editor text entry, RUN/STOP/save, and execution of the resulting `.BAT` file.
- LABEL followed by VOL after refreshing the drive's in-memory BAM.
- Full two-drive DISKCOPY of all 683 sectors. After detaching both images, their
  SHA-256 hashes were identical:
  `497338777158E8B4FDD75F0F54E1BAD95C0322D3D4375812AC1E3CF92D8E97EE`.
- RUN of a tokenized BASIC program: it printed its message and returned to BASIC.
- RUN /A 49152 of a machine-code PRG with a different stored load address: bytes
  arrived at $C000, the program changed the border to red, then returned to BASIC.
- MEM and the linked memory map; all code and static workspace fit below $A000.
- Cursor-up command history, independent color registers, and EXIT to BASIC.
- Cached completion resolved `type re` to `type "README"` when the Commodore
  modifier state was simulated through the monitor. Physical key mapping on the
  Ultimate has not been tested.
- Captured and visually inspected the emulated display.
- D64 structure: expected names/types, valid non-cyclic sector chains, recorded
  block counts, and byte-for-byte comparison of embedded PRG/SEQ files to inputs.

Not tested on physical C64 Ultimate hardware or a physical printer. Protected
disks, REL copying, and native C128 mode are outside this version's scope.

Final build allocation: 24,256-byte PRG (including its two-byte load address),
32,388 bytes from $0801 through the end of static workspace, plus a reserved
2 KiB C stack. There are 4,475 bytes between the workspace and reserved stack.

The smoke sequence in `tests/smoke.json` is a development aid, not an exhaustive
test suite. It expects a running emulator at localhost:6510, a shell prompt,
and fresh disposable disks in drives 8 and 9. Run:

```powershell
node scripts/monitor.js script tests/smoke.json
```

The helper pauses the emulator when reading screen memory. Resume with:

```powershell
node scripts/monitor.js cmd x
```

Never point this write-test sequence at disks you intend to keep.



## Environment preferences (2026-09-08)
Built with cc65 and verified in VICE using tests/environment.js and tests/startup.js. Passed custom variables, 16/256-character boundaries, atomic invalid assignments, environment capacity, deletion, drive aliases, DIR defaults and explicit overrides, COLOR /PRESET, exact SET help, AUTOEXEC long assignments, and no-device defaults. D64 verification passed. Environment capacity is 2048 bytes. MANUAL.TXT was not regenerated or edited.



## September command additions

Run `node tests/new-commands.js` for an owned, hidden VICE instance using disposable images. It checks CONCAT bytes and native errors; ATTRIB listing, lock/unlock and DEL protection; V0 orphan-allocation repair and invalid-chain failure; and immediate SPLASH return with display state preserved. Native validation is given 25 seconds per fixture.

Run `node tests/concat-limits.js` for sim65 coverage of the 40/41-character boundary and 18/19-source argument lists. `node tests/amount-switches.js` and `node tests/prompt.js` cover existing report and prompt behavior.
