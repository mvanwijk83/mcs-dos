# MCS-DOS

MCS-DOS is a MS-DOS-inspired operating environment designed to work on a
Commodore 64, Commodore 64 Ultimate, Commodore 128 in C64 mode, or on emulators.
No RAM expansions or CPU upgrades are needed. It provides familiar prompts,
commands and syntax to perform disk and file operations on a variety of supported
floppy disk drives and mass storage devices. You can also run programs and use
BASIC. Rudimentary batch scripting is also supported.

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
* Peripheral clocks, modification timestamps and country-specific date/time and number
  conventions; see [date/time support](DATE-TIME.md).
* Some batch file support.
* Supports 1541, 1541-II, 1570, 1571 and 1581, CMD HD/FD, SD2IEC and SoftIEC (Ultimate).
* Supports partitions, subdirectories, and disk images on relevant storage devices.
* Drives can be optionally displayed and addressed with DOS-style drive letters.
* [SUBST](SUBST.md) maps up to five unused drive letters or numbers to directories.
* Simple built-in text editor.
* Run programs and use BASIC, with return to the MCS-DOS shell (under some conditions).
* Quality of life features such as command history, file name auto-completion, and key bindings.
* Environment variables.
* Output redirection.
* File printing.
* Command help easily accessible from the shell (`/?` and `HELP`).
* Customizable shell including prompts, colors and custom character sets.

## Notable limitations and omissions

* No fastload or other disk access optimization routines are implemented; use KERNAL replacements such as JiffyDOS or DolphinDOS for improved speed.
* Native programs cannot always return to the MCS-DOS shell.
* Batch files do not support variables, conditionals, labels, or parameters.
* No piping (`|` syntax) or input redirection (`<`).
* Disk duplication is only supported between the same drive models.
* Due to the shell's mixed-case mode, half of PETSCII's graphics characters do not display correctly.
* No internationalization.
* No REU support.

Future versions may address (some of) these and other shortcomings where possible.

## More information

Refer to the full PDF manual for more information, or use `HELP` at the command prompt.
