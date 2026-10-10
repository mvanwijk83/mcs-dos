/* Streaming file commands and internal help. Large inputs stay on their
 * devices; io and the idle editor workspace hold only bounded chunks. */
#include "core.h"
#pragma code(fileutil_code)
#pragma data(fileutil_data)
__noinline void bank_typecmd(unsigned char printer);
__noinline int bank_findbyte(unsigned char reader, unsigned int *pos, unsigned int *len);
__noinline void bank_findcmd(void);
__noinline void bank_runcmd(unsigned char implicit);
__noinline unsigned char bank_diskhelp(unsigned char topic);
__noinline void bank_help(int id);

__noinline int bank_typehex(unsigned long skip, unsigned long limit);

/* Display logical file 2 as eight-byte hex rows; return the final read result. */
__noinline int bank_typehex(unsigned long skip, unsigned long limit)
{
    int n = 0, i, got;
    unsigned char c;
    unsigned long offset = 0, address;
    char hexline[40];
    const char *digits = "0123456789ABCDEF";
    while (skip && !aborted) {
        n = readio(2, io, skip > sizeof(io) ? sizeof(io) : (unsigned int)skip);
        if (n <= 0)
            return n;
        skip -= n;
        offset += n;
        stop();
    }
    while (limit && !aborted) {
        n = 0;
        while (n < 8 && (unsigned long)n < limit) {
            got = readio(2, io + n, limit - n < 8 - n ? (unsigned int)(limit - n) : 8 - n);
            if (got < 0)
                return got;
            if (!got)
                break;
            n += got;
        }
        if (!n)
            break;
        memset(hexline, ' ', 39);
        hexline[39] = 0;
        address = offset;
        for (i = 5; i >= 0; --i) {
            hexline[i] = digits[address & 15];
            address >>= 4;
        }
        for (i = 0; i < n; ++i) {
            c = io[i];
            hexline[7 + i * 3] = digits[c >> 4];
            hexline[8 + i * 3] = digits[c & 15];
            hexline[31 + i] = c < 32 || (c >= 128 && c < 160) ? '.' : c;
        }
        for (i = 0; i < 39; ++i)
            outc(hexline[i]);
        newline();
        offset += n;
        limit -= n;
        if (!page())
            break;
        stop();
    }
    return n;
}

/* Validate before opening a redirected destination, too.
 *
 * Validate TYPE arguments before any redirected destination is opened.
 *
 * mode: Output bits: 1=head, 2=tail, 4=hex, 8=byte count.
 * limit: Output count for head/tail; return nonzero on success. */
__noinline unsigned char bank_typeoptions(unsigned char *mode, unsigned long *limit)
{
    unsigned char i, kind;
    const char *q;
    *mode = 0;
    *limit = 10;
    if (argc < 2 || argc > 5 || args[1][0] == '/')
        return 0;
    for (i = 2; i < argc; ++i) {
        if (!stricmp(args[i], "/HEX")) {
            if (*mode & 4)
                return 0;
            *mode |= 4;
        } else if (!stricmp(args[i], "/C")) {
            if (*mode & 8)
                return 0;
            *mode |= 8;
        } else {
            if (args[i][0] != '/' || !args[i][1])
                return 0;
            kind = toupper(args[i][1]);
            if ((kind != 'H' && kind != 'T') || (*mode & 3))
                return 0;
            q = args[i] + 2;
            if (*q) {
                if (*q++ != ':' || !*q)
                    return 0;
                *limit = 0;
                while (*q) {
                    if (*q < '0' || *q > '9' || *limit > (16777215UL - (*q - '0')) / 10)
                        return 0;
                    *limit = *limit * 10 + *q++ - '0';
                }
            }
            *mode |= kind == 'H' ? 1 : 2;
        }
    }
    return !(*mode & 8) || (*mode & 3);
}

/* Stream TYPE output or PRINT data, handling line limits, wrapping and cleanup.
 *
 * printer: Nonzero selects PRINT and parses its printer destination. */
