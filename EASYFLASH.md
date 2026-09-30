# EasyFlash implementation (2.0 prototype)

The shell and its five distribution files are contained in `build/easyflash/MCS-DOS.crt`.
Device 0 is writable cartridge storage; devices 8–30 retain IEC disk access.
Load the CRT as an EasyFlash cartridge and reset. Shared services and state
remain in RAM; command modules execute directly from banked cartridge ROM.

## Storage and startup

The initial volume is `MCS-DOS 2.0`, ID `MC`. Its label and ID are fixed.
`DIR`, `TYPE`, `EDIT`, `COPY`, `MOVE`, `REN`, `DEL`, `FIND`, redirection,
batch files and `ATTRIB` use the same command syntax as disks. Physical disk
operations such as `FORMAT`, `DISKCOPY`, `LABEL` and `DISKID` are unsupported
on device 0. Sequential, program and user files are supported; REL files are
not supported on the cartridge.

Files have 16-character names and a read-only attribute. The five bundled files
start writable, just like user files. `ATTRIB +L filename` protects a file;
`ATTRIB -L filename` removes protection. They are CGA.CPI, AUTOEXEC.SAMPLE,
MANUAL.TXT, CHANGELOG.TXT and LICENSE.TXT. HELP reads indexed internal cartridge
data, independently of the writable filesystem; it never opens COMMANDS.HLP.

DIR lists only real files. Neither MCS-DOS.EXE nor COMMANDS.HLP is a reserved
filename. CHKDSK on device 0 reports the 128 KiB flash reservation,
recovery and metadata overhead, 64,000-byte logical capacity, exact live-file
bytes, available bytes and free directory slots. CHKDSK /V remains a disk-only
repair operation.

Create `0:AUTOEXEC.BAT` with `EDIT`, or copy `0:AUTOEXEC.SAMPLE` to it. A missing
AUTOEXEC is normal. The optional `0:CONFIG.SYS` is read before AUTOEXEC:

```text
BOOTDRV=8,0
LDAUTOEX=1
```

Defaults are `BOOTDRV=0` and `LDAUTOEX=1`. BOOTDRV accepts device 0 and 8–30,
in order, with up to 24 entries. Unavailable devices and missing files are
skipped. Only the first AUTOEXEC found is attempted; a script error does not
select another script. Its device becomes the initial drive and the source
for startup charset files. With no script found, startup remains on drive 0.
`LDAUTOEX=0` disables the search. Names are case-insensitive, spaces and tabs
are ignored, and both CR and LF line endings work. Invalid directives report
an error and leave the previous valid value/default in effect. RESTORE at the
boot screen still skips automatic startup scripts.

The filesystem has 40 directory entries and 64,000 bytes of file payload shared
by bundled and user files. `layout.json` reports the remaining capacity after
packaging. Directory sizes and free space use conventional 254-byte blocks,
so displayed free space rounds down. Writes append records to the active
sector. REN, DEL and ATTRIB normally append just 32 bytes; creating, editing
or copying a file writes its new contents plus a 32-byte record. Obsolete
versions consume physical journal space but not logical free space.
When necessary, compaction copies live files to the alternate sector and
erases that spare sector. This is the occasional slower operation. BASIC
session saves use the separate journal below and do not rewrite the filesystem.

A file write becomes visible on close, after CRC readback and a final commit
marker. Interrupted appends retain the previous committed file. Compaction
keeps the original sector until the replacement is completely committed.
An incomplete journal tail is reclaimed on the next write. Wildcard deletion
commits each file separately, so an interruption can leave a partly completed
batch. Do not reflash
the distribution image to preserve user files: replacing the whole cartridge
image replaces its filesystem too. Back up files with `COPY 0:name 8:name`.

This build uses MFJ3, incompatible with the previous MFS2 filesystem. Back up
existing files using the old build before installing the new CRT, then copy
them back. There is no automatic migration or formatting of unknown data.

