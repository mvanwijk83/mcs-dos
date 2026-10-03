# MCS-DOS

MCS-DOS is a MS-DOS-inspired command shell designed to work on a Commodore 64,
Commodore 64 Ultimate, Commodore 128 in C64 mode, and emulators. It provides
familiar commands, syntax, and prompts to perform disk operations. It also
supports rudimentary batch scripting.

While MCS-DOS can be used as an alternate operating environment for your
C64, it is not a full operating system *per se*; it does not control the
machine at a low level, but utilizes the Commodore 64 KERNAL to control system
functions.

The author makes no claims as to its real-life usefulness and emphasizes that
this was made for fun and novelty.

## Features

* Classic DOS look and feel.
* Many familiar disk commands and utilities are implemented.
* Configuration via `AUTOEXEC.BAT` and `CONFIG.SYS`.
* Some batch file support.
* Supports multiple attached drives and multiple models (1541, 1571, 1581).
* Drives can be optionally displayed and addressed with DOS-style drive letters.
* Simple built-in text editor.
* Quality of life features such as command history and file name auto-completion.
* Environment variables.
* Output redirection to files.
* File printing.
* Command help easily accessible from the shell (`/?` and `HELP`).
* Customizations including prompts, colors and custom character sets.

## Notable limitations and omissions

* No subdirectory support. This ia a limitation of the CBM-DOS file system.
* No support for hard disks, SD2IEC, Ultimate storage, etc.
* Automatic return from native programs depends on their exit implementation (if any) and whether they don't overwrite the MCS-DOS return hook.
* No fastload or other disk access optimization implemented.
* Batch files do not support variables, conditionals, labels, or parameters.
* No piping (`|` syntax) or output redirection.
* Duplicating disks between different drive types is not currently implemented.
* Due to the shell's mixed-case mode, half of PETSCII's graphics characters do not display correctly.

Future versions may address (some of) these and other shortcomings where possible.

## Toolchain

MCS-DOS was written in C and compiled with Oscar64 on Windows 11. The automated
test suites and build scripts are Node.js. Extensive machine help was enlisted
from OpenAI's Codex and GPT-6 (Astra) and GPT-6.1 (Sol) LLMs for implementation
help, review, automated testing and building. Human testing was done on a C64
Ultimate and in VICE.

## Running the shell

MCS-DOS 2.0 is distributed as an EasyFlash 3 cartridge image. If you have a
physical EasyFlash cartridge, start MCS-DOS from the menu. The `MCS-DOS.CRT`
image must have been flashed onto the cartridge first. In VICE, use File ->
Attach cartridge image. On an Ultimate, enter the file browser and run the
`.CRT`.

`CONFIG.SYS` and `AUTOEXEC.BAT` will be processed if they are present. Type
`HELP` for a list of available commands, and `HELP <command>` or `<command> /?`
for more detailed information. Programs can be run with `RUN <filename>`,
while `BASIC` enters C64 BASIC (type `SHELL` to return to the MCS-DOS prompt).

Refer to `MANUAL.TXT` for more extensive information.

## Repository layout
`disk-content/` &ndash; Content included on the release images.  
`extras/` &ndash; Extra content made available to customize your MCS-DOS shell.  
`releases/` &ndash; Archive of public MCS-DOS releases, ready to use on your C64 or emulator.  
`screenshots/` &ndash; Assorted screenshots.  
`scripts/` &ndash; Build scripts.  
`src/` &ndash; Source code.  
`tests/` &ndash; Automated tests.  

The root contains various documentation, including the bundled manual and
changelog, and instructions to build from source (`build.md`).

## Version history
See `CHANGELOG.TXT` for a full overview of changes.

* **2.0** (03-Oct-2026) &ndash; EF3 cartridge release; many improvements and refinements, and some new commands and options.
* **1.01** (19-Sep-2026) &ndash; minor additions and improvements
* **1.0 RTM** (15-Sep-2026) &ndash; definitive first public release
* **1.0 Preview** (13-Sep-2026) &ndash; preliminary limited public release
