# Future ideas — assessment only

Neither a replacement charset nor MCSD is implemented in version 0.8.

## Memory budget (version 0.8)

The old $A000 allocation ceiling was a project choice, and version 0.7 had only
63 bytes spare below its reserved stack. Version 0.8 now uses cc65's standard
C64 range through $CFFF, adding 12,288 bytes of capacity on an unexpanded C64.
BASIC ROM is already disabled by the runtime; KERNAL and I/O remain available.
See the [cc65 C64 memory layout](https://cc65.github.io/doc/c64.html#ss3).

Current map:

| Use | Address range | Bytes |
| --- | --- | ---: |
| Code and static workspace | $0801–$986E | 36,974 |
| Available before the reserved stack | $986F–$C7FF | 12,177 |
| Reserved C stack | $C800–$CFFF | 2,048 |

This gives room for roughly one-third more code/static data than the current
build. It is finite; feature costs depend on their implementation. For sustained
growth, larger tools can become disk-loaded modules sharing a resident shell,
and mutually exclusive tools can reuse buffers. Loading modules introduces disk
latency but avoids requiring all command code to stay in RAM at once.

RAM beneath I/O and KERNAL offers another storage option requiring controlled
bank switching. cc65's `c64-ram` driver exposes 47 pages (12,032 bytes); these are
not ordinary always-visible C allocations. REU storage is another optional path
for machines that provide it, with transfers needed to use that data from the
CPU. Neither banked storage, module loading, nor REU allocation is implemented.

## PC-style font

An IBM CGA-style 8×8 bitmap font fits C64 character cells pixel-for-pixel. MDA's
9×14 and EGA's taller 8×14 text fonts do not; those would require redrawing or
resampling. IBM's own comparison lists these cell sizes:
[IBM PC Information Exchange, July 1985](https://bitsavers.computerhistory.org/pdf/ibm/pc/IBM_PC_Information_Exchange/G320-0843-0_198507.pdf).

Proposal: change letter, digit, and selected punctuation bitmaps while retaining
the Commodore screen-code/PETSCII mapping and graphics symbols. Update inverse
letter bitmaps too so RVS remains consistent. This changes appearance, not the
encoding of filenames or text files. A full CP437 replacement would instead lose
Commodore graphics, and is not proposed.

A 256-character 8×8 set uses 2 KiB. VIC-II renders it at normal character-mode
speed, so it would not slow typing or scrolling. The main task is reserving an
aligned, VIC-visible RAM region. The current layout has about 11.9 KiB spare,
but placing a charset still needs an explicit VIC bank and screen/code layout
plan rather than simply adding a 2 KiB array. This is feasible on a stock C64. The display
would remain 40×25, and monitor aspect ratio still affects its perceived shape.

## MCSD

A paginated diagnostic screen would suit the project. The main constraint is
what the hardware can identify, rather than processing speed.

| Information | Feasibility |
| --- | --- |
| Machine/mode | C64-compatible environment; detect known variants such as C128 in C64 mode where supported |
| Video | PAL/NTSC timing, text dimensions, current colors and font |
| Memory | Installed base RAM, shell allocation, REU capacity; reuse MEM |
| ROMs | BASIC/KERNAL fingerprints matched against known versions; unknown ROMs stay unknown |
| Drives | Responding IEC addresses, readable volumes, IDs, files, free and allocated blocks/bytes |
| Drive model | Best effort using known firmware identifiers; an ordinary success status does not identify a model |
| Printers | A responding IEC device at a printer address; not necessarily its model, paper state, or readiness to print |
| Joysticks | Live direction/fire test; an idle passive joystick cannot reliably be distinguished from no joystick |
| Mouse/paddles | Interactive movement/button/POT-value test with device-specific interpretation |
| Modem | Optional test using a selected interface/baud rate; some compatible modems answer AT, but no universal detection |
| Ultimate hardware | Optional use of an enabled Ultimate Command Interface to query supported hardware and virtual-drive information |

The joystick ports share CIA lines with the keyboard and use switch/POT inputs;
they do not provide a general device enumeration facility.
[Commodore Programmer's Reference Guide: Game Ports](https://www.devili.iki.fi/Computers/Commodore/C64/Programmers_Reference/Chapter_6/page_343.html).
Commodore's [1351 manual](https://www.vincenzoscarpa.it/biblioteca/manuali/eng/c64/Commodore64-1351-Mouse-Users-Guide.pdf)
documents its POT and button signaling.

Known machine/video detection helpers already exist in
[cc65](https://cc65.github.io/doc/funcref.html). Ultimate's optional
[control interface](https://1541u-documentation.readthedocs.io/en/latest/uci/control_target.html)
can provide information beyond what generic IEC probing exposes, including
emulated drive type, IEC address, and power state. Availability depends on the
device/firmware and whether the interface is enabled.

Suggested first scope: System, Memory, and Disks pages, plus a separate interactive
Ports Test. Use “not responding” and “unknown” rather than claiming a peripheral
is absent. Scan disks on request because directory access is slow. Start with the
1541 layouts already supported; other drive geometries need their own handling.
Exact SID revisions and other chip identities would be best-effort extensions,
not definitive hardware inventory.
