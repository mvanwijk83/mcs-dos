/* Writable MFJ3 journal plus private session/resource services. */
#include <string.h>
#include "../cart-protocol.h"
#include "../sysout.h"
#include <stdlib.h>
#pragma section(startup, 0)
#pragma region(startup, 0x8000, 0x8020, , , {startup})
#pragma region(main, 0x8020, 0xc000, , , {code, data})
#pragma region(state, 0x0700, 0x07f0, , , {bss})
#pragma region(stackram, 0xc700, 0xc800, , , {stack})
#pragma stacksize(256)
#pragma heapsize(0)
#define H ((volatile unsigned char *)0x07f0)
void dispatch(void);
extern void StackEnd;
__asm startup {
 lda #<StackEnd-2
 sta 0x23
 lda #>StackEnd-2
 sta 0x24
 jsr dispatch
 rts }
#pragma startup(startup)

/* Invoke a resident flash bridge routine without exposing driver RAM to the shell.
 *
 * op: 0=read byte, 1=program byte, 2=erase sector, 3=initialize EasyAPI. */
static void hal(unsigned char op)
{
    switch (op) {
    case 0:
        __asm { jsr 0x0883 }
        break;
    case 1:
        __asm { jsr 0x0886 }
        break;
    case 2:
        __asm { jsr 0x0889 }
        break;
    default:
        __asm { jsr 0x088c }
        break;
    }
}

#include "journal.h"

/* Append an unsigned decimal value to mailbox text; return the next free offset.
 *
 * at: Starting text offset with room for five digits and a terminator.
 * value: Number to format. */
static unsigned char number(unsigned char at, unsigned int value)
{
    char digits[5];
    unsigned char n = 0;
    do {
        digits[n++] = '0' + value % 10;
        value /= 10;
    } while (value);
    while (n)
        CART_TEXT[at++] = digits[--n];
    CART_TEXT[at] = 0;
    return at;
}

/* Parse a native DOS request and create a read or write channel, preserving old data until
 * commit.
 *
 * f: Channel index, 0-5.
 * text: Terminated name with optional type and mode suffixes. */
static void openfile(unsigned char f, const char *text)
{
    char name[17];
    unsigned char n = 0, mode = 'r', type = 16, side;
    int index;
    const char *s = text;
    unsigned int off, len, j;
    if (f >= CART_CHANNEL_COUNT) {
        error = 70;
        return;
    }
    if (channels[f].kind) {
        error = 60;
        return;
    }
    if (*s == '@')
        ++s;
    if (s[0] == '0' && s[1] == ':')
        s += 2;
    while (*s && *s != ',' && n < 16)
        name[n++] = *s++;
    name[n] = 0;
    if (*s == ',') {
        ++s;
        if (*s == 'p')
            type = 17;
        else if (*s == 'u')
            type = 18;
        while (*s && *s != ',')
            ++s;
        if (*s)
            mode = s[1];
    }
    if (!n || (*s && *s != ',')) {
        error = 33;
        return;
    }
    index = find(name);
    if (mode == 'r') {
        if (index < 0) {
            error = 62;
            return;
        }
        channels[f].off = eword(18);
        channels[f].len = eword(20);
        channels[f].side = active;
        channels[f].pos = 0;
        channels[f].kind = 1;
        return;
    }
    if (mode != 'w' && mode != 'a') {
        error = 33;
        return;
    }
    if (index >= 0 && entry[22]) {
        error = 26;
        return;
    }
    if (!startwrite(index, name, type))
        return;
    writer = f + 1;
    channels[f].kind = 2;
    /* Append starts by copying the old payload into the unpublished replacement record. */
    if (mode == 'a' && index >= 0) {
        record(index);
        side = active;
        off = eword(18);
        len = eword(20);
        if (reserve(len))
            for (j = 0; j < len; ++j)
                payload(get(side, off + j));
        if (failed) {
            channels[f].kind = 0;
            abortwrite();
        }
    }
}