Physical EasyFlash stores changes in flash. Emulator/Ultimate persistence to
the host CRT file also depends on that platform's save/writeback facility;
a CPU reset retaining data does not alone prove the CRT on host storage was
updated. In VICE, enable EasyFlash CRT writeback (`-easyflashcrtwrite`) and
save/detach normally. Hardware and Ultimate save behavior must be checked on
the target setup.

## Bank layout

| Banks | Use |
| --- | --- |
| 0 | Reset/bootstrap, RAM bank bridge, vendor EasyAPI |
| 1–3 | Shell load image, copied to RAM at startup |
| 4 | Filesystem/session flash driver and external-program loader |
| 5 ROMH | `edit.c`: editor, command-line input/history/completion |
| 6 ROMH | `fileutil.c`: TYPE, PRINT, FIND, HELP, RUN |
| 7 ROMH | `filemgmt.c`: DIR, COPY/MOVE, DEL, REN, ATTRIB, shared file helpers |
| 8 ROMH | `disk.c`: raw disk services, VOL/CHKDSK, FORMAT, LABEL, DISKID, DISKCOPY |
| 9 ROMH | `boot.c`, `session.c`: startup/configuration, SET, splash, charset, BASIC/session services |
| 10 ROML | Indexed internal HELP text |
| 11 ROMH | Standalone Datasette copier |
| 11 ROML, 12–47 | Reserved for future code/data |
| 48–55 ROML/ROMH | Private session journal: two independent 64 KiB sectors |
| 56–63 ROML | Filesystem journal A: one physical 64 KiB sector |
| 56–63 ROMH | Filesystem journal B: one physical 64 KiB sector |

The two chips are erased independently. Do not pack code into filesystem or
session sectors, even apparently unused bytes. File offsets cross 8 KiB bank boundaries
without exposing banks to callers. The build rejects shell/driver overflows.

RAM reservations are $0400–$06FF for EasyAPI, $0700–$07EF for driver state,
$07F0–$07F4 for flash parameters, $07F5 for the current command bank,
$0800–$087F for the shared mailbox,
$0880–$09FF for the bank bridge, $C000–$C1FF for the BASIC wedge and return
descriptor, $C200–$C2FF for filesystem indexes, and $C700–$C7FF for the driver's C stack.
The resident shell starts at $0A00 and keeps its 2 KiB stack at $C800–$CFFF.
Its display and charset remain in upper RAM. The bridge preserves Oscar64's
zero-page workspace and disables interrupts during filesystem calls.

The flash driver remains separately linked. Flash writes/erase use EasyAPI
from RAM; individual flash accesses restore driver bank 4, and the completed
filesystem call restores the caller's command bank and CPU mapping. The
driver temporarily exposes both cartridge halves; no shell code or IRQ runs
during that interval. Its parameters and transfers use the low-RAM mailbox.

## Banked command architecture

`mcsdos.c` retains the main loop. `core.c` holds persistent state, dispatch,
parsing, output, channel services, and small common commands. The five modules
above share `core.h`. `bank-gates.c` contains typed resident entry points:
save the current bank, select the target bank, call its implementation, then
restore the saved bank before returning. Nested calls follow the same rule.
Internal calls within one module use its `bank_` functions directly.

