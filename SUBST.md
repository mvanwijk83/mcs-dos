# SUBST

`SUBST D: A:\GAMES` makes `D:\` refer to `A:\GAMES` in shell commands.
Numeric drive IDs use the same slots as letters. `SUBST` lists assignments in
the current `MODE DRV IDS` display mode; `SUBST D: /D` removes one. Switch away
from a virtual drive before removing its assignment. At most five assignments
can exist; a sixth reports `Too many substitutions`.

Targets must be existing directories. Relative targets are resolved once when
created. Targets through another SUBST are flattened to a physical device and
absolute path, so removing that other assignment has no effect. Cartridge `0:`
may be a target but cannot be substituted itself. Virtual drives have independent
current directories, and `..` stops at the virtual root. Assignments survive
program and BASIC launches and shell re-entry; REBOOT clears them. Native C64
programs do not receive shell path substitution.

The resident resolver publishes physical `Path.dev` and `Path.dir` for all I/O,
identity comparisons, mount protection and redirection. `Path.logical` retains
the original drive for prompts, CD and listings. Each three-byte assignment
stores its virtual device, physical target and target-prefix length. The target
prefix occupies the existing virtual drive's `working` buffer, followed by its
current-directory suffix. Five records require 15 persistent bytes, without
allocating additional path buffers. Expanded paths retain the shell's existing
path-length limit. Session format 9 saves the records before the font data.

Each referenced virtual device is physically probed once per command before
resolution. A responding physical device removes the assignment, resets its
remembered directory to root and invalidates navigation caches. The triggering
command continues normally on the physical device. The command retains its
resolved locations until completion. SYSINFO also retires conflicts while
enumerating physical devices; virtual drives are never added to that scan.

CHKDSK, DISKCOPY (either operand), DISKINIT, FORMAT, LABEL/DISKID, and MOUNT/UNMOUNT
destinations reject substituted drives. Image source files may be accessed
through SUBST. VOL reports the underlying volume with the logical drive ID.
Removing or renaming the virtual root through its alias is rejected. Missing
targets retain their assignments and report access failures; recovery never
escapes to the underlying physical root.

`tests/subst.js` runs production resolver/handler code in the 6502 simulator.
`tests/subst-session.js` covers real shell commands, physical takeover and
1581 subdirectories in VICE. BASIC and program-return suites compare saved
assignment bytes and working paths across shell re-entry.