/* Commit a writing channel, then release its channel state.
 *
 * f: Channel index; out-of-range values are ignored. */
static void closefile(unsigned char f)
{
    if (f >= CART_CHANNEL_COUNT)
        return;
    if (channels[f].kind == 2 && writer == f + 1)
        completewrite();
    channels[f].kind = 0;
}

/* Execute scratch or rename metadata operations against committed files.
 *
 * s: Native DOS command; the shared error variable records failure. */
static void command(const char *s)
{
    char a[17], b[17];
    unsigned char n = 0, op = *s++, j, found = 0;
    int index, dest;
    if (op == 'i')
        return;
    if (op != 's' && op != 'r') {
        error = 31;
        return;
    }
    while (*s && *s != ':')
        ++s;
    if (*s)
        ++s;
    while (*s && *s != '=' && n < 16)
        a[n++] = *s++;
    a[n] = 0;
    if (op == 's') {
        /* Check every scratch match for read-only protection before deleting any of them. */
        for (j = 0; j < 40; ++j)
            if (heads[j]) {
                record(j);
                if (matches(a, (char *)entry)) {
                    if (entry[22]) {
                        error = 26;
                        return;
                    }
                    found = 1;
                }
            }
        if (!found) {
            error = 62;
            return;
        }
        for (j = 0; j < 40; ++j)
            if (heads[j]) {
                record(j);
                if (matches(a, (char *)entry)) {
                    if (!prepare())
                        return;
                    record(j);
                    metadata(j, 3, 255);
                    if (error)
                        return;
                }
            }
        return;
    }
    dest = find(a);
    if (dest >= 0 && entry[22]) {
        error = 26;
        return;
    }
    if (*s != '=') {
        error = 33;
        return;
    }
    ++s;
    if (s[0] == '0' && s[1] == ':')
        s += 2;
    if (strlen(s) > 16) {
        error = 33;
        return;
    }
    strcpy(b, s);
    index = find(b);
    if (index < 0) {
        error = 62;
        return;
    }
    if (entry[22]) {
        error = 26;
        return;
    }
    if (index == dest)
        return;
    if (!prepare())
        return;
    record(index);
    strcpy((char *)entry, a);
    metadata(index, 2, dest < 0 ? 255 : dest);
}

/* Concatenate the mailbox request into one new journal record, aborting on any source error. */
static void concat(void)
{
    char request[41], name[17], dest[17], *s, *end;
    unsigned char n, side;
    int index;
    unsigned int off, len, j;
    if (strlen(CART_TEXT) > 40) {
        error = 33;
        return;
    }
    /* Keep the request local: nested flash calls reuse hardware buffers and entry scratch data. */
    strcpy(request, CART_TEXT);
    s = strchr(request, ':');
    if (!s) {
        error = 33;
        return;
    }
    ++s;
    end = strchr(s, '=');
    if (!end || end - s > 16 || end == s) {
        error = 33;
        return;
    }
    *end = 0;
    strcpy(dest, s);
    index = find(dest);
    if (index >= 0 && entry[22]) {
        error = 26;
        return;
    }
    if (!startwrite(index, dest, 16))
        return;
    s = end + 1;
    do {
        if (s[0] == '0' && s[1] == ':')
            s += 2;
        n = 0;
        while (*s && *s != ',' && n < 16)
            name[n++] = *s++;
        name[n] = 0;
        if (!n || (*s && *s != ',')) {
            error = 33;
            break;
        }
        index = find(name);
        if (index < 0) {
            error = 62;
            break;
        }
        side = active;
        off = eword(18);
        len = eword(20);
        if (!reserve(len))
            break;
        for (j = 0; j < len; ++j)
            payload(get(side, off + j));
        if (failed)
            break;
        if (!*s)
            break;
        ++s;
    } while (1);
    if (error) {
        failed = 1;
        abortwrite();
    } else
        completewrite();
}

