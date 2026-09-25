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

int main(void)
{
    unsigned char overflow, startdrive, startup;
    unsigned int n;

    /* Keep KERNAL available and read PETSCII without library translation. */
    POKE(1, 0x36);
    BANK_CURRENT = BANK_NONE;
    giocharmap = IOCHM_TRANSPARENT;
    textcursor(false);
    POKE(207, 0);
    startdrive = 0;
    bootsplash(1);
restart:
    startdrive = bootstart(startdrive);
    startup = 1;
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
                say("Batch command too long");
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
    basic_exit();
    return 0;
}
#include "../build/oscar64/hardware.h"
