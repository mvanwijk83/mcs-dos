# EasyFlash implementation (2.0 prototype)

The shell and its six distribution files are contained in `build/easyflash/MCS-DOS.crt`.
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

Files have 16-character names and a read-only attribute. The six bundled files
start writable, just like user files. `ATTRIB +R filename` protects a file;
`ATTRIB -R filename` removes protection. `HELP` reads `0:COMMANDS.HLP`.

DIR also displays a read-only virtual `MCS-DOS.EXE` entry. Its length comes
from the resident shell PRG (including its load address) plus the occupied
command-bank bytes, excluding bank padding and filesystem storage; DIR
shows the usual rounded disk-block allocation. This entry is for directory
display, not a stored/copyable file, and consumes no writable space or slot.
Its name is reserved. CHKDSK on device 0 reports the 128 KiB flash reservation,
recovery and metadata overhead, 64,000-byte logical capacity, exact live-file
bytes, available bytes and free directory slots. The virtual executable is
excluded from those writable-area statistics. CHKDSK /V remains a disk-only
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
so displayed free space rounds down. Writes compact the live files into the
alternate flash sector. This deliberately favors simplicity and recovery over
speed: even a small edit rewrites the current files and erases one 64 KiB
sector. Frequent history/cache saving is not implemented in this stage.

A write becomes visible on close. The old snapshot remains intact until the
new snapshot has a checksum and its final commit marker. Failed/full writes
and reset before commit leave the previous snapshot available. Do not reflash
the distribution image to preserve user files: replacing the whole cartridge
image replaces its filesystem too. Back up files with `COPY 0:name 8:name`.

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
| 4 | Filesystem driver and external-program loader |
| 5 ROMH | `edit.c`: editor, command-line input/history/completion |
| 6 ROMH | `fileutil.c`: TYPE, PRINT, FIND, HELP, RUN |
| 7 ROMH | `filemgmt.c`: DIR, COPY/MOVE, DEL, REN, ATTRIB, shared file helpers |
| 8 ROMH | `disk.c`: raw disk services, VOL/CHKDSK, FORMAT, LABEL, DISKID, DISKCOPY |
| 9 ROMH | `boot.c`: startup/configuration, environment SET, splash, charset loading |
| 10–55 | Reserved for future code/data |
| 56–63 ROML | Filesystem snapshot A: one physical 64 KiB sector |
| 56–63 ROMH | Filesystem snapshot B: one physical 64 KiB sector |

The two chips are erased independently. Do not pack code into either filesystem
sector, even apparently unused bytes. File offsets cross 8 KiB bank boundaries
without exposing banks to callers. The build rejects shell/driver overflows.

RAM reservations are $0400–$06FF for EasyAPI, $0700–$07EF for driver state,
$07F0–$07F4 for flash parameters, $07F5 for the current command bank,
$0800–$087F for the shared mailbox,
$0880–$09FF for the bank bridge, and $C700–$C7FF for the driver's C stack.
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

The provisional build uses 29,025 bytes for the resident shell/workspace,
plus the unchanged 2,048-byte stack. MEM reports **11,678 bytes free** versus
231 before this refactor. Of these, 9,886 bytes are below $A000 and 1,792 are
at $C000–$C6FF. The latter is available for an explicitly placed future buffer;
it is not part of the compiler's contiguous main region. RAM beneath the ROM
window is not counted. MEM shows the 8,192-byte window separately and does
not probe REU hardware. Exact figures are generated in `layout.json`.

The five banks occupy 24,770 bytes, with 16,190 bytes spare across them.
The aggregate executable grows from 37,153 to 42,284 bytes because of explicit
call boundaries, gates and changed compiler optimization opportunities; flash
absorbs that cost. Resident code/data/BSS falls from 48,664 to 29,025 bytes.
File management is the tightest bank (788 bytes spare). Future code can use
additional banks instead of increasing resident code size. RAM data still
has a real limit; new persistent buffers, gates and resident/library services
consume the reported free RAM.
The build rejects bank overflow, resident code reaching $8000, or resident
data reaching $A000. Move a cohesive helper/command group to another bank
and add resident gates when a bank fills; do not enlarge its window.
The virtual EXE directory entry still uses a 16-bit byte count; that metadata
will need widening once the aggregate executable exceeds 65,535 bytes. This
is separate from the banked code's addressability.

Run `node tests/easyflash.js --banked` for the full cartridge regression with
ROM-versus-RAM checks and a guard over the free upper RAM block. Hardware
testing of this banked build remains required before committing.

Validation for this prototype: all 11 logic suites and the independent CRT
layout check pass; the full PAL cartridge suite covers editing, copying,
cross-device binary transfers, disk CHKDSK, FIND, CONFIG/AUTOEXEC, both charset
sources, cartridge program launch, interrupted-write recovery and CRT
writeback/reload. Targeted checks also pass for NTSC, REBOOT, disk program
launch, virtual EXE statistics and RAM preservation across flash writes.

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

Each snapshot starts with `MFS`, format version 2, a little-endian 16-bit
generation at offset 4, the used-data end at offset 6, file count at offset 8,
and a two-byte checksum at offset 10. Offset 15 is the commit marker `$A5`.
The checksum covers bytes 32 through the used-data end (exclusive): its low
byte is the sum of bytes modulo 256, and its high byte accumulates those sums
modulo 256. Mount validates both snapshots and selects the newer valid
generation, allowing 16-bit generation wrap.

The directory starts at offset 32, with 40 slots of 24 bytes. Each slot contains
a 17-byte NUL-terminated name, one file-type byte, a 16-bit data offset, a
16-bit length, one read-only flag, and one reserved byte. Data starts at 1024;
its exclusive upper limit is 65024. File data is contiguous within a snapshot
and can span several 8 KiB cartridge banks. All multibyte fields are little-endian.

Only one writer may be open. Existing readers retain their snapshot until
close; the driver refuses an erase if a reader still needs that older sector.
Close writes the directory entry, header and checksum, then programs the
commit marker last. Aborting a copy discards the pending write.

## Scope

RUN can load PRGs from the cartridge as well as disks. Running an external
program relinquishes the shell; cartridge reset boots it again. There is no
BASIC return wedge or session restoration yet. Existing EXIT remains a BASIC
handoff. The filesystem format is experimental; future versions may require
backing up and restoring files.
