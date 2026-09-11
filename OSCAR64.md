# Oscar64 migration branch — 2026-09-11

The parent folder had no Git repository. This isolated checkout snapshots its
current source at baseline commit `85deaad`, then branches as `oscar64-migration`.
The parent project's sources and release artifacts are unchanged. The local
`tools` junction shares the parent's installed tools; no compiler libraries were edited.

## RAM result

Both compilers use memory through $CFFF and retain the complete 2048-byte stack
reservation at $C800–$CFFF. Environment, history, editor, resident messages,
external help, and other feature buffers retain their baseline sizes.

| Compiler options | PRG bytes in comparison | Available RAM | RAM recovered vs cc65 |
| --- | ---: | ---: | ---: |
| cc65 `-O` | 39,669 | 356 | — |
| Oscar64 `-Os` | 33,811 | 6,208 | 5,852 |
| Oscar64 `-O2` | 35,072 | 5,008 | 4,652 |
| Oscar64 `-Os -Oo` | 32,080–32,082 | **7,936** | **7,580** |

Compilation layout can differ by a few
bytes between invocations. Its aligned free region is also $A900–$C7FF: **7936
bytes (7.75 KiB)**. The comparison measures the aligned heap start, not the PRG
length. MEM uses BSSEnd and can include up to seven bytes of alignment padding.
This free region is breathing room for future linked code/data, not a newly
added dynamic allocation feature. Fixed charset/screen memory is unchanged.

`-Os` optimizes for size; resident code savings also free RAM on this machine.
`-Oo` outlines repeated instruction sequences and saves substantially more here.
`-O2` emphasizes speed and uses more RAM. A trial of `-O3` was stopped after
several minutes without output; it is not qualified. There is no basis to assume
the highest numbered speed setting is best for RAM.

## Build

The installed compiler is Oscar64 1.32.273, from the
[official release](https://github.com/drmortalwombat/oscar64/releases/tag/v1.32.273).
The branch defaults to native code with `-Os -Oo -psci`.

```powershell
.\build.ps1 -Release                         # Oscar64 candidate, no AUTOEXEC
.\build.ps1                                  # Personal development AUTOEXEC
.\build.ps1 -Optimization Os                 # Without outliner
.\build.ps1 -Compiler cc65 -Release           # Baseline compiler fallback
.\build-oscar64.ps1                          # RAM comparison; preserves packaged build
.\build-oscar64.ps1 -IncludeO3               # Optional trial; 120-second timeout per mode
```

`build/MCS-DOS.prg`, `build/MCS-DOS.d64`, and SHA256SUMS.txt are the deliverables.
Map and VICE labels come from the selected compiler; older cc65-symbol-specific
test scripts need adaptation before use with Oscar64. Comparison artifacts and
`memory.json` live under `build/oscar64`. All generated build files are ignored.
cc65's ca65/ld65 are still required to assemble the existing launch trampoline.

## Port fixes

- Added the missing `strpbrk` compatibility function used by newer commands.
- Generate absolute include paths. Relative paths in this nested checkout could
  accidentally select the parent project's old adapter, silently ignoring fixes.
- Rewrote case-insensitive comparisons to fold each character once. This fixes
  reproduced optimized command-dispatch failures such as DIR returning no output.
  This is an observed compiler/adapter interaction, not a proven upstream diagnosis.
- Fixed binary writes: KERNAL CHROUT returns the character, not a success flag.
  Treating a zero byte as failure silently truncated raw-sector writes and broke
  ATTRIB updates. The adapter now checks KERNAL status after output.
- Return through main and the normal CRT epilogue on EXIT. Oscar64's exit(0)
  skipped restoration of BASIC's temporary-string pointer at $16. Repeated
  charset/EXIT/reload tests reproduced failure before this change and pass after it.

The existing local no-optimization workaround for decimal conversion remains.
Assembly translations retain their existing no-assembly-optimization setting.
The editor warning about potentially uninitialized `n` remains: its overflow
condition short-circuits the read. No blanket disabling of C optimization was added.

## Validation

VICE 3.10 tests use owned emulator processes and disposable disks. Relevant
commands (run after a release build) are:

```powershell
node tests/oscar64-regression.js build/MCS-DOS.prg
node tests/new-commands.js
node tests/help-prompt.js
node tests/charset.js
node tests/charset.js --names-only
node tests/charset.js --assets-only --ntsc
node tests/help-prompt.js --ntsc
node tests/redirection.js
```

The harnesses now avoid delayed monitor-prompt races. Help's synthetic fixture
finds PROMPT by command ID instead of assuming it remains the last topic.
Redirection tests follow the relocated screen and explicitly set their prompt.

Passing checks include command dispatch and detailed help; environment values;
editor creation/save and overwrite refusal; REBOOT; EXIT followed by BASIC
expressions/programs and PRG launch; CONCAT, ATTRIB and CHKDSK validation;
SPLASH state restoration; prompt initialization and paginated help boundaries;
relocated screen/font memory and repeated charset startup/EXIT; and byte-exact
binary redirection on one/two drives, cancellation, disk-full handling and recovery.
The four bundled YAFF font sets also pass byte-level glyph/reverse/graphics and
EXIT-restoration checks under NTSC. The help/prompt suite passes under both PAL
and NTSC, including synthetic read-boundary/pagination cases.

The migration is an emulator-tested development candidate. Physical C64/Ultimate,
REU hardware, full-disk DISKCOPY and REL-copy qualification remain separate work;
compilation alone does not establish correctness for those paths or for -O2/-O3.
