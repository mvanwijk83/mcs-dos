# MCS-DOS 0.8

A small MS-DOS-inspired shell for an unexpanded Commodore 64. Written for fun,
with native Commodore disks, a 40-column screen, and familiar DOS prompts.
Also runs on a C128 in **C64 mode**.

## Try it

Mount `build/MCS-DOS.d64` as device 8 on your C64 Ultimate. Select/run the
`MCS-DOS` program in the disk browser, or enter these commands from BASIC:

```basic
LOAD "MCS-DOS",8,1
RUN
```

Startup uses PC Classic 1: cyan text on black, with a black border.
Before initialization, a four-second splash displays the embedded PETSCII MCS
logo in blue and the shell version and copyright in white. REBOOT skips this splash.
PC Classic 2 uses light gray (15) text on black. Other schemes are white on
black, green on black, and BASIC blue. Schemes 1–4
have black borders; BASIC blue uses light blue (14) on blue (6), with border 14.
`COLOR/PRESET:1` through `COLOR/PRESET:5` select these same presets later.

Disk startup uses the last KERNAL device (8–30). Tape or an unset/invalid device
starts at `0:>`, meaning no disk selected. Direct emulator/Ultimate PRG loading
can leave a stale device number, so detection is best effort. Enter `8:` (or
another disk device) to select a drive. Disk operations at drive 0 are refused.

On disk startup, AUTOEXEC.BAT on the startup disk runs automatically. RUN/STOP
aborts it. Missing AUTOEXEC leaves the system defaults active. MCS-DOS.CFG is
no longer read or written, and COLOR /SAVE has been removed. Put COLOR and SET
commands in AUTOEXEC.BAT to reapply preferences on each boot.

The environment starts empty. SET lists entries; SET NAME=value stores an entry,
and SET NAME= removes it. Names are case-insensitive (maximum 16 characters);
values allow 64 characters, including spaces, but not quotes. The packed
shared environment has 512 bytes of capacity, including names and separators.
Oversized or invalid assignments fail without changing the existing entry.
Custom variables are retained without affecting shell behavior; percent expansion
is not supported. Recognized settings ignore surrounding spaces and value case:

- DRIVEIDS=C64 or DOS controls displayed drive IDs (default C64). Both numeric
  and letter prefixes are always accepted: A=8 through W=30.
- CHARSET=NAME selects NAME.CPI after AUTOEXEC finishes, loading it from the
  startup disk. CGA.CPI, AMIGA.CPI and ATARIST.CPI are supplied. An empty value or no setting uses the
  default mixed-case C64 font. Interactive SET changes do not switch fonts.
- DIRCMD supplies DIR switches only when the command has no explicit switches,
  including when a drive or filename pattern is supplied. The default is empty.

Unsupported known values report "Invalid value". Missing or whitespace-only
settings use defaults. COLOR has no associated environment variable.

```text
8:>HELP
8:>DIR /O
8:>TYPE MANUAL.TXT
8:>RUN HELLO.BAT
8:>EDIT NOTES
```

The D64 contains MCS-DOS, HELLO.BAT, MANUAL.TXT, LICENSE.TXT, CGA.CPI,
AMIGA.CPI, ATARIST.CPI and COMMANDS.HLP.
README and DEMO remain local example artifacts and are not included on the disk.
The standalone `build/MCS-DOS.prg` is also included.
PRG launch clears the shell display and restores the default uppercase character
set, just as EXIT does; the launched program's output remains visible afterward.

To select CGA lettering, add `SET CHARSET=CGA` to AUTOEXEC.BAT on the startup
disk, alongside CGA.CPI. REBOOT clears the environment and reruns AUTOEXEC;
edit that file to change the next startup's selection. A missing or invalid
CGA.CPI reports an error and leaves the C64 font active. CGA replaces letters,
digits and shared punctuation, including reverse video; C64-specific symbols
and the mixed-case set's graphics retain their ROM shapes. There is no CHARSET
command. See [CHARSETS.md](CHARSETS.md) for the file format and RAM layout.
Other names load their matching NAME.CPI without shell changes. Names allow
1–12 letters, digits, spaces, hyphens or underscores, ignoring case and
surrounding spaces. Supply the stem without `.CPI`. Every nonempty name selects
a file; `CHARSET=C64` therefore looks for `C64.CPI`.
`SET CHARSET=AMIGA` selects Kickstart 1.0 Topaz/8; `SET CHARSET=ATARIST`
selects the Atari ST 8x8 system font. Both preserve the same C64-specific
symbols as CGA and include automatically generated reverse glyphs.