/* Query or update a file read-only flag using the name and mode in the mailbox. */
static void attribute(void)
{
    unsigned char mode = CART_MAILBOX[2], flag;
    int index = find(CART_TEXT);
    if (index < 0) {
        error = 62;
        return;
    }
    CART_MAILBOX[5] = entry[22];
    if (!mode)
        return;
    flag = mode == 1;
    if (entry[22] == flag)
        return;
    if (!prepare())
        return;
    record(index);
    entry[22] = flag;
    metadata(index, 2, 255);
}

/* Parse CONFIG.SYS using bounded lines; retain valid directives and report malformed ones. */
static void config(void)
{
    char *line = configline;
    unsigned char devices[24], trial[24], countdev = 1, enabled = 1, n = 0, overflow = 0, ch, j, k,
                                          bad = 0;
    unsigned int off, len, pos = 0, value;
    char *s, *end;
    int index = find("config.sys");
    /* Absent configuration defaults to cartridge startup; malformed directives do not replace valid ones. */
    devices[0] = 0;
    if (index >= 0) {
        off = entry[18] | ((unsigned int)entry[19] << 8);
        len = entry[20] | ((unsigned int)entry[21] << 8);
        while (pos <= len) {
            ch = pos < len ? get(active, off + pos) : 13;
            ++pos;
            if (ch != 13 && ch != 10) {
                if (ch >= 193 && ch <= 218)
                    ch -= 128;
                if (ch >= 97 && ch <= 122)
                    ch -= 32;
                if (ch != ' ' && ch != 9) {
                    if (n < 79)
                        line[n++] = ch;
                    else
                        overflow = 1;
                }
                continue;
            }
            line[n] = 0;
            if (overflow)
                bad = 1;
            else if (n) {
                if (!strncmp(line, "ldautoex=", 9)) {
                    if (n == 10 && (line[9] == '0' || line[9] == '1'))
                        enabled = line[9] - '0';
                    else
                        bad = 1;
                } else if (!strncmp(line, "bootdrv=", 8)) {
                    s = line + 8;
                    k = 0;
                    do {
                        value = 0;
                        end = s;
                        while (*end >= '0' && *end <= '9') {
                            value = value * 10 + *end++ - '0';
                            if (value > 30)
                                break;
                        }
                        if (end == s || value > 30 || (value != 0 && value < 8) || k == 24 ||
                            (*end && *end != ',')) {
                            k = 0;
                            break;
                        }
                        /* Stage the entire device list before publishing it, so an invalid suffix cannot partly apply. */
                        trial[k++] = value;
                        s = *end ? end + 1 : end;
                        if (*end && !s[0]) {
                            k = 0;
                            break;
                        }
                    } while (*end);
                    if (k) {
                        countdev = k;
                        for (j = 0; j < k; ++j)
                            devices[j] = trial[j];
                    } else
                        bad = 1;
                } else
                    bad = 1;
            }
            n = overflow = 0;
        }
    }
    CART_MAILBOX[3] = enabled ? countdev : 0;
    for (j = 0; j < countdev; ++j)
        CART_TEXT[j] = devices[j];
    if (bad)
        error = 33;
}

#include "session-store.h"
#include "help-store.h"

/* Dispatch one mailbox request and publish its result; session/help services have private
 * storage. */
