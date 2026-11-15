#include "core.h"
#include "tape.h"

/* Switch to the tape copier bank from resident RAM and jump to its entry without returning. */
static __noinline void handoff(void)
{
    __asm {
        sei
        lda #11
        sta 0xde00
        sta 0x07f5
        lda #7
        sta 0xde02
        lda #0x36
        sta 1
        jmp 0xa000
    }
}

#pragma code(boot_code)
#pragma data(boot_data)

/* The handoff never returns into the old shell. The copier owns a separate
 * compiler stack and returns through the cartridge's ordinary reload path.
 *
 * Check the tape reader ROM, save the session and hand control to the isolated tape copier. */
static void start(void)
{
    /* Unlike the public KERNAL jump table, the block reader is an internal
     * entry. Refuse ROMs that replace it instead of jumping into other code. */
    static const unsigned char reader[] = {0x20, 0x17, 0xf8, 0xb0, 0x1f,
                                           0x78, 0xa9, 0x00, 0x85, 0xaa};
    unsigned char i;
    for (i = 0; i < sizeof(reader); ++i)
        if (PEEK(0xf84a + i) != reader[i]) {
            error(SYSOUT_TAPE_KERNAL);
            return;
        }
    if (!session_save()) {
        error(SYSOUT_SHELL_SAVE_ERR);
        return;
    }
    /* Restoration reselects the shell working directories. Replay our target
     * on every transfer, after session I/O and before suspending the shell. */
    nav_invalidate();
    if (!location_file(TAPE_DEVICE, TAPE_DIRECTORY))
        return;
    /* Model probing may leave a binary M-R reply on a DOS channel. Close
     * the shell's channels before CLALL forgets them in the copier startup. */
    for (i = 0; i < 2; ++i) {
        if (cmddev[i])
            channel_close(14 + i);
        cmddev[i] = 0;
    }
    TAPE_COLORS[0] = PEEK(0x0286);
    TAPE_COLORS[1] = PEEK(0xd021);
    TAPE_COLORS[2] = PEEK(0xd020);
    TAPE_RESULT = 0;
    TAPE_PENDING = 0x54;
    caret_hide();
    handoff();
}

/* Validate TAPECOPY search and destination arguments, save the session and hand off to the
 * copier. */
__noinline void bank_tapecopycmd(void)
{
    unsigned char n;
    const char *destination = "", *search = "";
    if (argc > 3) {
        error(SYSOUT_SYNTAX_TAPECOPY);
        return;
    }
    if (argc == 3) {
        search = args[1];
        destination = args[2];
    } else if (argc == 2) {
        n = strlen(args[1]);
        if (strchr(args[1], ':') || strchr(args[1], 0x5c))
            destination = args[1];
        else
            search = args[1];
    }
    n = strlen(destination);
    if ((argc == 3 && !n) || strchr(search, ':')) {
        error(SYSOUT_SYNTAX_TAPECOPY);
        return;
    }
    if (strlen(search) > 16) {
        error(SYSOUT_FILE_NAME_TOO_LONG);
        return;
    }
    if (!path(destination, &p1))
        return;
    if (!path_directory(&p1)) {
        error(SYSOUT_DIRECTORY_NOT_FOUND);
        return;
    }
    if (!location_file(p1.dev, p1.dir))
        return;
    strcpy(TAPE_DIRECTORY, p1.dir);
    filename(search, TAPE_SEARCH);
    TAPE_DEVICE = p1.dev;
    if (strchr(destination, ':')) {
        n = strchr(destination, ':') - destination;
        if (n > 3) {
            error(SYSOUT_INVALID_DRIVE_SPEC);
            return;
        }
        memcpy(TAPE_LABEL, destination, n);
        TAPE_LABEL[n] = 0;
    } else
        strcpy(TAPE_LABEL, drivename(p1.dev));
    start();
}

/* Report the previous tape transfer result and optionally start another transfer. */
__noinline void bank_tapecopy_report(void)
{
    unsigned char result, c;
    if (TAPE_PENDING != 0x54)
        return;
    result = TAPE_RESULT;
    TAPE_PENDING = 0;
    switch (result) {
    case TAPE_SAVED:
        say(SYSOUT_TAPE_SAVED);
        outs(SYSOUT_TAPE_NEXT);
        outs(SYSOUT_TAPE_YES_NO);
        do {
            c = toupper(getch());
        } while (c != 'Y' && c != 'N' && c != CH_STOP);
        if (c != CH_STOP)
            outc(c);
        newline();
        if (c == 'Y') {
            TAPE_SEARCH[0] = 0;
            start();
        }
        break;
    case TAPE_CANCELLED:
        say(SYSOUT_TAPE_CANCELLED);
        break;
    case TAPE_TOO_LARGE:
        error(SYSOUT_TAPE_TOO_LARGE);
        break;
    case TAPE_WRITE_ERROR:
        error(SYSOUT_WRITE_FAULT_ERR);
        break;
    case TAPE_END:
        say(SYSOUT_TAPE_END);
        break;
    case TAPE_UNSUPPORTED:
        error(SYSOUT_TAPE_UNSUPPORTED);
        break;
    case TAPE_CLEANUP_ERROR:
        error(SYSOUT_TAPE_CLEANUP_ERROR);
        break;
    case TAPE_DISK_ERROR:
        error(SYSOUT_DRIVE_NOT_READY);
        break;
    default:
        error(SYSOUT_TAPE_READ_ERR);
        break;
    }
}