## Controls

- Commands and switches are case-insensitive.
- Spaces before switches are optional: `DIR/W`, `DIR/O/W`, and `COLOR/PRESET:1`
  are accepted. Quote a filename containing a literal slash.
- An underscore cursor blinks during command and filename input and in EDIT.
  EDIT's status line shows the current line and column. Completed
  commands leave a blank line before the next interactive prompt.
- RETURN executes a command; RUN/STOP abandons input or cancels where practical.
- Up/down recall the last ten commands. Left/right move within the command;
  DEL deletes to the left; HOME moves to the beginning. Typing inserts.
- Commands can be up to 85 characters (including batch commands). Long input scrolls horizontally.
- Press and release the **Commodore key** to complete a filename after a command.
  Press it again to cycle matches. The first completion reads the directory;
  subsequent completions use the cache. `DIR` refreshes after a disk swap.
  Completed filenames retain their exact PETSCII bytes, including through
  command history and directory refreshes. Editing a completed name returns
  that name to ordinary typed-name handling. Graphics may look different in
  the mixed-case font, but completion still selects the original filename.
- Use quotes around names containing spaces: `TYPE "MY DATA FILE"`.
- `9:` selects device 9. Explicit paths such as `9:NOTES` or `9:"MY NOTES"`
  work without changing the current device. Device numbers 8–30 are accepted.

## Commands

`HELP command` and `command /?` show syntax on the C64.

Detailed help streams from COMMANDS.HLP on the startup drive. Keep that file
on the system disk, including when using the standalone PRG. After a no-device
startup, help uses the currently selected drive. General HELP remains built in.
Detailed help involves disk access; RUN/STOP cancels it. A missing, incompatible,
or unreadable file prompts `Insert MCS-DOS disk and press any key when ready`.
Insert the system disk in the startup drive and press a key to retry, or press
RUN/STOP to return to the shell. After a no-device startup, use the selected
drive instead. Help cannot redirect output onto its own source file.
If help output is redirected to that same drive, the system disk must already
be inserted: a missing help file ends the command without waiting for a swap,
because the destination file is open on the disk currently in the drive.

| Command | Behavior |
| --- | --- |
| BEEP [ms] | SID square-wave beep; default 200 ms |
| CHKDSK [drive:] | File allocation totals and free space |
| CLS | Clear screen |
| COLOR /FORE:n /BACK:n /BORDER:n | Independent C64 colors, 0–15 |
| COLOR /PRESET:n | Select preset 1–5 |
| COPY source destination | One PRG, SEQ, USR, or REL file; same or different drive |
| DEL file | Delete with confirmation; * deletes all unlocked files; DELETE and ERASE are aliases |
| DIR [pattern] [/B /L /O /W] | Paginated listing; names, lowercase, sorting, wide |
| DISKCOPY source: destination: | Full standard 35-track 1541 disk copy, two drives |
| DISKID [drive:] [id] | Change the directory's two-character disk ID |
| ECHO text | Display text; ECHO ON/OFF and ECHO. supported |
| EDIT [file] | One-screen SEQ text editor |
| EXIT | Clear the screen and return to uppercase BASIC; the shell is not retained |
| FORMAT drive: | Confirm, ask for label and two-character disk ID, full format |
| HELP [command] | Command list or syntax |
| LABEL [drive:] [label] | Change a standard 1541 disk's volume label; RETURN at the prompt clears it |
| MEM | Installed RAM, shell/workspace allocation, and detected REU capacity |
| MOVE source destination | Copy, then scratch source after success |
| PAUSE | Wait for a key |
| PRINT file [4:\|5:\|LPT1\|LPT2] | Send raw file bytes to printer (default 4), secondary address 7 |
| REM text | Batch comment |
| REN old new | Rename on the same disk; RENAME is an alias |
| RUN file [/A address] | Execute batch or launch PRG |
| TYPE file | Paginated text display |
| VOL [drive:] | Label and disk ID |
| VER | Version; VERSION is an alias |