void dispatch(void)
{
    unsigned char op = CART_MAILBOX[0], f = CART_MAILBOX[1], n = CART_MAILBOX[3], i, j;
    Channel *c;
    if (op == CART_INIT) {
        hal(3);
        if (H[4]) {
            error = 74;
            CART_MAILBOX[4] = error;
            return;
        }
        mount();
    } else if (op >= CART_SESSION_BEGIN && op <= CART_SESSION_READ) {
        /* Session storage is independent of the writable filesystem mount. */
        session_store(op);
        return;
    } else if (op == CART_HELP) {
        /* Help is immutable and remains available when the filesystem cannot mount. */
        help_store();
        return;
    } else if (op == CART_STATUS) {
        CART_MAILBOX[4] = error;
        return;
    } else if (!mounted) {
        CART_MAILBOX[4] = 74;
        return;
    } else {
        error = 0;
        if (op == CART_OPEN)
            openfile(f, CART_TEXT);
        else if (op == CART_COMPACT) {
            CART_MAILBOX[3] = 0;
            if (writer)
                error = 60;
            else {
                failed = rotating = 0;
                /* Packed live records need one header each plus the sector header. */
                if (dirty || tail > 32U + livebytes + (unsigned int)count * 32U)
                    if (compact(0))
                        CART_MAILBOX[3] = 1;
            }
        } else if (op == CART_CLOSE) {
            if (writer == f + 1 && failed)
                error = 25;
            closefile(f);
        } else if (op == CART_COMMAND) {
            if (CART_TEXT[0] == 'c')
                concat();
            else
                command(CART_TEXT);
        } else if (op == CART_CONFIG)
            config();
        else if (op == CART_ATTRIBUTE)
            attribute();
        else if (op == CART_LOOKUP) {
            if (find(CART_TEXT) < 0)
                error = 62;
            else {
                for (i = 0; i < 24; ++i)
                    CART_TEXT[i] = entry[i];
                CART_MAILBOX[5] = active;
            }
        } else if (op == CART_LOADER) {
            for (i = 0; i < CART_RUN_SIZE; ++i)
                CART_TEXT[i] = ((const char *)0xbf00)[i];
            CART_MAILBOX[3] = CART_RUN_SIZE;
        } else if (op == CART_ABORT) {
            if (writer == f + 1) {
                channels[f].kind = 0;
                abortwrite();
            }
        } else if (op == CART_STATS) {
            /* Raw values: the shell owns formatting and wording. */
            if (CART_MAILBOX[2] == 0)
                number(0, CAPACITY);
            else if (CART_MAILBOX[2] == 1)
                number(0, livebytes);
            else
                number(0, count);
        } else if (f < CART_CHANNEL_COUNT) {
            c = channels + f;
            if (op == CART_READ) {
                if (c->kind != 1) {
                    error = 61;
                    n = 0;
                } else {
                    if (n > c->len - c->pos)
                        n = c->len - c->pos;
                    for (i = 0; i < n; ++i)
                        CART_TEXT[i] = get(c->side, c->off + c->pos++);
                }
                CART_MAILBOX[3] = n;
            } else if (op == CART_WRITE) {
                if (c->kind != 2 || writer != f + 1)
                    error = 61;
                else if (failed)
                    error = 25;
                else if (reserve(n))
                    for (i = 0; i < n; ++i)
                        payload(CART_TEXT[i]);
                if (error)
                    CART_MAILBOX[3] = 0;
            } else if (op == CART_DIRECTORY) {
                if (CART_MAILBOX[2] == 0) {
                    c->pos = 0;
                    c->kind = 3;
                } else if (c->pos == 0) {
                    memset(CART_TEXT, 0, 24);
                    strcpy(CART_TEXT, "mcs-dos 2.0");
                    CART_MAILBOX[3] = 0;
                    ++c->pos;
                } else if (c->pos <= count) {
                    j = 0;
                    for (i = 0; i < 40; ++i)
                        if (heads[i] && ++j == c->pos)
                            break;
                    record(i);
                    ++c->pos;
                    for (i = 0; i < 24; ++i)
                        CART_TEXT[i] = entry[i];
                    CART_MAILBOX[3] = 0;
                } else {
                    CART_MAILBOX[3] = 2;
                    CART_MAILBOX[5] = (CAPACITY - livebytes) / 254;
                    CART_MAILBOX[6] = ((CAPACITY - livebytes) / 254) >> 8;
                }
            }
        } else
            error = 70;
    }
    CART_MAILBOX[4] = error;
}
