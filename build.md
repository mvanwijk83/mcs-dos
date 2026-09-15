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

Source is compiled with Oscar64 flags `-n Os -Oo -psci`. It also produces
the D64 image, containing all additional included files such as
`COMMANDS.HLP` (generated from `src/command-help.json`); the bundled
documentation converted to PETSCII; and additional content included in
`disk-content/`.

Build output is placed under `build/`.

## Automated tests

There are three groups to be run sequentially. The tests create disposable files
and disk images in `build` that are used by automatically spawned VICE instances
(beware that they may not always close properly, so manually kill any stray
processes afterwards).

`node tests/run.js all` runs all three groups. The runner prints a pass/fail
summary, continues to report failures in subsequent suites, and returns a
nonzero exit status if any suite fails.

The automated suites test emulation and mocked I/O, not physical drive timing,
real printer behavior, or every cartridge/ROM combination. They are not intended
to replace emulator or real hardware testing.

### Fast simulator tests

Validates various functionalities with Oscar64's build-in emulator (`-e`):

```powershell
node tests/run.js unit
```

### Regression tests

Run them all together:

```powershell
node scripts/build.js
node tests/run.js emulator
```

Or run any of these individually (examples):

```
node tests/find.js
node tests/oscar64-regression.js
node tests/oscar64-regression.js build/MCS-DOS.prg --launch-only
node tests/editor-session.js --ntsc
node tests/charset.js --ntsc
node tests/bootsplash.js --ntsc
```

### Extended drive tests

Testing the supported disk drive models:

```
node tests/run.js drives
```

Or, individually: 

```
node tests/drive-compat.js 1581 --large
node tests/drive-compat.js 1571 --rel
node tests/drive-compat.js 1581 --mismatch
```