File types are separate metadata, not synthetic extensions. Filenames have the
native 16-character limit. Allocation figures use **blocks × 256**, including
sector link bytes; these are not exact file lengths. No timestamps are invented.
Normal DIR rows reserve 17 columns for the filename and separator, then show
the file type, comma-separated bytes, and blocks abbreviated to `blks`:

```text
MCS-DOS          PRG  28,928 (113 blks)
HELLO.BAT        SEQ     256 (  1 blks)
README           SEQ     256 (  1 blks)
DEMO             PRG     256 (  1 blks)
  4 File(s)     29,696 bytes (116 blks)
          140,288 bytes free (548 blks)
```

The volume label stays on the header line when it fits, followed by the Disk ID.
File rows and both summary rows occupy 39 columns, with their block counts
aligned. The file count has a three-character field (up to 144 entries). DIR
omits the word "allocated"; CHKDSK retains explicit allocation statistics.

`DIR` supports `*` and `?`. Its `/O` (also `/ON`) sorts names. `/B` still paginates.
`COPY`, `MOVE`, and `REN` operate on one exact filename. `DEL`, `DELETE`, and
`ERASE` accept native disk wildcards (`*` and `?`) with confirmation; `DEL *`
deletes all unlocked files on the current disk. Use `DEL A:*` to select a disk.
Existing destinations always prompt before overwrite.

`COLOR /FORE`, `/BACK`, and `/BORDER` can be combined. `/PRESET` cannot be combined with individual color options;
a mixed command is rejected before any color is changed. `HELP COLOR` lists the
five scheme names and displays a reverse-video palette with color numbers 0–15.

`DISKID 8: AB` changes the directory ID shown by VOL. The drive defaults to the
current device, and omitting the ID prompts for two letters or digits. Files are
preserved. This changes the BAM's directory ID, not the IDs encoded in every
physical sector header; it is not a reformat or a disk-protection utility.

`LABEL` defaults to the current drive. Without a label argument it displays the
current label and disk ID, then prompts for a label (up to 16 characters).
`FORMAT` asks for two letters or digits as the disk ID before formatting.
`CHKDSK` shows comma-separated allocation, block and memory totals in aligned
seven-character fields. Disk space is allocated file blocks plus free blocks,
excluding disk metadata. Free memory excludes the shell and reserved C stack.

MEM probes an enabled REU from 128 KiB through 16 MiB, including a compatible
emulated REU. The memory contents touched by the size test are restored. With no
REU it reports that none was detected. The shell does not allocate REU memory;
the reported capacity is installed capacity, not a free-space accounting system.

## EDIT

There are **24 rows × 40 columns** of editable text and one status row. An existing
SEQ file loads into that area. Oversized files are refused, not truncated.

The status bar shows `yy:xx`, two spaces, and the filename (or `Untitled`).
`RUN/STOP:quit` is right-aligned with one trailing space. All 16 filename
characters fit, with at least two spaces before the quit hint.

Move with the cursor keys. Typing overwrites. RETURN goes to the next row;
INS and DEL shift characters within the current row. HOME goes to the top left.
RUN/STOP asks whether to save in the status row, keeping the document visible.
The filename prompt (when needed) and overwrite confirmation also use that row.
While typing, only changed line/column digits are updated; the rest of the
status row stays untouched. `Saving . . .` appears before disk work begins and
returns after an overwrite is confirmed.
Saving or cancelling returns to the shell on a clear screen. Errors appear on
a cleared screen so their details remain visible.

Saving writes PETSCII text with carriage-return line endings. Trailing row spaces
and unused bottom rows are trimmed. Screen rows become actual file lines: keep each
batch command on one row. Text beyond column 40 wraps when opening a file.

