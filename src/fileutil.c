#include "core.h"
#pragma code(fileutil_code)
#pragma data(fileutil_data)
__noinline void bank_typecmd(unsigned char printer);
__noinline int bank_findbyte(unsigned char reader, unsigned int *pos, unsigned int *len);
__noinline void bank_findcmd(void);
__noinline void bank_runcmd(void);
__noinline unsigned char bank_diskhelp(unsigned char topic);
__noinline void bank_help(int id);

__noinline void bank_typecmd(unsigned char printer)
{
    int n, i;
    unsigned char lastcr = 0, wrapped = 0;
    if (printer) {
        if (argc < 2 || argc > 3) {
            error("Syntax: PRINT filename [4:|5:|LPT1|LPT2]");
            return;
        }
        printer = 4;
        if (argc == 3) {
            if (!strcmp(args[2], "5:") || !stricmp(args[2], "LPT2"))
                printer = 5;
            else if (strcmp(args[2], "4:") && stricmp(args[2], "LPT1")) {
                error("Invalid printer (4:, 5:, LPT1, LPT2)");
                return;
            }
        }
    } else if (argc != 2) {
        error("Syntax: TYPE filename");
        return;
    }
    if (!path(args[1], &p1))
        return;
    if (!openread(&p1, 2))
        return;
    if (printer && channel_open(4, printer, 7, "") != 0) {
        channel_close(2);
        channel_close(4);
        error("Printer not ready");
        return;
    }
    pagelines = 0;
    while ((n = readio(2, io, sizeof(io))) > 0 && !aborted) {
        if (printer) {
            if (channel_write(4, io, n) != n) {
                error("Write fault error");
                break;
            }
            stop();
        } else if (redirected) {
            for (i = 0; i < n; ++i)
                outputbyte(io[i]);
            stop();
        } else
            for (i = 0; i < n; ++i) {
                if (io[i] == 10 && lastcr) {
                    lastcr = 0;
                    continue;
                }
                lastcr = io[i] == 13;
                /* A full display row already advanced to the next line. Consume
                 * its terminator once, preserving subsequent empty lines. Keep
                 * this state across disk reads and pagination pauses. */
                if (io[i] == 13 || io[i] == 10) {
                    if (wrapped) {
                        wrapped = 0;
                        continue;
                    }
                }
                outc(io[i]);
                wrapped = io[i] != 13 && io[i] != 10 && !ox;
                if (!ox && !page())
                    break;
            }
    }
    channel_close(2);
    if (printer)
        channel_close(4);
    if (!redirected && ox)
        newline();
    if (n < 0)
        error("Read fault error");
}

/* Reuse EDIT's idle buffer for two disk cursors and a sliding search window.
 * The second cursor preserves full lines without imposing a line-size limit. */
__noinline int bank_findbyte(unsigned char reader, unsigned int *pos, unsigned int *len)
{
    int n;
    if (pos[reader] == len[reader]) {
        n = readio(reader + 2, editbuf + reader * 256, 256);
        if (n <= 0)
            return n < 0 ? -2 : -1;
        pos[reader] = 0;
        len[reader] = n;
    }
    return (unsigned char)editbuf[reader * 256 + pos[reader]++];
}

