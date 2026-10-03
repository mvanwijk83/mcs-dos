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

The code is compiled with Oscar64 flags `-n -Os -Oo -psci`. The build script
will emit an EasyFlash cartridge image at `build/easyflash/MCS-DOS.crt`. Aside
from executable code and the command help library, the image includes
documentation text files, sample config files, and an alternate character set
(CGA.CPI).

## C source style

C sources use K&R braces, four spaces and a 100-column code limit, configured
in `.clang-format`. With `clang-format` on PATH, apply or check the style with:

```powershell
node scripts/format-c.js
node scripts/format-c.js --check
```

Set `CLANG_FORMAT` to the executable path if it is installed elsewhere.

If contributing, use comments liberally. Document each function's purpose,
parameters and return.

## Automated tests

Build the cartridge, then run the simulator tests and a short cartridge check:

```powershell
node tests/run.js unit
node tests/run.js smoke
```

`node tests/run.js --list` shows available test suites. Run individual tests or
feature groups as required, or `node tests/run.js all` to run them all. Tests
will leave disposable images in `build/` and launch their own VICE processes.
The latter are normally closed automatically but may occasionally remain under
unexpected circumstances.

See the machine-generated [tests/README.md](tests/README.md) for prerequisites,
coverage groups, diagnostics and guidance for adding tests.