To make a batch file, explicitly name it `SOMETHING.BAT` (at most 12 base characters).
Ordinary notes do not get `.BAT` appended automatically.

## RUN and batch files

`RUN NAME.BAT` loads up to 2 KiB of script into RAM, executes commands in order, and
returns to the prompt. `@` suppresses echo of that line; `@ECHO OFF` disables command
echo. No nested batches, variables, conditionals, or pipes. Command
errors normally leave the batch running; RUN/STOP ends it. A native program launch
or EXIT ends the shell and therefore the batch. Echo state persists afterward.

File output redirection is supported for CHKDSK, DIR, ECHO, HELP, MEM and TYPE,
both interactively and on individual batch lines. `DIR/B > FILES.TXT` creates a
SEQ file or replaces an existing SEQ file without confirmation; `>>` appends,
creating the file if absent. Drive numbers and letters work in destinations,
for example `TYPE NOTES > 9:BACKUP` or `DIR > B:FILES.TXT`. Names containing
spaces or a literal `>` must be quoted. Spaces around the operator are optional.
Only one destination is accepted; printer redirection and chaining are unsupported.

Generated output uses PETSCII with CR line endings, without screen wrapping or
pagination. Redirected TYPE preserves every source byte. Errors stay on screen.
Existing non-SEQ destinations and TYPE redirecting onto its own source are
rejected. RUN/STOP or a write failure may leave partial output; completed output
is closed before the next command. The original file is not retained on overwrite.
The destination is opened before command execution, so DIR may list its own output
file, and a command error can leave an empty or partial file.
The tested 1541 represents an unwritten SEQ file with a single CR byte.

To save and print a listing, run `DIR > FILES.TXT`, then `PRINT FILES.TXT LPT1`.
PRINT accepts `4:` or `LPT1` for device 4 and `5:` or `LPT2` for device 5.

`RUN DEMO` loads the PRG at its stored address and runs its BASIC program/stub.
Use this only for programs with a BASIC launch stub.

`RUN UTILITY /A 49152` ignores the PRG's stored load address, loads its data at
decimal 49152 ($C000), then jumps to 49152. It **does not relocate embedded machine
addresses**. The program must already be written to execute there. This is not a
general loader for every game/multiload/protected program.

## Scope of this first version

- Stock C64, standard KERNAL serial I/O; no fastloader or RAM expansion.
- Native C128/80-column mode is not implemented.
- LABEL, DIR's disk ID, VOL, CHKDSK, and DISKCOPY use the standard 1541 BAM layout.
- DISKCOPY formats the destination and copies all 683 sectors. It stops on
  reported errors; it is not a copy-protection detector or nibble copier.
- REL copying supports standard 1541 sources on the same or another drive,
  preserving record length and binary records while DOS builds new side sectors.
  PRINT expects a Commodore-compatible
  printer and sends the file's bytes without ASCII conversion or a spooler.
- Disk operations can take a long time. RUN/STOP is checked between operations,
  not during a drive's firmware command or a blocking KERNAL call.
- Overwriting scratches the old destination first. Failed writes can leave a
  partial destination. This deliberately remains a small hobby shell.
- Completion caches one directory (up to 144 entries); refresh with DIR after
  swapping a disk. DOS-style completion and screen messages are adaptations.
- BASIC passthrough and WIPEDISK are deliberately omitted.

## Build

The generated PRG, D64, linker map and labels are in `build/`. Source is in `src/`.
`MCS-DOS.txt` is the original discussion draft and is preserved unchanged; the
behavior described here incorporates the subsequent decisions.

The main project uses Oscar64 `-Os -Oo` following candidate testing and promotion.
See [OSCAR64.md](OSCAR64.md) for RAM comparisons, fixes and qualification.

Dependencies: Windows Oscar64, cc65's assemblers, VICE's `c1541`, and Node.js for generating PETSCII
example files. The project-local tool copies are in `tools/` and are ignored by Git.

