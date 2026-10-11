# MCS-DOS

MCS-DOS is a MS-DOS-inspired operating environment designed to work on a
Commodore 64, Commodore 64 Ultimate, Commodore 128 in C64 mode, or on emulators.
No RAM expansions or CPU upgrades are needed. It provides familiar prompts,
commands and syntax to perform disk and file operations. You can run programs
just as you would on a stock setup, and the BASIC environment is always just one
command away. Rudimentary batch scripting is also supported.

MCS-DOS is *not* a straight MS-DOS clone or emulator, nor does it attempt to
implement the full MS-DOS feature set (regardless of what version). Instead, it
implements a usable subset and adds features of its own, allowing you to use
your C64 in a similar, command-line driven manner that works for the platform.

The author makes no claims as to its real-life usefulness and emphasizes that
this was made for fun and novelty.

## Features

* Classic DOS look and feel.
* Many familiar disk commands and utilities are implemented.
* Configuration via `AUTOEXEC.BAT` and `CONFIG.SYS`.
* Some batch file support.
* Supports 1541, 1541-II, 1570, 1571 and 1581 drives.
* Drives can be optionally displayed and addressed with DOS-style drive letters.
* Simple built-in text editor.
* Ability to run native programs from the MCS-DOS environment and use BASIC, with return to shell (under some conditions).
* Quality of life features such as command history and file name auto-completion.
* Environment variables.
* Output redirection to files.
* File printing.
* Command help easily accessible from the shell (`/?` and `HELP`).
* Customizations including prompts, colors and custom character sets.

## Notable limitations and omissions

* No subdirectory support.
* No fastload or other disk access optimization routines are implemented.
* No dedicated support for SD2IEC, IDE64, Ultimate storage, etc.
* Batch files do not support variables, conditionals, labels, or parameters.
* No piping (`|` syntax) or output redirection.
* Disk duplication is only supported between the same drive models.
* Due to the shell's mixed-case mode, half of PETSCII's graphics characters do not display correctly.

Future versions may address (some of) these and other shortcomings where possible.

## More information

Refer to the bundled `MANUAL.TXT`, or the more extensive PDF manual.