__noinline void bank_findcmd(void)
{
    unsigned char i, flags = 0, size, used = 0, hit, lastcr = 0, pending = 0, skip = 0, selected,
                     col;
    unsigned int pos[2], len[2];
    unsigned long number = 0, total = 0, digits;
    int c = -1, d;
    char *needle = 0, *filename = 0, *window = editbuf + 512;
    char shown[17];
    for (i = 1; i < argc; ++i) {
        if (!argquoted[i] && args[i][0] == '/') {
            if (!stricmp(args[i], "/V"))
                flags |= 1;
            else if (!stricmp(args[i], "/C"))
                flags |= 2;
            else if (!stricmp(args[i], "/N"))
                flags |= 4;
            else if (!stricmp(args[i], "/I"))
                flags |= 8;
            else {
                error("Invalid switch");
                return;
            }
        } else if (!needle && argquoted[i])
            needle = args[i];
        else if (needle && !filename)
            filename = args[i];
        else {
            error("Syntax: FIND [switches] \"string\" filename");
            return;
        }
    }
    if (!needle || !filename) {
        error("Syntax: FIND [switches] \"string\" filename");
        return;
    }
    if (!path(filename, &p1))
        return;
    if (!p1.name[0] || strpbrk(p1.name, "*?")) {
        error("Invalid file name");
        return;
    }
    if (!openread(&p1, 2))
        return;
    /* The same specification, but a distinct secondary address/cursor. */
    if (!(flags & 2)) {
        if (channel_open(3, p1.dev, 3, diskcmd) != 0 || diskstatus(p1.dev, 1) >= 20) {
            channel_close(2);
            channel_close(3);
            error("File not found");
            return;
        }
        eof[3] = 0;
    }
    memset(pos, 0, sizeof(pos));
    memset(len, 0, sizeof(len));
    size = strlen(needle);
    hit = !size;
    noseparators = 1;
    uppername(p1.name, shown);
    print("---- %s", shown);
    if (!(flags & 2))
        newline();
    pagelines = 1;
    while (!aborted) {
        c = bank_findbyte(0, pos, len);
        if (c == -2)
            break;
        if (c == 10 && lastcr) {
            lastcr = 0;
            continue;
        }
        lastcr = c == 13;
        if (c < 0 || c == 13 || c == 10) {
            if (c < 0 && !pending)
                break;
            ++number;
            selected = (hit != 0) ^ ((flags & 1) != 0);
            if (selected)
                ++total;
            if (!(flags & 2)) {
                col = 0;
                if (selected && (flags & 4)) {
                    print("[%s]", decimal(number));
                    col = 2;
                    digits = number;
                    do {
                        ++col;
                        digits /= 10;
                    } while (digits);
                }
                do {
                    d = bank_findbyte(1, pos, len);
                    if (d == 10 && skip) {
                        skip = 0;
                        continue;
                    }
                    skip = 0;
                    if (d < 0 || d == 13 || d == 10)
                        break;
                    if (selected && (!(flags & 4) || col < 40)) {
                        outc(d);
                        if (col < 40)
                            ++col;
                        if (!ox && !page())
                            break;
                    }
                } while (!aborted);
                skip = d == 13;
                if (d == -2) {
                    c = -2;
                    break;
                }
                if (selected && !aborted && (!col || ox)) {
                    newline();
                    if (!page())
                        break;
                }
            }
            pending = used = 0;
            hit = !size;
            if (c < 0)
                break;
        } else {
            pending = 1;
            if (!hit) {
                if (used == size) {
                    --used;
                    memmove(window, window + 1, used);
                }
                window[used++] = c;
                window[used] = 0;
                if (used == size &&
                    ((flags & 8) ? !stricmp(window, needle) : !strcmp(window, needle)))
                    hit = 1;
            }
        }
        if (stop())
            break;
    }
    channel_close(2);
    if (!(flags & 2))
        channel_close(3);
    if (c == -2)
        error("Read fault error");
    else if ((flags & 2) && !aborted)
        print(": %s\n", decimal(total));
}

__noinline void bank_runcmd(void)
{
    char *end;
    unsigned long address;
    unsigned char n;
    if (argc != 2 && argc != 4) {
        error("Syntax: RUN file [/A address]");
        return;
    }
    if (!path(args[1], &p1))
        return;
    n = strlen(p1.name);
    if (n >= 4 && !stricmp(p1.name + n - 4, ".BAT")) {
        if (argc != 2) {
            error("Invalid switch for batch file");
            return;
        }
        runbatch();
        return;
    }
    launchabsolute = 0;
    if (argc == 4) {
        if (stricmp(args[2], "/A")) {
            error("Invalid switch");
            return;
        }
        address = strtoul(args[3], &end, 10);
        if (!args[3][0] || *end || address < 2049 || address > 65535UL) {
            error("Invalid load address");
            return;
        }
        launchabsolute = 1;
        launchaddress = address;
    }
    cachevalid = 0;
    if (findfile(&p1) < 0) {
        error("File not found");
        return;
    }
    strcpy(launchname, p1.name);
    launchlength = n;
    launchdevice = p1.dev;
    say("Loading...");
/* Swapping a disk with an open output file would write to the wrong disk. */
    if(!launchdevice) { if(!cart_launch(launchname,launchabsolute,launchaddress)) error("Cannot load cartridge program"); return; }
    launch();
}

