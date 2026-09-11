
New commands (September 2026)

CHKDSK [drive:] [/S] [/V]
  /V  Checks and fixes errors on the disk.
Runs the native V0 validator before reading disk statistics. Reports
"Disk validation complete." on success, or "Disk validation failed" and
the native drive status on error. DOS does not supply repair counts.
Validation rebuilds allocation and removes unclosed files; it does not
recover scratched files. Use it on standard DOS disks, not custom formats.

ATTRIB [+R | -R] [[drive:]filename]
Displays or changes the native 1541 read-only (lock) attribute. With no
arguments, lists files with R for locked files. +R sets the lock; -R clears
it. A missing filename means all files. Wildcards * and ? are supported.
Requires a standard 1541 directory. The native lock protects against
scratching/replacement; it is not general protection against in-place writes.

CONCAT newfile file1 file2 [file3...]
Creates a new file from two or more files on the same disk using native C0.
Quote names containing spaces. All files must be on the destination disk;
unqualified source names use that disk. Existing destinations are refused.
The complete drive command may contain at most 40 characters; longer lists
report "File list too long". Native file-type restrictions and errors apply.

SPLASH
Shows the boot logo without the four-second pause, then returns to the
prompt with the shell font and colors restored.

UNDELETE deferred
Changing the deleted entry's type alone does not reserve its freed blocks.
They may already belong to another file. A recovery implementation needs
chain/overlap checks and allocation repair, including REL side sectors,
before it can safely expose a restored file. No UNDELETE command was added.

References:
- [Commodore 1541 User Manual](https://www.commodore.ca/wp-content/uploads/2018/11/commodore_vic_1541_floppy_drive_users_manual.pdf): VALIDATE and error-channel reporting.
- [Anatomy of the 1541](https://www.bitsavers.org/pdf/commodore/The_Anatomy_of_the_1541_Disk_Drive_Jun84.pdf): scratched entries require block reallocation; recovery assumes no subsequent writes.
