# Tests for the cartridge release

The suites target the current EasyFlash cartridge. They do not need a 1.x
standalone program, distribution disk, npm packages, or an existing VICE session.
Use the toolchain described in [build.md](../build.md).

## Getting started

Configure Node.js, Oscar64 and VICE, then build the cartridge:

```powershell
$env:OSCAR64_HOME = "C:\path\to\oscar64"
$env:VICE_HOME = "C:\path\to\vice"
node scripts/build.js
node tests/run.js unit
node tests/run.js smoke
```

The home directories contain `bin`. Executables can alternatively be on `PATH`.
Hardware tests also read VICE's bundled `C64` and `DRIVES` ROM directories. These
are found beside `bin`, or under `VICE_DATA_HOME` for a separate data installation.
`VICE_CHARGEN` can select a character ROM explicitly. Use stock ROMs when running
the standard acceptance suites.

No build is needed for `unit`; most tests compile temporary C fixtures from
production function bodies and execute them in Oscar64's 6502 simulator. `image`
needs a build but no emulator. The other groups need the tools indicated below.

## Selecting coverage

```powershell
node tests/run.js --list
node tests/run.js shell --list
node tests/run.js shell storage session hardware
node tests/run.js input-history journal
node tests/run.js all
```

Select one or more group names or individual suite names. Repeated and overlapping
selections run once. With no selection the runner uses `unit`. `--list` shows the
selected suite names and entry points without running them; `--help` prints usage.

| Group | Coverage | Tools beyond Node.js |
| --- | --- | --- |
| `unit` | Parsing, formatting, limits, directory ordering, search, editor lines, startup settings, CRC | Oscar64 |
| `image` | Linked banks, RAM accounting, journal format and bundled resource bytes | None; built cartridge required |
| `shell` | Commands, input/history, completion, public startup sample, editor, wildcard copy, disk FIND, help and cartridge workflow | VICE |
| `storage` | Journal recovery/compaction, large program loading and binary redirection | VICE |
| `session` | BASIC handoff, shell restoration, program return and save faults | VICE |
| `hardware` | Formatting/screen support, stock ROM probes, machine/drive reports, startup display and fonts | Oscar64 and VICE |
| `drives` | D64/D71/D81 copies, large directories, REL records, formatting and incompatible media | VICE |
| `tape` | Real KERNAL pulse decoding, PRG/SEQ transfer, search, cancellation and failed-transfer cleanup | VICE |
| `smoke` | Image, command, BASIC session and PAL machine checks | VICE |
| `all` | Every suite above, including drives and tape | Oscar64 and VICE |

Drive formatting/copying and tape pulse decoding can take several minutes per
suite. Use named suites or feature groups while developing; run `all` for complete
release coverage. The runner does not silently skip slow tests or retry failures.

## Fixtures, diagnostics and contributing

Tests start and close their own VICE processes in console mode, with sound disabled.
No interactive emulator window is needed; screen memory and monitor-driven
screenshots remain available. They use local
monitor connections and generated disks, tapes and writable cartridge copies
under `build/`. The distribution `build/easyflash/MCS-DOS.crt` is never modified.
Run one test runner at a time: some scenarios deliberately reuse scratch paths.
Logs, screen snapshots and generated C fixtures remain under `build/` for diagnosis.
An unsuccessful suite produces a nonzero exit status; invalid selections and
missing prerequisites produce status 2.

`suites.js` is the executable manifest. Files in `scenarios/` are callbacks supplied
with an owned cartridge session, rather than standalone commands. `shell.js` owns
the common interactive disk/cartridge session. `simulator.js`, `source.js`,
`vice-harness.js`, `monitor.js` and the image readers provide shared test support.

The cartridge scenario session exposes these operations:

| Operation/value | Meaning |
| --- | --- |
| `command(text)` | Send a VICE monitor command, such as attaching a disk or reading a register |
| `memory(first, last)` | Read the inclusive address range into a byte array |
| `screen()` | Decode the C64 screen into readable text |
| `keys(text, wait)` | Inject VICE key-buffer text, including escaped control keys |
| `enter(text)` | Submit a shell command and wait for its prompt |
| `check(text, expected)` | Clear the screen, run a command, and assert its expected message |
| `root`, `disk`, `crt` | Absolute workspace and owned scratch-image paths |
| `defaultFont(patch)` | Compare the complete character set and VIC mapping, optionally with a CPI patch |

Keep behavior assertions independent: check actual file bytes, record types,
ordering, state restoration and failure recovery. `output.js` reads message text
from the public headers so editorial changes do not invalidate an otherwise
correct test. Exact bytes remain intentional for on-disk formats, PETSCII fixtures,
hardware signatures and serialized sessions. The session format's fixed size is
a compatibility contract, not the shell's current executable size.

When adding a regression, prefer the relevant scenario or unit fixture and add a
named manifest entry only when it needs a separate boot or distinct environment.
Emulation does not replace testing flash writes, reset and image saving on hardware.

JavaScript formatting is configured in `.clang-format` within this directory;
it uses four spaces and a 100-column limit. Embedded C fixtures follow the root
K&R configuration, with explanatory comments around mocks and boundary cases.
Formatting is optional for running tests.
