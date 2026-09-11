# Oscar64 compilation experiment — 2026-09-08

The 2026-09-11 current-source size comparison is recorded in
`build/optimization-20260911/ASSESSMENT.md`. With the 512-byte environment,
O0 fits again; O1/O2/Os offer 2382/4395/5413 bytes of static RAM savings versus
the current cc65 -O build. These new builds are not runtime-qualified. The
older measurements and runtime findings below remain historical evidence.

Oscar64 produces smaller PRGs, but the optimized experimental port has runtime
failures. Keep cc65 as the release compiler for now.

## Reproduce

The official [Oscar64 v1.32.273 Windows ZIP](https://github.com/drmortalwombat/oscar64/releases/tag/v1.32.273)
is extracted at `tools/oscar64/oscar64`. Its SHA-256 is
`a68d255ab63f6aac12acd234689f6f4e4e5ebe6a04cae06a69072c9792d08ac8`, matching
the release asset digest. No system installation is needed.

```powershell
.\build-oscar64.ps1
# Optional compiler locations:
.\build-oscar64.ps1 -Oscar64 C:\oscar64 -Cc65 C:\cc65
```

This builds a fresh cc65 baseline with the exact flags from `build.ps1`, then
four native-code Oscar64 variants from the same shell source. All outputs,
maps, assembly listings, diagnostics, hashes, and `sizes.json` are under
`build/oscar64/`. The release PRG, D64, and normal build script are unchanged.
The comparison script does not launch VICE or automatically validate behavior.

The charset display routines are translated from src/charset.s by the adapter.
Screen writes follow $0288, including the optional screen beneath KERNAL ROM.
The unused dynamic heap reservation is zero; the 2048-byte stack is retained.
With generalized charset filenames, the unoptimized O0 variant exceeds the
available RAM; build-oscar64.ps1 stops at its stack-placement error. O1, O2
and Os still compile when invoked separately on the generated source. This
does not qualify their runtime behavior or resolve the port's existing failures.

## Sizes

PRG file sizes include the two-byte load address and BASIC startup stub. No
compression, bytecode, feature removal, or disk-image padding is involved.
The baseline compiler is cc65 V2.19, Git e11fb5c.

| Build | PRG bytes | Bytes saved | Reduction |
| --- | ---: | ---: | ---: |
| cc65 `-O` (current setup) | 31,960 | — | — |
| Oscar64 `-O0` | 30,586 | 1,374 | 4.30% |
| Oscar64 `-O1` | 28,744 | 3,216 | 10.06% |
| Oscar64 `-O2` | 27,720 | 4,240 | 13.27% |
| Oscar64 `-Os` | 27,233 | 4,727 | 14.79% |

These compare complete compiler/runtime ports, not isolated code generators:
the disk and console implementations differ, and the Oscar64 adapter supplies
a smaller formatter supporting the shell's actual format strings.

## Port details

An unmodified Oscar64 compile fails: it lacks cc65's `cbm.h`, `peekpoke.h`,
directory API, several conio names, `stricmp`, and bounded printf functions.

`scripts/prepare-oscar64.js` generates a translation unit from the authoritative
release source without editing it. `src/oscar64/compat.h` implements the used
interfaces: KERNAL I/O, BASIC-directory parsing, direct screen output, PETSCII
input, case-insensitive comparison, and bounded `%s`/`%u`/`%c` formatting with
field widths. It is deliberately an experiment, not a general cc65 library.

Both builds use RAM through `$CFFF` and reserve the upper 2 KiB for compiler
stack storage. Oscar64's stack includes both its dynamic and static call-frame
areas. The port selects `$36` memory mapping and restores `$37` on exit.
Oscar64 linker symbols provide the MEM/CHKDSK workspace figures.

The loader is assembled from the original cassette-buffer trampoline with
ca65/ld65 and embedded as bytes; this experiment therefore still needs those
assemblers. The REU probe is mechanically translated from `src/reu.s`, with
its A/X return value adapted to Oscar64. Neither routine is stubbed out.

The decimal conversion function is compiled with optimization disabled in all
variants: the initial optimized build displayed blank numeric strings, while
the unoptimized function restored them. This is an observed workaround, not a
confirmed upstream compiler diagnosis. Oscar64 also warns about the editor's
`n` potentially being uninitialized; that existing loop initializes it before
use unless overflow short-circuits the subsequent check.

## Runtime findings

Tests used VICE 3.10 and disposable copies of the release disk. No physical
hardware testing was performed.

- `-O0`: `tests/editor-save.js` passes, including save/reload, last-row contents,
  declining overwrite, cancellation, and invalid filename errors.
  `tests/update.js` also passes. HELP/palette and the clean EXIT screen pass,
  but the subsequent BASIC `PRINT 2+2` check in `tests/help.js` fails (the command
  remains on screen without its result). This build is not release-qualified.
- `-O1`: HELP, palette, EXIT and subsequent BASIC expressions/program execution
  passed `tests/help.js`. `tests/update.js` passed directory sorting/layout,
  totals, color controls, and cursor position/blinking. Initial editor saving
  and reloading passed, but declining overwrite produced DOS error 63 because
  a write-open was still attempted; this was reproduced in the final build.
  MEM reported plausible allocation and no
  REU on an unexpanded emulated C64.
- `-Os`: the general HELP command printed `/7` instead of its help listing,
  even after fixing decimal formatting. Do not use this build as a release.
- `-O2`: compiled successfully; not qualified for use. Early testing encountered
  incorrect display output before the final memory-mapping correction.

The `-O0` final MEM screen reports 39,243 bytes for shell/workspace, 2,048 for
the reserved stack area, and 9,908 free. The cc65 map ends static workspace at
`$A61F` (exclusive), versus Oscar64 `-O0` at `$A14C`. The compiler does not emit
zero-filled BSS into the PRG, so file size and runtime allocation are different.

The initial `-O1` HELP/EXIT test preceded the final `$36` mapping change; those
passes do not establish BASIC-return correctness for the final port. The final
`-O0` failure reinforces the need to validate the exit ABI before migration.

To repeat interactive tests, launch VICE with a remote monitor on port 6510,
mount a **disposable** copy of the release D64, and use the monitor to load the
chosen experimental PRG directly. Set `$BA` to 8 before `RUN`, select a scheme,
and decline preference saving. Run the existing Node test scripts from the
project root at a shell prompt. The editor suite expects `UI-NOTES` not to
exist initially; use a fresh disk copy. The HELP suite ends in BASIC.

Optimized failures may involve compiler optimization or assumptions in the
adapter; no minimized upstream reproducer has been established. Full REL copy,
DISKCOPY, printer, nonzero REU preservation, and hardware checks remain outside
this experiment. A compiler migration needs those checks and resolution of the
optimized failures before replacing the existing build.