```powershell
.\build.ps1
.\build.ps1 -Release  # No personal AUTOEXEC on the disk
.\build.ps1 -Compiler cc65  # Original compiler fallback
# Or supply existing installations:
.\build.ps1 -Cc65 C:\cc65 -Vice C:\VICE
```

The build uses RAM through $CFFF, with a reserved 2 KiB C
stack at $C800–$CFFF. BASIC ROM stays out while the shell runs; the loader restores the standard
ROM mapping before launching a program. The loader is copied to the cassette
buffer before loading over the shell.
The Oscar64 candidate leaves 7.75 KiB before the reserved stack, versus
356 bytes in this branch's cc65 baseline. See OSCAR64.md for exact measurements.
MEM uses the BSS end; Oscar64's aligned heap can start up to seven bytes later.
`VERSION` in `src/mcsdos.c` supplies the startup banner, VER, and generated example README.
The underscore uses sprite 0 and 64 bytes of cassette-buffer RAM; it is disabled
before execution leaves the input loop. `src/reu.s` contains the capacity probe.

`scripts/make-examples.js` converts readable examples and the root manual/license
documents to PETSCII and creates the tiny tokenized BASIC demo. The D64 includes
`MANUAL.TXT` and `LICENSE.TXT` as SEQ files, retaining their extensions; read them
with `TYPE MANUAL.TXT` and `TYPE LICENSE.TXT`. TYPE streams through a 256-byte
buffer and pauses after 22 display lines, so files need not fit in C64 RAM.
`scripts/monitor.js` is a local VICE test helper;
`tests/smoke.json` contains interactive test steps. See `TESTING.md` for results.

Disk I/O retains the standard KERNAL interface. Startup reuses its directory
snapshot unless saving preferences invalidates it; explicit DIR always reads
the disk. Cross-drive COPY retains source file metadata, EDIT saves through
the existing 256-byte buffer, and DISKCOPY keeps separate data channels open
on both drives until completion or cancellation.

Tool sources: [cc65](https://cc65.github.io/getting-started.html) and
[VICE](https://vice-emu.sourceforge.io/), and
[Oscar64](https://github.com/drmortalwombat/oscar64). Tools retain their own licenses;
the generated program links the selected compiler's runtime.

REBOOT resets settings, variables and command history, then runs AUTOEXEC.BAT
from the original startup drive.

### Command switches

`DEL filename /P` suppresses confirmation, including wildcard deletion and the
DELETE/ERASE aliases. The switch may precede the filename.

`MEM [/S]` and `CHKDSK [drive:] [/S]` display their full reports.
`/S` removes comma digit separators. Switches are case-insensitive.

## Additional disk commands

New commands (September 2026)

CHKDSK [drive:] [/S] [/V]
  /V  Checks and fixes errors on the disk.
Runs the native V0 validator before reading disk statistics. Reports
"Disk validation complete." on success, or "Disk validation failed" and
the native drive status on error. DOS does not supply repair counts.
Validation rebuilds allocation and removes unclosed files; it does not
recover scratched files. Use it on standard DOS disks, not custom formats.

ATTRIB [+R | -R] [[drive:]filename]
Displays or changes the native 1541 read-only (lock) attribute. With no
arguments, lists files with R for locked files. +R sets the lock; -R clears
it. A missing filename means all files. Wildcards * and ? are supported.
Requires a standard 1541 directory. The native lock protects against
scratching/replacement; it is not general protection against in-place writes.

CONCAT newfile file1 file2 [file3...]
Creates a new file from two or more files on the same disk using native C0.
Quote names containing spaces. All files must be on the destination disk;
unqualified source names use that disk. Existing destinations are refused.
The complete drive command may contain at most 40 characters; longer lists
report "File list too long". Native file-type restrictions and errors apply.

SPLASH
Shows the boot logo without the four-second pause, then returns to the
prompt with the shell font and colors restored.

UNDELETE deferred
Changing the deleted entry's type alone does not reserve its freed blocks.
They may already belong to another file. A recovery implementation needs
chain/overlap checks and allocation repair, including REL side sectors,
before it can safely expose a restored file. No UNDELETE command was added.