Command banks use **ROMH at $A000–$BFFF**, with `$DE02=7` and `$01=$36`.
This keeps RAM at $8000–$9FFF, I/O and KERNAL visible. See table A.7 of
[The C64 PLA Dissected](https://skoe.de/docs/c64-dissected/pla/c64_pla_dissected_a4ss.pdf).
Only the short mapping change disables IRQs; keyboard scanning and timing
continue while a command runs. No command is copied into a RAM overlay.

All shell modules are linked together so Oscar64 sees the complete call
graph and owns one calling convention and stack allocation. The build links
the identical program in PRG and CRT formats, verifies identical generated
assembly, then packages the resident PRG and the five ROMH banks. The custom
startup/runtime configuration is generated from the installed compiler.
`shell.prg` is consequently not runnable by itself.

Banked functions must remain `__noinline`. Cross-bank arguments and results
must use resident data or scalars: a pointer to another bank's literal is
not valid after switching banks. Resident output routines can consume a
literal from the currently visible caller bank. Persistent variables remain
in RAM. IRQ/NMI handlers and mapping/flash routines must remain resident.

With the filesystem journal the build uses 29,335 bytes for the resident shell/workspace,
plus the unchanged 2,048-byte stack. MEM reports **10,600 bytes free** versus
231 before the banking refactor. Of these, 9,576 bytes are below $A000 and 1,024 are
at $C300–$C6FF. The latter is outside the compiler's contiguous main region;
the standalone tape copier uses it temporarily after relinquishing the shell.
RAM beneath the ROM
window is not counted. MEM shows the 8,192-byte window separately and does
not probe REU hardware. Exact figures are generated in `layout.json`.

The five banks occupy 25,948 bytes, with 15,012 bytes spare across them.
The aggregate executable is 43,771 bytes, including the resident image and
banked code/data. Resident code/data/BSS falls from the pre-banking build's
48,664 bytes to 29,335 bytes despite the additional session functionality.
File management is the tightest bank (788 bytes spare). Future code can use
additional banks instead of increasing resident code size. RAM data still
has a real limit; new persistent buffers, gates and resident/library services
consume the reported free RAM.
The build rejects bank overflow, resident code reaching $8000, or resident
data reaching $A000. Move a cohesive helper/command group to another bank
and add resident gates when a bank fills; do not enlarge its window.

Run `node tests/easyflash.js --banked` for the full cartridge regression with
ROM-versus-RAM checks and a guard over the free upper RAM block. Hardware
testing of this banked build remains required before committing.

The logic suites and independent CRT layout check accompany the cartridge
tests. The full PAL cartridge suite covers editing, copying,
cross-device binary transfers, disk CHKDSK, FIND, CONFIG/AUTOEXEC, both charset
sources, cartridge program launch, interrupted-write recovery and CRT
writeback/reload. Targeted checks cover NTSC, REBOOT, disk program
launch, filesystem statistics and RAM preservation across flash writes.

The first banked build had a charset initialization regression: `$01=$31`
does not expose character ROM while the 16K cartridge mapping is active
(PLA table A.3). The resident `charset_prepare` wrapper now hides cartridge
ROM during the copy and restores the caller's bank afterwards. This preserves
the existing KERNAL-off/NMI-safe copy routine. The fix costs 13 resident bytes.
The cartridge suite now verifies all 2,048 font bytes at boot, rather than
only decoding screen RAM. `--display` checks DIR, SPLASH and REBOOT and saves
a rendered screenshot; `--display --display-fonts` additionally checks complete
CPI fonts from cartridge/disk and missing-file fallback.

## Filesystem format

Each 64 KiB sector starts with a 32-byte header: `MFJ`, version 3, a 16-bit
generation at offset 4, the sealed baseline end at 6, CRC-16/CCITT of bytes
0–7 at 8, and commit marker `$A5` at 15. CRC uses polynomial $1021 and
initial value $FFFF. All multibyte fields are little-endian.

Records begin at offset 32 and end no later than 65504. Each has a 32-byte
header: name (17 bytes), type (17), payload offset (18), length (20), read-only
flag (22), directory slot (23), record span (24), CRC (26), magic `$4A` (28),
kind (29), optional overwritten slot (30; $FF for none), and commit `$A5` (31).
Kinds are new data (1), metadata/reference (2), and deletion (3). New file
payloads follow their header contiguously and can cross 8 KiB bank boundaries.
Metadata records reference existing payloads without copying them. Rename
over an existing file drops the destination slot in the same committed record.
CRC covers new payload bytes first, then header bytes 0–25 and 28–30.

Mount selects the newer committed generation and rebuilds RAM indexes from
valid records. Damage in the sealed baseline invalidates that sector; a torn
append ends the log without hiding preceding committed records. Generation
comparison supports 16-bit wrap. Compaction seals a complete new baseline
before selecting it, including a pending file when rollover happens mid-write.

Only one writer may be open. Existing readers retain their sector and offsets
until close; the driver refuses an erase if a reader still needs that sector.
Aborting a copy discards the pending write. No erase is needed after mounting
or reading. Run `node tests/easyflash.js --journal` for record size, compaction,
interrupted-write recovery, and HELP independence checks.

## BASIC and shell sessions

`BASIC` replaces `EXIT`. It saves the current environment, active prompt,
colors, current drive, ECHO setting, all ten history entries (including their
exact-byte metadata), and the actual 2,048-byte font. Active settings are
stored separately from environment values which may apply only on the next
ordinary startup. The directory cache and open/batch execution state are discarded.

BASIC starts with its normal ROM uppercase/graphics font and full program
area through $9FFF. Shell colors remain, the screen is cleared, and
`COMMODORE BASIC V2` and `38911 BASIC BYTES FREE` appear on separate lines,
then a blank line, `TYPE 'SHELL' TO RETURN TO MCS-DOS`, another blank line,
and `READY.`. The RAM
wedge hooks BASIC's statement-dispatch vector and recognizes only a standalone
`SHELL` at the direct prompt, allowing surrounding spaces. Ordinary statements,
variables such as `SHELLX`, and program execution use the original interpreter.
The wedge and descriptor fit within $C000–$C1FF; BASIC loses no program space.

`SHELL` reloads the resident image from cartridge, recreates runtime/display
services, and restores the exact saved session. It skips the splash,
CONFIG.SYS and AUTOEXEC.BAT. BASIC programs and variables are discarded.
The saved font is restored directly, without reopening a CPI file or disk.
Changes to colors made in BASIC do not alter the saved shell colors.

If saving fails, the shell asks
`Warning: write error saving shell state. Proceed to BASIC (Y/N)?`.
N (or RUN/STOP) keeps the shell running. Y enters BASIC with an invalid return
token; `SHELL` then starts with defaults and a warning, without startup files.
Corrupt or incompatible snapshots receive the same fallback. Normal cartridge
reset always ignores sessions and processes startup files normally.

The private journal uses 32 slots of 4,096 bytes across banks 48–55, on both
flash chips. Saves append to unused slots; when full, the sector opposite the
latest committed record is erased and reused. These retained records reduce
erase frequency; they are never used as restoration fallbacks. Restoration
neither erases nor rewrites flash.

Each 16-byte header contains `MSS`, format version 1, a little-endian 16-bit
generation at offset 4, payload length (3,349) at offset 6, and CRC-16/CCITT
at offset 8 (polynomial $1021, initial value $FFFF). Offset 15 is committed
as $A5 only after readback verification. The payload contains 16 metadata
bytes, 512 environment bytes, 650 history bytes, 90 history metadata bytes,
33 prompt bytes, and 2,048 font bytes. No pointers are serialized.

The RAM descriptor at $C1E0 retains the slot, generation and CRC from a
successful save. Its validity flag is cleared before every attempt and set
only after successful verification. Restore requires that exact token plus
a valid header and full payload CRC; it never chooses an older record.
The cold-start bootstrap clears the resume request, while the wedge sets it
immediately before loading the shell. The on-flash snapshot remains intact
after return. Snapshot format changes must increment its version.

Run `node tests/easyflash.js --session` for BASIC execution, state round trips,
startup bypass, flash readback/rotation, failed-save N/Y paths, CRC rejection
and cold-reset behavior. `--ntsc` selects NTSC timing.

## Automatic return from RUN

Before launching a PRG, RUN saves the same session as BASIC, then installs
the return image at $C000–$C1DF. The handoff token remains at $C1E0–$C1FF.
Both disk and cartridge loaders call its fixed $C003 entry to initialize
BASIC and then hook the warm-start vector at $0302/$0303. A normal return
through that vector reloads the shell and restores the exact saved session,
skipping the splash, CONFIG.SYS and AUTOEXEC.BAT. Batch execution is not resumed.
The BASIC command still uses its separate, manual SHELL statement wedge.

This also intercepts BASIC errors and STOP paths that reach the prompt vector.
The shell clears the screen on restoration, so program output/error messages
are not retained. RUN /A still jumps to the selected address; a bare RTS is
not a supported exit from that direct jump, but a return through BASIC is.

On save failure, RUN asks `Warning: write error saving shell state. Run program
anyway (Y/N)?`. N cancels the launch; Y runs with an invalid return token, so
an automatic return uses defaults with a warning instead of an older snapshot.
Cold cartridge reset retains its ordinary startup behavior.

No additional RAM is reserved. Programs can overwrite the return code/token,
replace BASIC vectors, bypass the prompt vector, reboot or never exit. The
hook is an optional convenience and does not restrict their memory access.
Run `node tests/easyflash.js --run-return` for disk/cartridge native returns,
BASIC errors, absolute launches, saved-state restoration, failed saves and
programs that deliberately reset the vector.

## Datasette transfer implementation

`TAPECOPY` saves the session and enters a separately linked copier in bank 11
ROMH. It restores the shell after each saved file, then offers another transfer
to the same destination. Batch execution is not resumed. Completion and errors
are printed after restoration. Syntax is `TAPECOPY [filename] [drive:]`.
The optional filename selects a tape name using BASIC LOAD's prefix matching;
intervening standard files are displayed and consumed without save prompts.
Destination names are prompted, and existing names are never overwritten.
Choosing another transfer clears the search. The search string occupies
$C610–$C620 during handoff. Skipped files retain the same format and size limits.
The copier retains the shell text, background and border colours using
$C621–$C623. For VICE tests use TAP pulse images; T64 containers do not supply
the Datasette pulses required by this reader.

The copier uses the original C64 KERNAL block decoder at $F84A. It accepts
standard program headers ($01/$03) and sequential headers ($04), checks tape
status after each duplicated block, and recognizes the $05 end marker. It does
not execute headers, infer whether a program is self-contained, or decode turbo
formats. Unrecognizable signals may continue searching until RUN/STOP; this
is not a definitive turbo-format detector. A compatible stock tape KERNAL is
required, as well as a Datasette-compatible tape interface.

PRG payloads occupy $1000–$BFFF (45,056 bytes), independent of their recorded
load address. The original address is prepended when saving. Oversized PRGs
are rejected before payload reception. SEQ data is copied in validated blocks
of up to 191 bytes, omitting block markers, the logical zero terminator and
padding. The output remains open between blocks. Disk failures/cancellation
scratch partial SEQ output; cartridge failures abort the unpublished journal
record. Cleanup failures are reported explicitly.

The copier screen is at $0C00, its RAM banking gates at $C300–$C5FF, parameters
at $C600, C state at $C800–$CBFF and stack at $CC00–$CFFF. The standard tape
buffer $033C–$03FB is temporarily available because the shell cursor is hidden.
Cartridge filesystem workspace, bridge, EasyAPI and session token are retained.
The RAM gates disable cartridge mapping during tape decoding and buffer reads;
filesystem calls return to copier bank 11. Handoff/result bytes $C1E8–$C1EE
survive shell reloading. The tape bridge requests resume with $54 instead of
the BASIC/RUN wedge's $A5, so a native program cannot accidentally trigger tape
result handling by overwriting the spare descriptor bytes. Other startup paths
clear the pending-result marker.

`node tests/easyflash.js --tape` generates standard TAP pulse streams and tests
actual KERNAL decoding with tape traps disabled, disk/cartridge PRG and SEQ
output, large payloads, repeated transfers, collisions, cancellation and error
cleanup. Add `--ntsc` to exercise NTSC timing. Use disposable tape/disk images
on hardware to verify motor stop/start behaviour as well.

## Scope

RUN can load PRGs from the cartridge as well as disks. Running an external
program directly from the shell relinquishes it until the optional return
hook restores it or the user resets the cartridge.
The BASIC return wedge is a convenience: programs that overwrite its RAM or
BASIC vectors can disable it. The filesystem and session formats are
experimental; future versions may require
backing up and restoring files.