/* COMMANDS.HLP v1: MCH, version, topic count, then NUL-ended PETSCII texts.
 * Command help lives on cartridge device 0.
 * Reuse io so help does not reserve another permanent buffer. */
__noinline unsigned char bank_diskhelp(unsigned char topic)
{
    unsigned char current, c, wrapped, device = 0;
    unsigned int i;
    int n;
retry:
    current = 0;
    wrapped = 0;
    pagelines = 0;
    eof[2] = 0;
    POKE(144, 0); /* Do not carry a failed open's KERNAL status into a retry. */
    if (channel_open(2, device, 2, "commands.hlp,s,r"))
        goto failed;
    if (diskstatus(device, 0) >= 20)
        goto failed;
    if (readio(2, io, 5) != 5 || io[0] != 77 || io[1] != 67 || io[2] != 72 || io[3] != 1 ||
        io[4] != sizeof(commands) / sizeof(commands[0]))
        goto failed;
    while (!aborted && (n = readio(2, io, sizeof(io))) > 0) {
        for (i = 0; i < n; ++i) {
            c = io[i];
            if (current == topic) {
                if (!c) {
                    channel_close(2);
                    newline();
                    return 1;
                }
                /* A full-width row already advanced to the next line. */
                if (!redirected && wrapped && (c == 10 || c == 13)) {
                    wrapped = 0;
                    continue;
                }
                outc(c);
                wrapped = !redirected && c != 10 && c != 13 && !ox;
                /* Count displayed rows, including wrapping and blank lines.
                 * Keep redirected bank_help byte-exact and free of page prompts. */
                if (!redirected && !ox && !page()) {
                    channel_close(2);
                    return 0;
                }
            } else if (!c)
                ++current;
        }
        stop();
    }
    if (aborted) {
        channel_close(2);
        return 0;
    }
failed:
    channel_close(2);
    /* Swapping a disk with an open output file would write to the wrong disk. */
    if(!device) { error("Cartridge bank_help file missing or unreadable"); return 0; }
    if (redirected && outputpath.dev == device) {
        error("Insert MCS-DOS disk before redirecting bank_help");
        return 0;
    }
    /* Always prompt on screen, including when bank_help output is redirected. */
    error("Insert MCS-DOS disk and press any key when ready");
    if (getch() == CH_STOP) {
        aborted = 1;
        return 0;
    }
    /* Refresh the drive's media state as well as the shell directory cache. */
    command(device, "i");
    goto retry;
}

__noinline void bank_help(int id)
{
    unsigned char i, j, tmp, order[COMMANDCOUNT];
    if (id >= 0) {
        bank_diskhelp((unsigned char)id);
        return;
    }
    say("For more information on a specific\ncommand, type HELP [command].");
    newline();
    for (i = 0; i < COMMANDCOUNT; ++i)
        order[i] = i;
    for (i = 1; i < COMMANDCOUNT; ++i) {
        tmp = order[i];
        j = i;
        while (j && strcmp(commands[order[j - 1]], commands[tmp]) > 0) {
            order[j] = order[j - 1];
            --j;
        }
        order[j] = tmp;
    }
    for (i = 0; i < COMMANDCOUNT; ++i) {
        print("%-13s", commands[order[i]]);
        if (i % 3 == 2)
            newline();
    }
    newline();
    say("Aliases: DELETE ERASE RENAME VERSION");
}
#pragma code(code)
#pragma data(data)