__noinline void bank_typecmd(unsigned char printer)
{
    int n, i;
    unsigned char lastcr = 0, wrapped = 0, mode = 0, c, selected = 1, pending = 0;
    unsigned long limit = 0, lines = 0, skip = 0, line = 0;
    if (printer) {
        if (argc < 2 || argc > 3) {
            error(SYSOUT_SYNTAX_PRINT);
            return;
        }
        printer = 4;
        if (argc == 3) {
            if (!strcmp(args[2], "5:") || !stricmp(args[2], "LPT2"))
                printer = 5;
            else if (strcmp(args[2], "4:") && stricmp(args[2], "LPT1")) {
                error(SYSOUT_INVALID_PRINTER);
                return;
            }
        }
    } else if (!bank_typeoptions(&mode, &limit)) {
        error(SYSOUT_SYNTAX_TYPE);
        return;
    }
    if (!path(args[1], &p1))
        return;
    if (!openread(&p1, 2))
        return;
    if (printer && channel_open(4, printer, 7, "") != 0) {
        channel_close(2);
        channel_close(4);
        error(SYSOUT_PRINTER_NOT_READY);
        return;
    }
    pagelines = 0;
    n = 0;
    if ((mode & 3) && !limit)
        goto done;
    if ((mode & 4) && (mode & 3) && !(mode & 8))
        limit *= 8;
    if (mode & 2) {
        /* Count logical lines or bytes, then reopen without buffering the file. */
        while ((n = readio(2, io, sizeof(io))) > 0 && !aborted) {
            if (mode & 12)
                lines += n;
            else
                for (i = 0; i < n; ++i) {
                    c = io[i];
                    if (c == 13 || (c == 10 && !lastcr))
                        ++lines;
                    pending = c != 13 && c != 10;
                    lastcr = c == 13;
                }
            stop();
        }
        if (n < 0 || aborted)
            goto done;
        if (pending && !(mode & 12))
            ++lines;
        if ((mode & 4) && !(mode & 8)) {
            lines = (lines + 7) / 8;
            skip = lines > limit / 8 ? (lines - limit / 8) * 8 : 0;
        } else
            skip = lines > limit ? lines - limit : 0;
        channel_close(2);
        if (!openread(&p1, 2))
            return;
        lastcr = 0;
    }
    if (mode & 4) {
        n = bank_typehex(skip, (mode & 3) ? limit : 0xffffffffUL);
        goto done;
    }
    while ((n = readio(2, io, sizeof(io))) > 0 && !aborted) {
        if (printer) {
            if (channel_write(4, io, n) != n) {
                error(SYSOUT_WRITE_FAULT_ERR);
                break;
            }
            stop();
        } else {
            for (i = 0; i < n; ++i) {
                c = io[i];
                if (mode & 8) {
                    if ((mode & 1) && line >= limit)
                        goto done;
                    selected = line++ >= skip;
                    if (!selected)
                        continue;
                    if (redirected) {
                        outputbyte(c);
                        continue;
                    }
                }
                /* A CRLF belongs to one logical line, even across reads. */
                if (c == 10 && lastcr) {
                    lastcr = 0;
                    if (selected && redirected)
                        outputbyte(c);
                    continue;
                }
                if (!(mode & 8) && (mode & 1) && line >= limit)
                    goto done;
                if (!(mode & 8))
                    selected = line >= skip;
                lastcr = c == 13;
                if (!(mode & 8) && (c == 13 || c == 10))
                    ++line;
                if (!selected)
                    continue;
                if (redirected) {
                    outputbyte(c);
                    continue;
                }
                /* Full screen rows already advanced past their terminator. */
                if ((c == 13 || c == 10) && wrapped) {
                    wrapped = 0;
                    continue;
                }
                outc(c);
                wrapped = c != 13 && c != 10 && !ox;
                if (!ox && !page())
                    break;
            }
            stop();
        }
    }
done:
    channel_close(2);
    if (printer)
        channel_close(4);
    if (!redirected && ox)
        newline();
    if (n < 0)
        error(SYSOUT_READ_FAULT_ERR);
}

