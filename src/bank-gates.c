/* Resident entry points for banked services. Keep the signatures explicit:
 * Oscar64 allocates a shared call stack and registers for these direct calls.
 * Each returning gate restores the caller's mapping, including nested calls. */
#include "core.h"
__noinline void bank_tapecopycmd(void);
__noinline void bank_tapecopy_report(void);

/* Validate TAPECOPY search and destination arguments, save the session and hand off to the
 * copier.
 * Resident gate: restore the previous bank after the service returns. */
void tapecopycmd(void)
{
    unsigned char previous = bank_enter(BANK_BOOT);
    bank_tapecopycmd();
    bank_leave(previous);
}

/* Report the previous tape transfer result and optionally start another transfer.
 * Resident gate: restore the previous bank after the service returns. */
void tapecopy_report(void)
{
    unsigned char previous = bank_enter(BANK_BOOT);
    bank_tapecopy_report();
    bank_leave(previous);
}

__noinline unsigned char bank_session_save(void);
__noinline unsigned char bank_session_restore(void);
__noinline void bank_session_basic(void);
__noinline unsigned char bank_session_run(void);

/* Save the session and install the program return wedge; return zero if the user cancels.
 * Resident gate: restore the previous bank after the service returns. */
unsigned char session_run(void)
{
    unsigned char previous = bank_enter(BANK_FILEUTIL), result = bank_session_run();
    bank_leave(previous);
    return result;
}

/* Save shell state and font to flash; return nonzero only after a committed save.
 * Resident gate: restore the previous bank after the service returns. */
unsigned char session_save(void)
{
    unsigned char previous = bank_enter(BANK_FILEUTIL), result = bank_session_save();
    bank_leave(previous);
    return result;
}

/* Restore the exact saved session and display; return zero if the saved state is invalid.
 * Resident gate: restore the previous bank after the service returns. */
unsigned char session_restore(void)
{
    unsigned char previous = bank_enter(BANK_FILEUTIL), result = bank_session_restore();
    bank_leave(previous);
    return result;
}

/* Install the return wedge and leave the shell for BASIC; this handoff does not return. */
void session_basic(void)
{
    bank_enter(BANK_FILEUTIL);
    bank_session_basic();
}

/* Typed resident gates: one linked program shares stack/register allocation. */
__noinline void bank_editstatus(void);

/* Clear and select the reverse-video editor status line.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void editstatus(void)
{
    unsigned char previous = bank_enter(BANK_EDIT);
    bank_editstatus();
    bank_leave(previous);
}

__noinline void bank_editsaving(void);

/* Show the saving message in the editor status line.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void editsaving(void)
{
    unsigned char previous = bank_enter(BANK_EDIT);
    bank_editsaving();
    bank_leave(previous);
}

__noinline void bank_editcmd(void);

/* Run EDIT: load bounded text, handle editing keys, and save only after confirmation.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void editcmd(void)
{
    unsigned char previous = bank_enter(BANK_EDIT);
    bank_editcmd();
    bank_leave(previous);
}

__noinline unsigned char bank_typeoptions(unsigned char *mode, unsigned long *limit);

/* Validate TYPE arguments before any redirected destination is opened.
 * Resident gate: restore the previous bank after the service returns.
 *
 * mode: Output: 0=text, 1=head, 2=tail, 3=hex.
 * limit: Output line count for head/tail; return nonzero on success. */
__noinline unsigned char typeoptions(unsigned char *mode, unsigned long *limit)
{
    unsigned char previous = bank_enter(BANK_FILEUTIL), result = bank_typeoptions(mode, limit);
    bank_leave(previous);
    return result;
}

__noinline void bank_typecmd(unsigned char printer);

/* Stream TYPE output or PRINT data, handling line limits, wrapping and cleanup.
 * Resident gate: restore the previous bank after the service returns.
 *
 * printer: Nonzero selects PRINT and parses its printer destination. */
