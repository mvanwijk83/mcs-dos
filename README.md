# MCS-DOS

MCS-DOS is a simple MS-DOS-inspired command shell designed to work on an
unexpanded Commodore 64, Commodore 64 Ultimate, Commodore 128 in C64 mode, and
on emulators. It provides familiar commands, syntax, and prompts to perform
disk operations. It also supports rudimentary batch scripting. It is otherwise
*not* a true execution environment for native programs.

The author makes no claims as to its real-life usefulness and emphasizes that
this was made for fun and novelty.

## Features

* Classic DOS look and feel.
* Many familiar disk commands and utilities are implemented.
* Some batch file support, including `AUTOEXEC.BAT`.
* Supports multiple attached drives and multiple models (1541, 1571, 1581).
* Drives can be optionally displayed and addressed with DOS-style drive letters.
* Simple built-in text editor.
* Command history of up to 10 entries.
* File name auto-completion.
* Environment variables.
* Output redirection to files.
* File printing.
* Command help easily accessible from the shell (`/?` and `HELP`).
* Customizations including prompts, colors and custom character sets.

## Notable limitations and omissions

* No directory support.
* Running native C64 programs quits the shell.
* No fastloader implemented in software; use a fastload cartridge or ROM replacement to speed up disk access.
* Batch files do not support variables, conditionals, labels, or parameters.
* No piping (`|` syntax); output redirection does not support printers.
* Duplicating disks between different drive types is not currently implemented.
* Due to the shell's mixed-case mode, half of PETSCII's graphics characters do not display correctly.

Future versions may address (some of) these and other shortcomings where possible.

## Development notes

MCS-DOS was written in C and compiled with Oscar64. Extensive machine help was
enlisted from OpenAI's Codex and GPT-6 (Astra) LLM. Testing was done on a C64
Ultimate and in VICE.

## Running the shell

MCS-DOS is distributed as a D64 disk image. Write it to floppy, and load the
main program called `MCS-DOS.EXE`. `LOAD "*",8` will work too. `RUN` to start. Or
if your setup allows it, simply mount and run the disk image.

Refer to `MANUAL.TXT` for more extensive information.

## Repository layout
Source code is available on https://github.com/mvanwijk83/mcs-dos.

`disk-content` &ndash; Content to include on the release images.  
`extras` &ndash; Extra content to customize your MCS-DOS shell.  
`releases` &ndash; Archive of public MCS-DOS releases, ready to use on your C64 or emulator.  
`screenshots` &ndash; Assorted screenshots.  
`src` &ndash; Source code.  
`tests` &ndash; Automated tests.  

The root contains various documentation. Aside from this `README.md`, they are
also included on the release image (hence the 40 character width).

## Version history
See `CHANGELOG.TXT` for a full overview of changes.

* **1.0 Preview** (13-Sep-2026) - preliminary limited public release
* **1.0 RTM** (15-Sep-2026) - definitive first public release
