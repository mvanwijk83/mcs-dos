# MCS-DOS

MCS-DOS is a simple MS-DOS-inspired command shell designed to work on an
unexpanded Commodore 64, Commodore 64 Ultimate, Commodore 128 in C64 mode, and
on emulators. It provides familiar prompts, commands, syntax and system messages
to perform disk operations, as well as some unique capabilities. It also
implements rudimentary batch scripting. It is otherwise **not** a true execution
environment for native programs.

The author makes no claims as to its real-life usefulness and points out that
this was mostly made for fun and novelty.

## Features

* Classic DOS look and feel
* Many familiar disk commands and utilities are implemented
* Some batch file support, including `AUTOEXEC.BAT`
* Support for multiple drives
* Drives can be displayed and addressed with DOS-style drive letters
* Simple built-in text editor
* Command history of up to 10 entries
* File name auto-completion
* Environment variables
* Output redirection to files
* File printing
* Command help easily accessible from the shell
* Customizations including prompts, colors and custom character sets

## Notable limitations and omissions
* No directory support
* Running native C64 programs quits the shell
* Batch files do not support variables, conditionals, labels, or parameters
* No piping, limited command redirection support
* No `CONFIG.SYS`
* Screen is limited to 40 characters width

## Development notes

MCS-DOS was written in C and compiled with CC65. Extensive machine help was
enlisted from OpenAI's Codex and GPT-6 (Astra) LLM. Human testing has mostly
been done on a C64 Ultimate, while the extensive automated test suite uses VICE.

## Running the shell

MCS-DOS is distributed as a D64 disk image. Write it to floppy, or just mount
and run if your setup allows it. Run the main shell program simply called
`MCS-DOS`, although `LOAD "*",8` will also work.

Refer to `MANUAL.TXT` for more extensive information.