__noinline void typecmd(unsigned char printer)
{
    unsigned char previous = bank_enter(BANK_FILEUTIL);
    bank_typecmd(printer);
    bank_leave(previous);
}

__noinline unsigned char bank_findoptions(unsigned char *flags, char **needle);

/* Validate FIND arguments and set p1 to its source path before opening any output.
 * Resident gate: restore the previous bank after the service returns.
 *
 * flags: Output: /V=1, /C=2, /N=4, /I=8.
 * needle: Output pointer to the search text; return nonzero on success. */
__noinline unsigned char findoptions(unsigned char *flags, char **needle)
{
    unsigned char previous = bank_enter(BANK_FILEUTIL), result = bank_findoptions(flags, needle);
    bank_leave(previous);
    return result;
}

__noinline void bank_findcmd(void);

/* Search lines with a sliding window; a second reader reproduces selected lines without storing
 * them.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void findcmd(void)
{
    unsigned char previous = bank_enter(BANK_FILEUTIL);
    bank_findcmd();
    bank_leave(previous);
}

__noinline void bank_runcmd(void);

/* Validate RUN, then schedule a batch or save the shell and launch a native program.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void runcmd(void)
{
    unsigned char previous = bank_enter(BANK_FILEUTIL);
    bank_runcmd();
    bank_leave(previous);
}

__noinline void bank_help(int id);

/* Show one command help topic or an alphabetically sorted command overview.
 * Resident gate: restore the previous bank after the service returns.
 *
 * id: Command index; a negative value selects the overview. */
__noinline void help(int id)
{
    unsigned char previous = bank_enter(BANK_FILEUTIL);
    bank_help(id);
    bank_leave(previous);
}

__noinline void bank_dircmd(void);

/* Parse DIR options, build a bounded directory order, and print the selected listing.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void dircmd(void)
{
    unsigned char previous = bank_enter(BANK_FILEMGMT);
    bank_dircmd();
    bank_leave(previous);
}

__noinline void bank_copycmd(unsigned char moving);

/* Execute COPY or MOVE, including wildcard expansion and concatenation handling.
 * Resident gate: restore the previous bank after the service returns.
 *
 * moving: Nonzero selects MOVE; zero selects COPY. */
__noinline void copycmd(unsigned char moving)
{
    unsigned char previous = bank_enter(BANK_FILEMGMT);
    bank_copycmd(moving);
    bank_leave(previous);
}

__noinline void bank_delcmd(void);

/* Expand DEL wildcards and confirm the complete selection before deleting files.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void delcmd(void)
{
    unsigned char previous = bank_enter(BANK_FILEMGMT);
    bank_delcmd();
    bank_leave(previous);
}

__noinline void bank_attribcmd(void);

/* Read or change cartridge file attributes for the selected names.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void attribcmd(void)
{
    unsigned char previous = bank_enter(BANK_FILEMGMT);
    bank_attribcmd();
    bank_leave(previous);
}

__noinline void bank_renamecmd(void);

/* Validate two paths and rename within one device, checking the destination first.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void renamecmd(void)
{
    unsigned char previous = bank_enter(BANK_FILEMGMT);
    bank_renamecmd();
    bank_leave(previous);
}

__noinline unsigned char bank_blockio(unsigned char dev, unsigned char track, unsigned char sector,
                                      unsigned char writing);

/* Transfer one sector using the standard direct-access logical file 2.
 * Resident gate: restore the previous bank after the service returns.
 *
 * dev: Target disk device.
 * track: One-based track number.
 * sector: Zero-based sector number.
 * writing: Nonzero writes io; zero reads into io. Return nonzero on success. */
