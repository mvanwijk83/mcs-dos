#include "core.h"
#define MCS_DEFINE_LAYOUT
#include "memory.h"
#include "bank-layout.h"
#pragma compile("core.c")
#pragma compile("banking.c")
#pragma compile("bank-gates.c")
#pragma compile("edit.c")
#pragma compile("fileutil.c")
#pragma compile("filemgmt.c")
#pragma compile("disk.c")
#pragma compile("boot.c")
#pragma compile("session.c")
#pragma compile("tape.c")

/* Initialize the shell, then alternate between batch commands and interactive input until exit. */
int main(void)
{
    unsigned char overflow, startdrive, startup, tape_resume;
    unsigned int n;

    /* Keep KERNAL available and read PETSCII without library translation. */
    POKE(1, 0x36);
    BANK_CURRENT = BANK_NONE;
    giocharmap = IOCHM_TRANSPARENT;
    textcursor(false);
    POKE(207, 0);
    startdrive = 0;
    tape_resume = RESUME[0] == 0x54 && TAPE_PENDING == 0x54;
    resume_requested = RESUME[0] == 0xa5 || tape_resume;
    RESUME[0] = 0;
    /* Native programs can overwrite spare descriptor bytes. Only the tape
     * bridge's distinct resume request may consume a tape result. */
    if (!tape_resume)
        TAPE_PENDING = 0;
    if (!resume_requested)
        bootsplash(1);
restart:
    startdrive = bootstart(startdrive);
    startup = 1;
    if (resume_requested) {
        if (!session_restore()) {
            bootstart(0);
            envready = 1;
            say(SYSOUT_SHELL_RESTORE_FAILED);
        }
        startup = 0;
        resume_requested = 0;
        if (tape_resume)
            tapecopy_report();
    }
again:
    while (!quit) {
        if (startup && !batching) {
            startup = 0;
            envready = 1;
            startupcharset(startdrive);
            startupprompt();
            startupcolor();
        }
        if (batching) {
            memset(rawline, 0, sizeof(rawline));
            if (stop() || batchpos >= batchlen) {
                batching = 0;
                newline();
                continue;
            }
            n = overflow = 0;
            while (batchpos < batchlen && batch[batchpos] != 13 && batch[batchpos] != 10) {
                if (n < LINE - 1)
                    line[n++] = batch[batchpos];
                else
                    overflow = 1;
                ++batchpos;
            }
            if (batchpos < batchlen && batch[batchpos++] == 13 && batch[batchpos] == 10)
                ++batchpos;
            line[n] = 0;
            if (overflow) {
                say(SYSOUT_BATCH_CMD_TOO_LONG);
                batching = 0;
                continue;
            }
            if (echoon && line[0] != '@') {
                showprompt();
                say(line);
            }
        } else {
            showprompt();
            if (!input(line, LINE, 1))
                continue;
            if (line[0]) {
                strcpy(history[histnext], line);
                memcpy(rawhistory[histnext], rawline, RAWMAP);
                histnext = (histnext + 1) % 10;
                if (histcount < 10)
                    ++histcount;
            }
        }
        execute(line);
        /* Unwind the old batch before restarting startup processing. */
        if (reboot)
            goto restart;
        if (aborted)
            batching = 0;
        if (!batching && !quit)
            newline();
    }
    if (session_save() || yesno(SYSOUT_SHELL_SAVE_WARNING_BASIC))
        session_basic();
    quit = 0;
    goto again;
}

#include "../build/oscar64/hardware.h"
