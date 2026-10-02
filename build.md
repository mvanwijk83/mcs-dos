# Build instructions

The build process is automated and machine-generated. I have attempted to
summarize the steps to build MCS-DOS from source as accurately as possible,
without getting into needless detail.

Windows is assumed, as that is the environment I'm working with. I do not
have sufficient expertise with developing on Linux and macOS, so I have not
added instructions for these. Shoot me a pull request if you can help amend
this document.

## Tools

The toolchain consists of the following:

| Tool | Version used | Download |
| --- | --- | --- |
| Node.js | 24.19.0 | [Node.js downloads](https://nodejs.org/en/download) |
| Oscar64 | 1.32.273.0 | [Oscar64 releases](https://github.com/drmortalwombat/oscar64/releases) |
| VICE | GTK3VICE 3.10, Windows x64 | [VICE downloads](https://vice-emu.sourceforge.io/#download) |

The versions listed are the ones used to produce the builds made available
through this repository. I have not attemped to verify the minimum required
versions.

## Getting the source and configuring your environment

Get the latest source code with Git:

```powershell
git clone https://github.com/mvanwijk83/mcs-dos.git
```

If you don't already have them, install the tools wherever you find convenient.

Set the following environment variables to point to the respective tool
installation folders, one level above `bin`. Alternatively, add the tools'
`bin` directories to `PATH`.

```powershell
$env:OSCAR64_HOME = "..."
$env:VICE_HOME = "..."

node --version
& "$env:OSCAR64_HOME/bin/oscar64.exe" -v
```

## Build

Run from the project root:

```powershell
node scripts/build.js
```

The 2.0 branch builds an EasyFlash cartridge at
`build/easyflash/MCS-DOS.crt`. The shell payload PRG is an intermediate file
and cannot be used as a standalone distribution. Oscar64 uses `-n -Os -Oo -psci`.
Command modules execute from five ROMH banks at $A000; shared services and
state stay resident. See [EASYFLASH.md](EASYFLASH.md) for the module layout,
bank-call rules and RAM accounting. The build compares the PRG/CRT links and
rejects mismatched code or overflowing banks.
The build packages CGA.CPI, AUTOEXEC.SAMPLE and the three PETSCII documents
as writable files, and command help as indexed internal cartridge data.
It also emits linker maps, a bank/storage
summary in `layout.json`, and `SHA256SUMS.txt` in the same output directory.
No external assembler is needed: the vendor EasyAPI binary is included.

See [EASYFLASH.md](EASYFLASH.md) for the bank layout, filesystem format,
CONFIG.SYS behavior, capacity and persistence limitations.

## C source style

C sources use K&R braces, four spaces and a 100-column code limit, configured
in `.clang-format`. With `clang-format` on PATH, apply or check the style with:

```powershell
node scripts/format-c.js
node scripts/format-c.js --check
```

Set `CLANG_FORMAT` to the executable path if it is installed elsewhere. The
wrapper preserves Oscar64 assembly blocks, whose syntax a C formatter cannot
interpret. It formats the maintained C files and headers under `src`; build
outputs are generated separately.

Document each function's purpose, parameters and return convention beside its
definition. In function bodies, explain buffer ownership, validation order,
hardware assumptions and recovery decisions where they are not obvious from
the statements. Keep short routines readable without narrating every line.

## Automated tests

Run the simulator tests and the cartridge integration test after building:

```powershell
node tests/run.js unit
node tests/easyflash.js
node tests/easyflash.js --ntsc
node tests/easyflash.js --journal
```

The cartridge suite starts its own VICE instance and uses disposable copies
under `build/easyflash`. It checks file operations, disk transfers, startup
configuration and persistence. It does not modify the distribution CRT.
`node tests/run.js all` runs unit and EasyFlash suites sequentially.

The legacy `emulator` and `drives` groups are retained as migration references;
they still assume the 1.x disk/standalone PRG distribution and are not the 2.0
cartridge acceptance suite. Emulator checks do not replace testing flash writes,
reset and image saving on real hardware or Ultimate.