__noinline unsigned char blockio(unsigned char dev, unsigned char track, unsigned char sector,
                                 unsigned char writing)
{
    unsigned char previous = bank_enter(BANK_DISK);
    unsigned char result = bank_blockio(dev, track, sector, writing);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_rawopen(unsigned char dev);

/* Open the standard direct-access buffer on logical file 2.
 * Resident gate: restore the previous bank after the service returns.
 *
 * dev: Disk device; return nonzero on success. */
__noinline unsigned char rawopen(unsigned char dev)
{
    unsigned char previous = bank_enter(BANK_DISK);
    unsigned char result = bank_rawopen(dev);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_drivetype(unsigned char dev, unsigned char report);

/* Return a supported geometry family, or the precise model when requested.
 * Resident gate: restore the previous bank after the service returns.
 *
 * dev: Disk device.
 * report: 0=quiet, 1=report errors, 128=return precise model instead of geometry. */
__noinline unsigned char drivetype(unsigned char dev, unsigned char report)
{
    unsigned char previous = bank_enter(BANK_DISK);
    unsigned char result = bank_drivetype(dev, report);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_tracksectors(unsigned char track, unsigned char tracks);

/* Return the sector count for a track in the detected disk geometry.
 * Resident gate: restore the previous bank after the service returns.
 *
 * track: One-based track number.
 * tracks: Total tracks: 35, 70 or 80. */
__noinline unsigned char tracksectors(unsigned char track, unsigned char tracks)
{
    unsigned char previous = bank_enter(BANK_DISK);
    unsigned char result = bank_tracksectors(track, tracks);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_bam(unsigned char dev);

/* Read and validate the disk header into io, updating shared geometry and label offsets.
 * Resident gate: restore the previous bank after the service returns.
 *
 * dev: Disk device; return nonzero for a supported readable format. */
__noinline unsigned char bam(unsigned char dev)
{
    unsigned char previous = bank_enter(BANK_DISK);
    unsigned char result = bank_bam(dev);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_copyrel(void);

/* Copy a REL file record by record from p1 to p2, letting DOS create destination side sectors.
 * Resident gate: restore the previous bank after the service returns. */
__noinline unsigned char copyrel(void)
{
    unsigned char previous = bank_enter(BANK_DISK);
    unsigned char result = bank_copyrel();
    bank_leave(previous);
    return result;
}

__noinline void bank_volcmd(unsigned char stats);

/* Display volume information, optionally including CHKDSK allocation checks.
 * Resident gate: restore the previous bank after the service returns.
 *
 * stats: Nonzero selects CHKDSK; zero selects VOL. */
__noinline void volcmd(unsigned char stats)
{
    unsigned char previous = bank_enter(BANK_DISK);
    bank_volcmd(stats);
    bank_leave(previous);
}

__noinline void bank_labelcmd(void);

/* Validate LABEL and update the volume name in the disk header.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void labelcmd(void)
{
    unsigned char previous = bank_enter(BANK_DISK);
    bank_labelcmd();
    bank_leave(previous);
}

__noinline void bank_formatcmd(void);

/* Validate FORMAT, confirm with the user, and format the selected disk.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void formatcmd(void)
{
    unsigned char previous = bank_enter(BANK_DISK);
    bank_formatcmd();
    bank_leave(previous);
}

__noinline void bank_diskinitcmd(void);

/* Execute DISKINIT to initialize a disk through its command channel.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void diskinitcmd(void)
{
    unsigned char previous = bank_enter(BANK_DISK);
    bank_diskinitcmd();
    bank_leave(previous);
}

__noinline void bank_diskidcmd(void);

/* Read or change the two-byte disk ID after validating the disk header.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void diskidcmd(void)
{
    unsigned char previous = bank_enter(BANK_DISK);
    bank_diskidcmd();
    bank_leave(previous);
}

__noinline void bank_diskcopycmd(void);

/* Copy compatible disk geometries sector by sector, with optional verification.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void diskcopycmd(void)
{
    unsigned char previous = bank_enter(BANK_DISK);
    bank_diskcopycmd();
    bank_leave(previous);
}

__noinline void bank_startupprompt(void);

/* Apply the stored PROMPT value after startup batch processing finishes.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void startupprompt(void)
{
    unsigned char previous = bank_enter(BANK_BOOT);
    bank_startupprompt();
    bank_leave(previous);
}

__noinline void bank_startupcolor(void);

/* Validate all COLOR components before changing display colors and existing text.
 * Resident gate: restore the previous bank after the service returns. */
__noinline void startupcolor(void)
{
    unsigned char previous = bank_enter(BANK_BOOT);
    bank_startupcolor();
    bank_leave(previous);
}

__noinline void bank_startupcharset(unsigned char device);

/* Validate and stage a .CPI font before replacing the active RAM charset.
 * Resident gate: restore the previous bank after the service returns.
 *
 * device: Startup device from which to load the configured charset. */
__noinline void startupcharset(unsigned char device)
{
    unsigned char previous = bank_enter(BANK_BOOT);
    bank_startupcharset(device);
    bank_leave(previous);
}

__noinline void bank_bootsplash(unsigned char wait);

/* Display the startup logo and manage the temporary screen and NMI state.
 * Resident gate: restore the previous bank after the service returns.
 *
 * wait: 0=interactive splash, 1=timed startup, 4=SYSINFO without the splash. */
__noinline void bootsplash(unsigned char wait)
{
    unsigned char previous = bank_enter(BANK_BOOT);
    bank_bootsplash(wait);
    bank_leave(previous);
}

__noinline unsigned char bank_input(char *buf, unsigned int max, unsigned char recall);

/* Read an editable command line with completion and optional history; return zero on
 * cancellation.
 * Resident gate: restore the previous bank after the service returns.
 *
 * buf: Destination buffer, including space for a terminator.
 * max: Total buffer capacity.
 * recall: Nonzero enables command history and raw filename tracking. */
__noinline unsigned char input(char *buf, unsigned int max, unsigned char recall)
{
    unsigned char previous = bank_enter(BANK_EDIT);
    unsigned char result = bank_input(buf, max, recall);
    bank_leave(previous);
    return result;
}

__noinline void bank_rawedit(unsigned char pos, unsigned char len, unsigned char deleting);

/* Shift exact-byte flags to follow inserted or deleted command characters.
 * Resident gate: restore the previous bank after the service returns.
 *
 * pos: Edit position in the command line.
 * len: Command length before the edit.
 * deleting: Nonzero deletes a flag; zero inserts a clear flag. */
__noinline void rawedit(unsigned char pos, unsigned char len, unsigned char deleting)
{
    unsigned char previous = bank_enter(BANK_EDIT);
    bank_rawedit(pos, len, deleting);
    bank_leave(previous);
}

__noinline void bank_setcmd(const char *s);

/* List, validate, replace or remove a packed environment variable.
 * Resident gate: restore the previous bank after the service returns.
 *
 * s: Unparsed text following SET; an empty string lists all variables. */
__noinline void setcmd(const char *s)
{
    unsigned char previous = bank_enter(BANK_BOOT);
    bank_setcmd(s);
    bank_leave(previous);
}

__noinline unsigned char bank_bootstart(unsigned char startdrive);

/* Reset shell state, mount cartridge storage and search configured devices for AUTOEXEC.
 * Resident gate: restore the previous bank after the service returns.
 *
 * startdrive: Initial device; return the device selected for startup. */
__noinline unsigned char bootstart(unsigned char startdrive)
{
    unsigned char previous = bank_enter(BANK_BOOT);
    unsigned char result = bank_bootstart(startdrive);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_directory(unsigned char dev);

/* Replace the shared directory cache; publish it only after a complete successful read.
 * Resident gate: restore the previous bank after the service returns.
 *
 * dev: Device to enumerate; return nonzero on success. */
__noinline unsigned char directory(unsigned char dev)
{
    unsigned char previous = bank_enter(BANK_FILEMGMT);
    unsigned char result = bank_directory(dev);
    bank_leave(previous);
    return result;
}

__noinline int bank_findfile(const Path *p);

/* Find an exact cached filename, refreshing the directory when needed.
 * Resident gate: restore the previous bank after the service returns.
 *
 * p: File path; return its index, -1 if absent, or -2 if directory reading fails. */
__noinline int findfile(const Path *p)
{
    unsigned char previous = bank_enter(BANK_FILEMGMT);
    int result = bank_findfile(p);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_preparewrite(const Path *p);

/* Validate a destination and ask before replacement; disks scratch the old file first.
 * Resident gate: restore the previous bank after the service returns.
 *
 * p: Exact destination path; return nonzero when writing may proceed. */
__noinline unsigned char preparewrite(const Path *p)
{
    unsigned char previous = bank_enter(BANK_FILEMGMT);
    unsigned char result = bank_preparewrite(p);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_openreadtype(const Path *p, unsigned char lfn, unsigned char type);

/* Open a file using already-known metadata and clear its per-channel EOF state.
 * Resident gate: restore the previous bank after the service returns.
 *
 * p: Source path.
 * lfn: Logical file number to open.
 * type: Supported CBM_T_SEQ, CBM_T_PRG or CBM_T_USR type; return nonzero on success. */
__noinline unsigned char openreadtype(const Path *p, unsigned char lfn, unsigned char type)
{
    unsigned char previous = bank_enter(BANK_FILEMGMT);
    unsigned char result = bank_openreadtype(p, lfn, type);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_openread(const Path *p, unsigned char lfn);

/* Look up the file type and open a read channel; return nonzero on success.
 * Resident gate: restore the previous bank after the service returns.
 *
 * p: Source path.
 * lfn: Logical file number to open. */
__noinline unsigned char openread(const Path *p, unsigned char lfn)
{
    unsigned char previous = bank_enter(BANK_FILEMGMT);
    unsigned char result = bank_openread(p, lfn);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_openwrite(const Path *p, unsigned char type);

/* Open the destination on logical file 3; replacement must already be approved.
 * Resident gate: restore the previous bank after the service returns.
 *
 * p: Destination path.
 * type: Commodore file type; return nonzero on success. */
__noinline unsigned char openwrite(const Path *p, unsigned char type)
{
    unsigned char previous = bank_enter(BANK_FILEMGMT);
    unsigned char result = bank_openwrite(p, type);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_scratch(const Path *p);

/* Delete the specified native filename through its device command interface.
 * Resident gate: restore the previous bank after the service returns.
 *
 * p: Path to scratch; return nonzero on success. */
__noinline unsigned char scratch(const Path *p)
{
    unsigned char previous = bank_enter(BANK_FILEMGMT);
    unsigned char result = bank_scratch(p);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_diroption(const char *s, unsigned char *flags);

/* Apply one DIR switch to the accumulated flags; return zero for an invalid switch.
 * Resident gate: restore the previous bank after the service returns.
 *
 * s: Terminated switch beginning with a slash.
 * flags: Input/output listing and sort flags. */
__noinline unsigned char diroption(const char *s, unsigned char *flags)
{
    unsigned char previous = bank_enter(BANK_FILEMGMT);
    unsigned char result = bank_diroption(s, flags);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_dirdefaults(const char *s, unsigned char *flags);

/* Parse the DIRCMD switch string into listing flags; return zero for invalid input.
 * Resident gate: restore the previous bank after the service returns.
 *
 * s: Terminated defaults, with optional spaces between switches.
 * flags: Input/output listing and sort flags. */
__noinline unsigned char dirdefaults(const char *s, unsigned char *flags)
{
    unsigned char previous = bank_enter(BANK_FILEMGMT);
    unsigned char result = bank_dirdefaults(s, flags);
    bank_leave(previous);
    return result;
}