/* Reuse EDIT's idle buffer for two disk cursors and a sliding search window.
 * The second cursor preserves full lines without imposing a line-size limit.
 *
 * Read the next byte through one of two buffered FIND readers.
 *
 * reader: Reader index, 0 or 1; channels are 2 and 3.
 * pos: Two current buffer positions, updated in place.
 * len: Two buffered lengths, updated in place; return -1 for EOF or -2 for error. */
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

/* Share FIND validation with redirection before opening output.
 *
 * Validate FIND arguments and set p1 to its source path before opening any output.
 *
 * flags: Output: /V=1, /C=2, /N=4, /I=8.
 * needle: Output pointer to the search text; return nonzero on success. */
__noinline unsigned char bank_findoptions(unsigned char *flags, char **needle)
{
    unsigned char i;
    char *filename = 0;
    *flags = 0;
    *needle = (char *)0;
    for (i = 1; i < argc; ++i) {
        if (!argquoted[i] && args[i][0] == '/') {
            if (!stricmp(args[i], "/V"))
                *flags |= 1;
            else if (!stricmp(args[i], "/C"))
                *flags |= 2;
            else if (!stricmp(args[i], "/N"))
                *flags |= 4;
            else if (!stricmp(args[i], "/I"))
                *flags |= 8;
            else {
                error(SYSOUT_INVALID_SWITCH);
                return 0;
            }
        } else if (!*needle && argquoted[i])
            *needle = args[i];
        else if (*needle && !filename)
            filename = args[i];
        else {
            error(SYSOUT_SYNTAX_FIND);
            return 0;
        }
    }
    if (!*needle || !filename) {
        error(SYSOUT_SYNTAX_FIND);
        return 0;
    }
    if (!path(filename, &p1))
        return 0;
    if (!p1.name[0] || strpbrk(p1.name, "*?")) {
        error(SYSOUT_INVALID_FILE_NAME);
        return 0;
    }
    return 1;
}

/* Search lines with a sliding window; a second reader reproduces selected lines without storing
 * them. */
__noinline void bank_findcmd(void)
{
    unsigned char flags = 0, size, used = 0, hit, lastcr = 0, pending = 0, skip = 0, selected, col;
    unsigned int pos[2], len[2];
    unsigned long number = 0, total = 0, digits;
    int c = -1, d;
    char *needle = 0, *window = editbuf + 512;
    char shown[17];
    if (!bank_findoptions(&flags, &needle))
        return;
    if (!openread(&p1, 2))
        return;
    /* The same specification, but a distinct secondary address/cursor. */
    if (!(flags & 2)) {
        if (channel_open(3, p1.dev, 3, diskcmd) != 0 || diskstatus(p1.dev, 1) >= 20) {
            channel_close(2);
            channel_close(3);
            error(SYSOUT_FILE_NOT_FOUND);
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
    print(SYSOUT_FIND_HEADER, shown);
    if (!(flags & 2))
        newline();
    pagelines = 1;
    /* The first reader decides whether a line matches; the second reproduces it without a line-size limit. */
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
                    print(SYSOUT_FIND_LINE_NUMBER, decimal(number));
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
                    if (selected && (redirected || !(flags & 4) || col < 40)) {
                        outc(d);
                        if (col < 40)
                            ++col;
                        if (!redirected && !ox && !page())
                            break;
                    }
                } while (!aborted);
                skip = d == 13;
                if (d == -2) {
                    c = -2;
                    break;
                }
                if (selected && !aborted && (redirected || !col || ox)) {
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
        error(SYSOUT_READ_FAULT_ERR);
    else if ((flags & 2) && !aborted)
        print(SYSOUT_FIND_COUNT, decimal(total));
}

/* Validate explicit RUN or an implicit PRG/batch name, then reuse the existing launch path.
 *
 * implicit: Nonzero selects a filename-only command after built-in lookup fails. */
__noinline void bank_runcmd(unsigned char implicit)
{
    char *end;
    unsigned long address;
    unsigned char n, batchfile;
    int found;
    if (implicit && argc != 1) {
        say(SYSOUT_BAD_CMD_OR_FILE_NAME);
        return;
    }
    if (!implicit && argc != 2 && argc != 4) {
        error(SYSOUT_SYNTAX_RUN);
        return;
    }
    if (!path(args[implicit ? 0 : 1], &p1))
        return;
    n = strlen(p1.name);
    batchfile = n >= 4 && !stricmp(p1.name + n - 4, ".BAT");
    if (!implicit && batchfile) {
        if (argc != 2) {
            error(SYSOUT_INVALID_SWITCH_BATCH);
            return;
        }
        runbatch();
        return;
    }
    launchabsolute = 0;
    if (argc == 4) {
        if (stricmp(args[2], "/A")) {
            error(SYSOUT_INVALID_SWITCH);
            return;
        }
        address = strtoul(args[3], &end, 10);
        if (!args[3][0] || *end || address < 2049 || address > 65535UL) {
            error(SYSOUT_INVALID_LOAD_ADDR);
            return;
        }
        launchabsolute = 1;
        launchaddress = address;
    }
    if (!implicit)
        cachevalid = 0;
    found = findfile(&p1);
    if (found < 0) {
        if (!implicit)
            error(SYSOUT_FILE_NOT_FOUND);
        else if (found == -1)
            say(SYSOUT_BAD_CMD_OR_FILE_NAME);
        return;
    }
    if (implicit && batchfile) {
        runbatch();
        return;
    }
    if (implicit && directory_entries[found].type != CBM_T_PRG) {
        say(SYSOUT_BAD_CMD_OR_FILE_NAME);
        return;
    }
    strcpy(launchname, p1.name);
    launchlength = n;
    launchdevice = p1.dev;
    /* Install the return wedge before the loader overwrites the running shell. */
    if (!session_run())
        return;
    say(SYSOUT_LOADING);
    /* Swapping a disk with an open output file would write to the wrong disk. */
    if (!launchdevice) {
        if (!cart_launch(launchname, launchabsolute, launchaddress))
            error(SYSOUT_CANNOT_LOAD_CRT_PRG);
        return;
    }
    launch();
}

/* Indexed internal cartridge text; no filesystem channels or persistent buffer.
 *
 * Stream one indexed help topic, with wrapping and paging; return nonzero on success.
 *
 * topic: Internal command-help index. */
__noinline unsigned char bank_diskhelp(unsigned char topic)
{
    unsigned char c, wrapped = 0, i;
    unsigned int offset = 0;
    int n;
    pagelines = 0;
    /* Internal help remains usable even when writable cartridge files cannot be mounted. */
    while (!aborted && (n = cart_help(topic, offset, io, 120)) > 0) {
        offset += n;
        for (i = 0; i < n; ++i) {
            c = io[i];
            if (!c) {
                newline();
                return 1;
            }
            if (!redirected && wrapped && (c == 10 || c == 13)) {
                wrapped = 0;
                continue;
            }
            outc(c);
            wrapped = !redirected && c != 10 && c != 13 && !ox;
            if (!redirected && !ox && !page())
                return 0;
        }
        stop();
    }
    if (!aborted)
        error(SYSOUT_CRT_HELP_UNAVAILABLE);
    return 0;
}

/* Show one command help topic or an alphabetically sorted command overview.
 *
 * id: Command index; a negative value selects the overview. */
__noinline void bank_help(int id)
{
    unsigned char i, j, tmp, order[COMMANDCOUNT];
    if (id >= 0) {
        bank_diskhelp((unsigned char)id);
        return;
    }
    say(SYSOUT_HELP_INTRO);
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
        print(SYSOUT_HELP_CMD, commands[order[i]]);
        if (i % 3 == 2)
            newline();
    }
    newline();
    say(SYSOUT_HELP_ALIASES);
}

#pragma code(code)
#pragma data(data)
