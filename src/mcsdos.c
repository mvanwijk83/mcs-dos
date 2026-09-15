#include "c64-support.h"
#include "memory.h"
#include <conio.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <stdarg.h>
#include <time.h>

/* 64 command characters plus terminator. */
#define LINE 65
#define MAXARGS 33
#define ENVVALUE 32
#define ENVSIZE 512
#define VERSION "1.0"
#include "bootsplash.h"
#define BANNER "MCS-DOS Version " VERSION "\nCopyright (C) 2026 MCS"
#define MAXFILES 296
#define EDITROWS 24
#define BATCHMAX 2048

typedef struct {
    unsigned char dev;
    char name[17];
} Path;
typedef struct {
    char name[17];
    unsigned int blocks;
    unsigned char type;
} Entry;
static Entry files[MAXFILES];
static unsigned int count;
static unsigned char cachedev, cachevalid, drive, helpdrive;
static unsigned int freeblocks;
static char volume[17], diskid[3];
static unsigned char ox, oy, fg = 15, bg = 0, bd = 0, quit, reboot, echoon = 1, batching;
static unsigned char pagelines, aborted, editprompt;
static unsigned int screenbase = 0x0400;
extern void charset_prepare(void);
extern void charset_commit(void);
extern void charset_enable(void);
extern void charset_default(void);
extern void charset_scroll(void);
static char environment[ENVSIZE];
static unsigned int envused;
/* Behavioral settings remain inactive until AUTOEXEC has unwound. */
static unsigned char envready;
static char line[LINE], history[10][LINE], draft[LINE];
static char prompttext[ENVVALUE + 1];
#define RAWMAP ((LINE + 7) / 8)
/* Completed bytes live in the command itself, never as cache indices. */
static unsigned char rawline[RAWMAP], rawhistory[10][RAWMAP], rawdraft[RAWMAP];
static unsigned char rawparse[(LINE + MAXARGS + 7) / 8];
static unsigned char histcount, histnext;
/* Formatting and disk command construction never overlap. */
static char fmtbuf[160], statusbuf[64];
#define diskcmd fmtbuf
static unsigned char io[256];
static unsigned char eof[16];
static unsigned char cmddev[2], cmdslot;
/* Current raw operation's geometry; refreshed from the medium, never cached. */
static unsigned char headertrack, labeloff, idoff, disktracks;
static char batch[BATCHMAX + 1];
/* Commands execute one at a time. DIR, FIND and REL COPY use EDIT's idle
 * workspace; EDIT initializes it before use. Keep batch storage separate:
 * a batch can invoke any of these commands and must survive their return. */
static union {
    char text[EDITROWS * 40];
    unsigned int order[MAXFILES];
} workspace;
#define editbuf workspace.text
static unsigned int batchpos, batchlen;
static char *args[MAXARGS];
static char parsebuf[LINE + MAXARGS];
static unsigned char argc;
static unsigned char argquoted[MAXARGS];
static Path p1, p2;
static Path outputpath;
static unsigned char redirected, outputfailed, outputused, outputcol;
static unsigned char outputbuf[128];
static void outputbyte(unsigned char c);
/* Loader parameters consumed before the shell is overwritten. */
char launchname[17];
unsigned char launchdevice, launchlength, launchabsolute;
unsigned int launchaddress;
extern void launch(void);
extern void basic_exit(void);
extern unsigned int reu_size(void);

static void execute(char *s);
static const char *drivename(unsigned char dev);
static unsigned char directory(unsigned char dev);
static unsigned char bam(unsigned char dev);
static unsigned char drivetype(unsigned char dev, unsigned char report);
static unsigned char copyrel(void);
static void concatcmd(void);
static void bootsplash(unsigned char wait);
static void uppername(const char *s, char *d);

static void clear(void)
{
    clrscr();
    ox = oy = 0;
}
static void newline(void)
{
    if (redirected) {
        outputbyte(13);
        outputcol = 0;
        return;
    }
    ox = 0;
    if (oy < 24)
        ++oy;
    else {
        if (screenbase == 0x0400)
            memmove((void *)0x0400, (void *)0x0428, 960);
        else
            charset_scroll();
        memmove((void *)0xd800, (void *)0xd828, 960);
        memset((void *)(screenbase + 960), 32, 40);
        memset((void *)0xdbc0, fg, 40);
    }
    gotoxy(ox, oy);
}
/* Screen-only compatibility: external byte 96 is an ordinary space.
 * PETSCII $a0 (Shift-SPACE) selects the new backslash at screen slot 96. */
static void displayc(unsigned char c)
{
    screen_putc(c == 96 ? ' ' : c);
}
static void outc(unsigned char c)
{
    if (redirected) {
        if (c == 10 || c == 13)
            newline();
        else {
            outputbyte(c);
            outputcol = 1;
        }
        return;
    }
    if (c == 10 || c == 13) {
        newline();
        return;
    }
    /* File contents may not issue arbitrary PETSCII screen controls. */
    if (c < 32 || (c >= 128 && c < 160))
        c = '.';
    gotoxy(ox, oy);
    displayc(c);
    if (++ox == 40)
        newline();
}
static void outs(const char *s)
{
    while (*s)
        outc(*s++);
}
static void say(const char *s)
{
    /* Save errors leave EDIT visibly, retaining the error on the clean screen. */
    if (editprompt) {
        editprompt = 0;
        screen_reverse(0);
        clear();
    }
    outs(s);
    newline();
}
static void error(const char *s)
{
    unsigned char saved = redirected;
    redirected = 0;
    say(s);
    redirected = saved;
}
static void outputflush(void)
{
    if (outputused && !outputfailed) {
        if (channel_write(5, outputbuf, outputused) != outputused) {
            outputfailed = aborted = 1;
            error("Write fault error");
        }
    }
    outputused = 0;
}
static void outputbyte(unsigned char c)
{
    if (outputfailed)
        return;
    outputbuf[outputused++] = c;
    if (outputused == sizeof(outputbuf))
        outputflush();
}
static void print(const char *s, ...)
{
    va_list ap;
    va_start(ap, s);
    vsnprintf(fmtbuf, sizeof(fmtbuf), s, ap);
    va_end(ap);
    outs(fmtbuf);
}
static void colors(void)
{
    textcolor(fg);
    bgcolor(bg);
    bordercolor(bd);
}
/* Maximum disk allocation is 65,535 blocks: eight decimal digits. */
static unsigned char noseparators;
/* Oscar64 needs this routine unoptimized for 32-bit decimal division. */
#pragma optimize(push, 0)
static char *decimal(unsigned long bytes)
{
    static char number[14];
    unsigned char pos = 13, group = 0;
    number[pos] = 0;
    do {
        if (group == 3 && !noseparators) {
            number[--pos] = ',';
            group = 0;
        }
        number[--pos] = '0' + bytes % 10;
        bytes /= 10;
        ++group;
    } while (bytes);
    return number + pos;
}
#pragma optimize(pop)
static char *allocated(unsigned int blocks)
{
    return decimal((unsigned long)blocks * 256);
}
static void volumeheader(unsigned char dev)
{
    char shown[17];
    uppername(volume, shown);
    print(" Volume in drive %s: is ", drivename(dev));
    if (ox + strlen(shown) > 40)
        newline();
    outs(shown);
    if (ox)
        newline();
    if (bam(dev)) {
        diskid[0] = toupper(io[idoff]);
        diskid[1] = toupper(io[idoff + 1]);
        diskid[2] = 0;
        print(" Disk ID is %s\n", diskid);
    }
}
/* A single-color sprite supplies a true eight-pixel underscore without
 * changing the ROM font or the character under the cursor. Cassette RAM
 * $0340-$037f is no longer needed when the launch trampoline overwrites it. */
static void caret_hide(void)
{
    POKE(0xd015, PEEK(0xd015) & 254);
}
static void caret_init(void)
{
    memset((void *)0x0340, 0, 64);
    POKE(0x0340 + 21, 255);
    if (screenbase != 0x0400)
        memcpy((void *)0xe400, (void *)0x0340, 64);
    POKE(screenbase + 1016, screenbase == 0x0400 ? 13 : 144);
    POKE(0xd017, PEEK(0xd017) & 254);
    POKE(0xd01d, PEEK(0xd01d) & 254);
    POKE(0xd01b, PEEK(0xd01b) & 254);
    POKE(0xd01c, PEEK(0xd01c) & 254);
    caret_hide();
}
static void caret_show(unsigned char x, unsigned char y)
{
    unsigned int sx = 24 + (unsigned int)x * 8;
    POKE(0xd000, sx);
    POKE(0xd001, 50 + y * 8);
    /* Extract the ninth X bit directly (also avoids a cc65 boolean/OR
     * optimization that incorrectly retained sx's low byte). */
    POKE(0xd010, (PEEK(0xd010) & 254) | (unsigned char)(sx >> 8));
    POKE(0xd027, fg);
    POKE(0xd015, PEEK(0xd015) | 1);
}
static unsigned char stop(void)
{
    if (kbhit() && getch() == CH_STOP) {
        aborted = 1;
        return 1;
    }
    return 0;
}
static void editstatus(void)
{
    ox = 0;
    oy = 24;
    gotoxy(0, 24);
    screen_reverse(1);
    screen_clear(40);
}
static void editsaving(void)
{
    editstatus();
    outs("Saving . . .");
}
/* Only these two reverse-video digit cells change while editing. */
static void editnumber(unsigned int address, unsigned char n)
{
    POKE(address, 176 + n / 10);
    POKE(address + 1, 176 + n % 10);
}
static unsigned char yesno(const char *s)
{
    unsigned char c;
    if (editprompt)
        editstatus();
    outs(s);
    outs(" (Y/N)? ");
    do {
        c = getch();
    } while (toupper(c) != 'Y' && toupper(c) != 'N' && c != CH_STOP);
    if (c == CH_STOP)
        c = 'N';
    outc(toupper(c));
    if (!editprompt)
        newline();
    return toupper(c) == 'Y';
}
static unsigned char page(void)
{
    unsigned char c;
    if (redirected)
        return !aborted && !stop();
    if (++pagelines < 22)
        return !stop();
    outs("Press any key to continue . . .");
    c = getch();
    gotoxy(0, oy);
    screen_clear(40);
    ox = 0;
    pagelines = 0;
    if (c == CH_STOP)
        aborted = 1;
    return !aborted;
}
static void uppername(const char *s, char *d)
{
    while (*s)
        *d++ = toupper(*s++);
    *d = 0;
}
static unsigned char rawget(const unsigned char *map, unsigned char pos)
{
    return map[pos >> 3] & (1 << (pos & 7));
}
static void rawset(unsigned char *map, unsigned char pos, unsigned char value)
{
    unsigned char bit = 1 << (pos & 7);
    if (value)
        map[pos >> 3] |= bit;
    else
        map[pos >> 3] &= ~bit;
}
/* Editing a completed name relinquishes exact-byte handling for that name.
 * Other completed arguments retain their provenance as the line shifts. */
static void rawedit(unsigned char pos, unsigned char len, unsigned char deleting)
{
    unsigned char a = pos, b = pos, i;
    if (a && rawget(rawline, a - 1))
        --a;
    while (a && rawget(rawline, a - 1))
        --a;
    while (b < len && rawget(rawline, b))
        ++b;
    for (i = a; i < b; ++i)
        rawset(rawline, i, 0);
    if (deleting) {
        for (i = pos; i < len; ++i)
            rawset(rawline, i, rawget(rawline, i + 1));
    } else {
        for (i = len; i > pos; --i)
            rawset(rawline, i, rawget(rawline, i - 1));
        rawset(rawline, pos, 0);
    }
}
static void filename(const char *s, char *d)
{
    unsigned char c, exact;
    while ((c = *s++) != 0) {
        exact = 0;
        if ((unsigned int)(s - 1) >= (unsigned int)parsebuf &&
            (unsigned int)(s - 1) < (unsigned int)(parsebuf + sizeof(parsebuf)))
            exact = rawget(rawparse, (s - 1) - parsebuf);
        if (!exact && c >= 193 && c <= 218)
            c -= 128;
        *d++ = c;
    }
    *d = 0;
}
/* Packed NAME=value strings; absent entries use shell defaults. */
static char *envget(const char *name)
{
    unsigned int p = 0, n = strlen(name);
    while (p < envused) {
        if (!strncmp(environment + p, name, n) && environment[p + n] == '=')
            return environment + p + n + 1;
        p += strlen(environment + p) + 1;
    }
    return 0;
}
static unsigned char dosdrives(void)
{
    char *v = envready ? envget("DRIVEIDS") : (char *)0;
    if (!v)
        return 0;
    while (*v == ' ')
        ++v;
    return toupper(*v) == 'D';
}
static const char *drivename(unsigned char dev)
{
    static char text[4];
    if (dosdrives() && dev >= 8 && dev <= 30) {
        text[0] = 'A' + dev - 8;
        text[1] = 0;
    } else
        snprintf(text, sizeof(text), "%u", dev);
    return text;
}
static void showprompt(void)
{
    const char *s = prompttext;
    unsigned char c;
    while (*s) {
        c = *s++;
        if (c == '$' && *s) {
            switch (toupper(*s)) {
            case 'B':
                c = 0xdd;
                break; /* PETSCII vertical line */
            case 'C':
                c = ':';
                break;
            case 'D':
                if (drive >= 8 && drive <= 30)
                    outc('A' + drive - 8);
                ++s;
                continue;
            case 'G':
                c = '>';
                break;
            case 'H':
                c = 0xa0;
                break; /* Backslash at screen slot 96 */
            case 'N':
                print("%u", drive);
                ++s;
                continue;
            case 'P':
                outs(drivename(drive));
                ++s;
                continue;
            case 'Q':
                c = '=';
                break;
            case 'R':
                c = 13;
                break;
            case 'S':
                c = ' ';
                break;
            case 'V':
                outs(VERSION);
                ++s;
                continue;
            case '$':
                c = '$';
                break;
            default:
                outc(c);
                continue;
            }
            ++s;
        }
        outc(c);
    }
}
static unsigned char diroption(const char *s, unsigned char *flags)
{
    if (!stricmp(s, "/B"))
        *flags |= 1;
    else if (!stricmp(s, "/L"))
        *flags |= 2;
    else if (s[0] == '/' && toupper(s[1]) == 'O') {
        unsigned char mode = 4;
        s += 2;
        if (*s == '-') {
            mode |= 64;
            ++s;
        }
        if (toupper(*s) == 'N')
            ++s;
        else if (toupper(*s) == 'T') {
            mode |= 16;
            ++s;
        } else if (toupper(*s) == 'S') {
            mode |= 32;
            ++s;
        } else if (*s || (mode & 64))
            return 0;
        if (toupper(*s) == 'F') {
            mode |= 128;
            ++s;
        }
        if (*s)
            return 0;
        *flags = (*flags & 11) | mode;
    } else if (!stricmp(s, "/W"))
        *flags |= 8;
    else if (stricmp(s, "/P"))
        return 0;
    return 1;
}
static unsigned char dirdefaults(const char *s, unsigned char *flags)
{
    char option[6];
    unsigned char n;
    while (*s) {
        while (*s == ' ')
            ++s;
        if (!*s)
            break;
        n = 0;
        if (*s != '/')
            return 0;
        option[n++] = *s++;
        while (*s && *s != ' ' && *s != '/') {
            if (n == 5)
                return 0;
            option[n++] = *s++;
        }
        option[n] = 0;
        if (!diroption(option, flags))
            return 0;
    }
    return 1;
}
/* A 12-character stem leaves room for .CPI in a native 16-byte filename. */
static unsigned char charsetname(const char *s)
{
    unsigned char n = 0;
    while (s[n]) {
        /* Literal '_' is remapped to $a4 by cc65; native filenames use $5f. */
        if (n == 12 || (!isalnum(s[n]) && s[n] != ' ' && s[n] != '-' && s[n] != 95))
            return 0;
        ++n;
    }
    return n != 0;
}
static void setcmd(const char *s)
{
    static char value[ENVVALUE + 1];
    char name[9], *old, *v;
    const char *eq;
    unsigned int n, len, pos, size;
    unsigned char flags = 0;
    while (*s == ' ')
        ++s;
    if (!strcmp(s, "/?")) {
        say("Use HELP SET");
        return;
    }
    if (!*s) {
        pos = 0;
        while (pos < envused) {
            say(environment + pos);
            pos += strlen(environment + pos) + 1;
        }
        return;
    }
    if (!strnicmp(s, "/ENV", 4)) {
        eq = s + 4;
        while (*eq == ' ')
            ++eq;
        if (!*eq) {
            print("%3u bytes total environment size\n%3u bytes used\n%3u bytes free\n",
                  (unsigned int)ENVSIZE, envused, (unsigned int)(ENVSIZE - envused));
            return;
        }
    }
    eq = strchr(s, '=');
    if (!eq || strchr(s, '"')) {
        error("Invalid value");
        return;
    }
    n = eq - s;
    while (n && s[n - 1] == ' ')
        --n;
    len = strlen(eq + 1);
    if (!n || n > 8 || len > ENVVALUE) {
        error("Invalid value");
        return;
    }
    memcpy(name, s, n);
    name[n] = 0;
    uppername(name, name);
    strcpy(value, eq + 1);
    v = value;
    while (*v == ' ')
        ++v;
    size = strlen(v);
    while (size && v[size - 1] == ' ')
        v[--size] = 0;
    if (*v && ((!strcmp(name, "DRIVEIDS") && stricmp(v, "C64") && stricmp(v, "DOS")) ||
               (!strcmp(name, "CHARSET") && !charsetname(v)) ||
               (!strcmp(name, "DIRCMD") && !dirdefaults(v, &flags)))) {
        error("Invalid value");
        return;
    }
    old = envget(name);
    size = old ? strlen(old) + strlen(name) + 2 : 0;
    if (envused - size + (len ? n + len + 2 : 0) > ENVSIZE) {
        say("Environment full");
        return;
    }
    if (old) {
        pos = old - environment - n - 1;
        memmove(environment + pos, environment + pos + size, envused - pos - size);
        envused -= size;
    }
    if (len) {
        memcpy(environment + envused, name, n);
        environment[envused + n] = '=';
        strcpy(environment + envused + n + 1, eq + 1);
        envused += n + len + 2;
    }
}

static unsigned char path(const char *s, Path *p)
{
    unsigned int d = 0;
    unsigned char letter = 0;
    const char *q = s;
    p->dev = drive;
    if (toupper(s[0]) >= 'A' && toupper(s[0]) <= 'W' && s[1] == ':') {
        p->dev = toupper(s[0]) - 'A' + 8;
        s += 2;
        q = s;
        letter = 1;
    }
    while (isdigit(*q)) {
        d = d * 10 + *q - '0';
        ++q;
    }
    if (!letter && q > s && *q == ':') {
        if (d < 8 || d > 30) {
            error("Invalid drive specification");
            return 0;
        }
        p->dev = d;
        s = q + 1;
    }
    if (!p->dev) {
        error("No disk selected");
        return 0;
    }
    if (strlen(s) > 16) {
        error("File name too long");
        return 0;
    }
    if (strchr(s, ':') || strchr(s, ',') || strchr(s, '"')) {
        error("Invalid file name");
        return 0;
    }
    filename(s, p->name);
    return 1;
}
/* Closing a 1541 command channel also closes its data channels. Keep two
 * command channels resident so two-drive copying never closes a live file. */
static unsigned char statuschannel(unsigned char dev)
{
    unsigned char i;
    if (!dev) {
        error("No disk selected");
        return 0;
    }
    for (i = 0; i < 2; ++i)
        if (cmddev[i] == dev)
            return 14 + i;
    i = cmdslot;
    cmdslot ^= 1;
    if (cmddev[i])
        krnio_close(14 + i);
    cmddev[i] = 0;
    if (channel_open(14 + i, dev, 15, "") != 0) {
        krnio_close(14 + i);
        return 0;
    }
    cmddev[i] = dev;
    return 14 + i;
}
static unsigned char diskstatus(unsigned char dev, unsigned char report)
{
    int n;
    unsigned char code, lfn = statuschannel(dev);
    if (!lfn) {
        if (report)
            error("Not ready reading drive");
        return 255;
    }
    POKE(144, 0);
    n = channel_read(lfn, statusbuf, 63);
    POKE(144, 0);
    if (n <= 0) {
        if (report)
            error("Drive not ready");
        return 255;
    }
    statusbuf[n] = 0;
    code = atoi(statusbuf);
    if (code >= 20 && report) {
        error("Disk error:");
        error(statusbuf);
    }
    return code;
}
/* KERNAL ST belongs to the current serial operation, not to a file.
 * Preserve EOF per logical file while switching data/status channels. */
static int readio(unsigned char lfn, void *buf, unsigned int size)
{
    int n;
    unsigned char st;
    if (eof[lfn])
        return 0;
    POKE(144, 0);
    n = channel_read(lfn, buf, size);
    st = PEEK(144);
    if (st & 64)
        eof[lfn] = 1;
    if (st & 0xbf)
        return -1;
    return n;
}
/* SET only stores the value; startup applies it after AUTOEXEC unwinds. */
static void startupprompt(void)
{
    const char *value = envget("PROMPT");
    if (value)
        strcpy(prompttext, value);
}
/* Parse all three colors before changing any display state. */
static void startupcolor(void)
{
    const char *s = envget("COLOR");
    unsigned char values[3], i, n;
    if (!s)
        return;
    for (i = 0; i < 3; ++i) {
        while (*s == ' ')
            ++s;
        if (!isdigit(*s))
            goto invalid;
        n = 0;
        do {
            n = n * 10 + *s++ - '0';
            if (n > 15)
                goto invalid;
        } while (isdigit(*s));
        values[i] = n;
        while (*s == ' ')
            ++s;
        if (i < 2) {
            if (*s++ != ',')
                goto invalid;
        } else if (*s)
            goto invalid;
    }
    fg = values[0];
    bg = values[1];
    bd = values[2];
    colors();
    /* Recolor text already printed by AUTOEXEC without changing its glyphs. */
    memset((void *)0xd800, fg, 1000);
    return;
invalid:
    error("Invalid color");
}
/* Apply once after AUTOEXEC unwinds, always using the startup disk.
 * MCPI v1 patches shared text slots and the backslash slot. Staging beneath
 * KERNAL keeps the default RAM font intact until validation completes. */
static void startupcharset(unsigned char device)
{
    char *v = envget("CHARSET");
    char name[17];
    unsigned char count, i, j, code, previous = 0;
    unsigned int sum = 0, address;
    if (!v)
        return;
    while (*v == ' ')
        ++v;
    address = strlen(v);
    while (address && v[address - 1] == ' ')
        --address;
    if (!address)
        return;
    if (address > 12) {
        error("Invalid charset name");
        return;
    }
    memcpy(name, v, address);
    name[address] = 0;
    filename(name, name);
    strcat(name, ".cpi");
    if (!device) {
        error("No disk selected");
        return;
    }
    eof[2] = 0;
    snprintf(diskcmd, sizeof(fmtbuf), "%s,s,r", name);
    if (channel_open(2, device, 2, diskcmd))
        goto failed;
    if (diskstatus(device, 1) >= 20)
        goto failed;
    if (readio(2, io, 6) != 6 || io[0] != 77 || io[1] != 67 || io[2] != 80 || io[3] != 73 ||
        io[4] != 1 || !io[5] || io[5] > 88)
        goto failed;
    count = io[5];
    for (i = 0; i < count; ++i) {
        if (readio(2, io, 9) != 9)
            goto failed;
        code = io[0];
        if ((i && code <= previous) || !(code <= 27 || code == 29 || (code >= 32 && code <= 63) ||
                                         (code >= 65 && code <= 90) || code == 96))
            goto failed;
        previous = code;
        address = 0xf000 + (unsigned int)code * 8;
        sum += code;
        for (j = 0; j < 8; ++j) {
            sum += io[j + 1];
            POKE(address + j, io[j + 1]);
            POKE(address + 1024 + j, io[j + 1] ^ 255);
        }
    }
    if (readio(2, io, 2) != 2 || sum != ((unsigned int)io[1] * 256 + io[0]) ||
        readio(2, io, 1) != 0)
        goto failed;
    krnio_close(2);
    charset_commit();
    return;
failed:
    krnio_close(2);
    uppername(name, name);
    snprintf(fmtbuf, sizeof(fmtbuf), "Cannot load %s", name);
    error(fmtbuf);
}
static unsigned char command(unsigned char dev, const char *s)
{
    unsigned char lfn = statuschannel(dev);
    if (!lfn) {
        error("Drive not ready");
        return 0;
    }
    POKE(144, 0);
    if (channel_write(lfn, s, strlen(s)) != (int)strlen(s)) {
        error("Drive not ready");
        return 0;
    }
    cachevalid = 0;
    return diskstatus(dev, 1) < 20;
}
static unsigned char directory(unsigned char dev)
{
    struct DirectoryEntry ent;
    unsigned char r;
    if (!dev) {
        error("No disk selected");
        return 0;
    }
    count = 0;
    cachevalid = 0;
    cachedev = dev;
    freeblocks = 0;
    if (drivetype(dev, 0) == 2 && !command(dev, "u0>m1"))
        return 0;
    if (directory_open(2, dev) != 0) {
        krnio_close(2);
        error("Drive not ready");
        return 0;
    }
    r = directory_read(2, &ent);
    if (r) {
        krnio_close(2);
        error("Error reading directory");
        return 0;
    }
    strcpy(volume, ent.name);
    while (!(r = directory_read(2, &ent))) {
        if (count == MAXFILES) {
            krnio_close(2);
            error("Directory too large");
            return 0;
        }
        strcpy(files[count].name, ent.name);
        files[count].blocks = ent.size;
        files[count].type = ent.type;
        ++count;
    }
    krnio_close(2);
    if (r != 2) {
        error("Error reading directory");
        return 0;
    }
    freeblocks = ent.size;
    cachevalid = 1;
    return 1;
}
static int findfile(const Path *p)
{
    unsigned int i;
    if (!cachevalid || cachedev != p->dev)
        if (!directory(p->dev))
            return -2;
    for (i = 0; i < count; ++i)
        if (!strcmp(files[i].name, p->name))
            return i;
    return -1;
}
static unsigned char match(const char *p, const char *s)
{
    while (*p) {
        if (*p == '*') {
            do {
                if (match(p + 1, s))
                    return 1;
            } while (*s++);
            return 0;
        }
        if (!*s || (*p != '?' && *p != *s))
            return 0;
        ++p;
        ++s;
    }
    return !*s;
}
static const char *typename(unsigned char t)
{
    switch (t) {
    case CBM_T_DEL:
        return "DEL";
    case CBM_T_PRG:
        return "PRG";
    case CBM_T_SEQ:
        return "SEQ";
    case CBM_T_USR:
        return "USR";
    case CBM_T_REL:
        return "REL";
    default:
        return "???";
    }
}
static unsigned char scratch(const Path *p)
{
    snprintf(diskcmd, sizeof(diskcmd), "s0:%s", p->name);
    return command(p->dev, diskcmd);
}
static unsigned char preparewrite(const Path *p)
{
    int i;
    if (!p->name[0] || strchr(p->name, '*') || strchr(p->name, '?')) {
        error("Invalid destination");
        return 0;
    }
    cachevalid = 0;
    i = findfile(p);
    if (i == -2)
        return 0;
    if (i >= 0) {
        if (!yesno("Overwrite existing file"))
            return 0;
        if (editprompt)
            editsaving();
        if (!scratch(p))
            return 0;
    }
    return 1;
}
/* Reuse metadata already obtained during this operation. */
static unsigned char openreadtype(const Path *p, unsigned char lfn, unsigned char type)
{
    char t = 's';
    if (type == CBM_T_PRG)
        t = 'p';
    else if (type == CBM_T_USR)
        t = 'u';
    else if (type != CBM_T_SEQ) {
        error("Unsupported file type");
        return 0;
    }
    snprintf(diskcmd, sizeof(diskcmd), "0:%s,%c,r", p->name, t);
    if (channel_open(lfn, p->dev, 2, diskcmd) != 0) {
        krnio_close(lfn);
        error("File not found");
        return 0;
    }
    if (diskstatus(p->dev, 1) >= 20) {
        krnio_close(lfn);
        return 0;
    }
    eof[lfn] = 0;
    return 1;
}
static unsigned char openread(const Path *p, unsigned char lfn)
{
    int i = findfile(p);
    if (i < 0) {
        if (i == -1)
            error("File not found");
        return 0;
    }
    return openreadtype(p, lfn, files[i].type);
}
static unsigned char openwrite(const Path *p, unsigned char type)
{
    char t = 's';
    if (!p->dev) {
        error("No disk selected");
        return 0;
    }
    if (type == CBM_T_PRG)
        t = 'p';
    else if (type == CBM_T_USR)
        t = 'u';
    snprintf(diskcmd, sizeof(diskcmd), "0:%s,%c,w", p->name, t);
    if (channel_open(3, p->dev, 3, diskcmd) != 0) {
        krnio_close(3);
        error("Write fault error");
        return 0;
    }
    if (diskstatus(p->dev, 1) >= 20) {
        krnio_close(3);
        return 0;
    }
    return 1;
}

/* One-row horizontal viewport, with an 64-character command behind it. */
static unsigned char input(char *buf, unsigned int max, unsigned char recall)
{
    unsigned int len = 0, pos = 0, view = 0, start = 0, i, n;
    unsigned char x = ox, y = oy, w = 39 - ox, c, oldmod = 0;
    unsigned char h = histcount, dirty = 1, comp = 0;
    unsigned int ci = 0;
    static char token[LINE];
    char prefix[17], shown[40], lead[5];
    unsigned char mod, quoted;
    Path cp;
    clock_t blink;
    unsigned char visible = 1;
    /* Leave room for one input character and its caret after a long prompt. */
    if (!w) {
        newline();
        x = ox;
        y = oy;
        w = 39;
    }
    buf[0] = 0;
    memset(rawline, 0, sizeof(rawline));
    textcursor(0);
    caret_init();
    blink = clock();
    for (;;) {
        if (dirty) {
            len = strlen(buf);
            if (pos < view)
                view = pos;
            if (pos >= view + w)
                view = pos - w + 1;
            memset(shown, ' ', w);
            shown[w] = 0;
            n = len - view;
            if (n > w)
                n = w;
            memcpy(shown, buf + view, n);
            for (i = 0; i < n; ++i) {
                c = shown[i];
                if (rawget(rawline, view + i))
                    c = toupper(c);
                if (c == 96)
                    c = ' ';
                if (c < 32 || (c >= 128 && c < 160))
                    c = '.';
                shown[i] = c;
            }
            gotoxy(x, y);
            screen_puts(shown);
            gotoxy(x + pos - view, y);
            caret_show(x + pos - view, y);
            visible = 1;
            blink = clock();
            dirty = 0;
        }
        if ((clock_t)(clock() - blink) >= CLOCKS_PER_SEC / 2) {
            visible = !visible;
            blink = clock();
            if (visible)
                caret_show(x + pos - view, y);
            else
                caret_hide();
        }
        mod = PEEK(653) & 2;
        if (recall && mod && !oldmod) {
            oldmod = mod;
            if (!comp) {
                /* Completion is only offered after a command token. */
                start = 0;
                quoted = 0;
                for (i = 0; i < pos; ++i) {
                    if (buf[i] == '"')
                        quoted = !quoted;
                    if (buf[i] == ' ' && !quoted)
                        start = i + 1;
                }
                if (!start) {
                    if (!pos || pos != len || len + 1 >= max)
                        continue;
                    buf[pos++] = ' ';
                    buf[pos] = 0;
                    start = pos;
                    dirty = 1;
                }
                n = 0;
                for (i = start; i < pos; ++i)
                    if (buf[i] != '"')
                        token[n++] = buf[i];
                token[n] = 0;
                if (!path(token, &cp)) {
                    dirty = 1;
                    continue;
                }
                strcpy(prefix, cp.name);
                lead[0] = 0;
                if (strchr(token, ':'))
                    snprintf(lead, sizeof(lead), "%s:", drivename(cp.dev));
                ci = 0;
                if (!cachevalid || cachedev != cp.dev) {
                    caret_hide();
                    /* Successful directory reads are silent: keep this row. */
                    ox = 0;
                    oy = y;
                    if (!directory(cp.dev)) {
                        showprompt();
                        if (ox == 39)
                            newline();
                        x = ox;
                        y = oy;
                        w = 39 - x;
                        dirty = 1;
                        continue;
                    }
                    dirty = 1;
                }
                comp = 1;
            }
            for (i = 0; i < count; ++i) {
                n = ci++;
                if (ci >= count)
                    ci = 0;
                if (!strncmp(files[n].name, prefix, strlen(prefix))) {
                    if (start + strlen(files[n].name) + strlen(lead) + 2 < max) {
                        snprintf(buf + start, max - start, "\"%s%s\"", lead, files[n].name);
                        for (i = start; i < LINE; ++i)
                            rawset(rawline, i, 0);
                        for (i = start + 1 + strlen(lead); i < strlen(buf) - 1; ++i)
                            rawset(rawline, i, 1);
                        pos = strlen(buf);
                        dirty = 1;
                    }
                    break;
                }
            }
            continue;
        }
        oldmod = mod;
        if (!kbhit())
            continue;
        c = getch();
        comp = 0;
        if (c == CH_ENTER || c == CH_STOP) {
            caret_hide();
            ox = 0;
            oy = y;
            if (!editprompt)
                newline();
            if (c == CH_STOP) {
                buf[0] = 0;
                return 0;
            }
            return 1;
        }
        if (recall && (c == CH_CURS_UP || c == CH_CURS_DOWN)) {
            if (h == histcount) {
                strcpy(draft, buf);
                memcpy(rawdraft, rawline, RAWMAP);
            }
            if (c == CH_CURS_UP && h)
                --h;
            if (c == CH_CURS_DOWN && h < histcount)
                ++h;
            if (h == histcount) {
                strcpy(buf, draft);
                memcpy(rawline, rawdraft, RAWMAP);
            } else {
                i = (histnext + 10 - histcount + h) % 10;
                strcpy(buf, history[i]);
                memcpy(rawline, rawhistory[i], RAWMAP);
            }
            pos = strlen(buf);
            dirty = 1;
            continue;
        }
        if (c == CH_CURS_LEFT) {
            if (pos)
                --pos;
        } else if (c == CH_CURS_RIGHT) {
            if (pos < len)
                ++pos;
        } else if (c == CH_HOME)
            pos = 0;
        else if (c == CH_DEL) {
            if (pos) {
                rawedit(pos - 1, len, 1);
                memmove(buf + pos - 1, buf + pos, len - pos + 1);
                --pos;
            }
        } else if (c >= 32 && (c < 128 || c >= 160) && len < max - 1) {
            rawedit(pos, len, 0);
            memmove(buf + pos + 1, buf + pos, len - pos + 1);
            buf[pos++] = c;
        }
        dirty = 1;
    }
}

/* Compare cached entries without disturbing physical directory order. */
static int dircompare(unsigned int a, unsigned int b, unsigned char flags)
{
    int result = 0;
    if (flags & 16)
        result = strcmp(typename(files[a].type), typename(files[b].type));
    else if ((flags & 32) && files[a].blocks != files[b].blocks)
        result = files[a].blocks < files[b].blocks ? -1 : 1;
    if (!result)
        result = strcmp(files[a].name, files[b].name);
    return flags & 64 ? -result : result;
}
static void dircmd(void)
{
    unsigned char bare = 0, lower = 0, sort = 0, wide = 0, col = 0;
    unsigned int i, j, total = 0, tmp;
    unsigned int *order = workspace.order;
    unsigned int usedblocks = 0;
    char shown[17];
    unsigned char flags = 0, explicit = 0;
    char *defaults = envready ? envget("DIRCMD") : (char *)0;
    for (i = 1; i < argc; ++i)
        if (args[i][0] == '/')
            explicit = 1;
    if (!explicit && defaults)
        dirdefaults(defaults, &flags);
    p1.dev = drive;
    strcpy(p1.name, "*");
    for (i = 1; i < argc; ++i) {
        if (args[i][0] == '/') {
            if (!diroption(args[i], &flags)) {
                error("Invalid switch");
                return;
            }
        } else if (!path(args[i], &p1))
            return;
    }
    bare = flags & 1;
    lower = flags & 2;
    sort = flags & 4;
    wide = flags & 8;
    if (!p1.name[0])
        strcpy(p1.name, "*");
    if (!directory(p1.dev))
        return;
    if (!bare) {
        volumeheader(p1.dev);
        print(" Directory of %s:\n\n", drivename(p1.dev));
    }
    for (i = 0; i < count; ++i)
        order[i] = i;
    if (sort)
        for (i = 1; i < count; ++i) {
            tmp = order[i];
            j = i;
            while (j > ((flags & 128) ? 1 : 0) && dircompare(order[j - 1], tmp, flags) > 0) {
                order[j] = order[j - 1];
                --j;
            }
            order[j] = tmp;
        }
    pagelines = 5;
    for (i = 0; i < count; ++i) {
        j = order[i];
        if (!match(p1.name, files[j].name))
            continue;
        ++total;
        usedblocks += files[j].blocks;
        if (lower)
            strcpy(shown, files[j].name);
        else
            uppername(files[j].name, shown);
        if (bare)
            say(shown);
        else if (wide) {
            print("%-19s", shown);
            if (++col == 2) {
                newline();
                col = 0;
            }
        } else {
            print("%-17s%s%8s", shown, typename(files[j].type), allocated(files[j].blocks));
            print(" (%3s bl)", decimal(files[j].blocks));
            /* Short block labels also fit four-digit free-block counts. */
            if (redirected ? outputcol : ox)
                newline();
        }
        if ((!wide || bare || !col) && !page())
            break;
    }
    if (col)
        newline();
    if (!bare && !aborted) {
        print("%3u File(s)%11s bytes", total, allocated(usedblocks));
        print(" (%3s bl)\n", decimal(usedblocks));
        print("%17s bytes free", allocated(freeblocks));
        print(" (%3s bl)\n", decimal(freeblocks));
    }
}

static unsigned char copyfile(unsigned char moving)
{
    int n, i;
    unsigned char type, ok = 1;
    if (!p2.name[0])
        strcpy(p2.name, p1.name);
    if (p1.dev == p2.dev && !strcmp(p1.name, p2.name)) {
        say("File cannot be copied onto itself");
        return 0;
    }
    cachevalid = 0;
    i = findfile(&p1);
    if (i < 0) {
        error("File not found");
        return 0;
    }
    type = files[i].type;
    if (type == CBM_T_REL) {
        ok = copyrel();
    } else {
        if (type != CBM_T_PRG && type != CBM_T_SEQ && type != CBM_T_USR) {
            error("Unsupported file type");
            return 0;
        }
        if (!preparewrite(&p2))
            return 0;
        if (p1.dev == p2.dev) {
            snprintf(diskcmd, sizeof(diskcmd), "c0:%s=0:%s", p2.name, p1.name);
            ok = command(p1.dev, diskcmd);
        } else {
            if (!openreadtype(&p1, 2, type))
                return 0;
            if (!openwrite(&p2, type)) {
                krnio_close(2);
                return 0;
            }
            uppername(p1.name, statusbuf);
            outs(statusbuf);
            while ((n = readio(2, io, sizeof(io))) > 0) {
                if (channel_write(3, io, n) != n || stop()) {
                    ok = 0;
                    break;
                }
            }
            if (n < 0)
                ok = 0;
            krnio_close(2);
            krnio_close(3);
            newline();
            if (diskstatus(p2.dev, 1) >= 20)
                ok = 0;
        }
    }
    cachevalid = 0;
    if (!ok) {
        say("Copy not completed");
        return 0;
    }
    if (moving && !scratch(&p1))
        return 0;
    return 1;
}

static void copycmd(unsigned char moving)
{
    unsigned int i, limit, total = 0;
    char pattern[17];
    if (argc != 3) {
        error("Syntax: COPY source destination");
        return;
    }
    if (!moving && strchr(args[1], '+')) {
        concatcmd();
        return;
    }
    if (!path(args[1], &p1) || !path(args[2], &p2))
        return;
    if (!moving && strpbrk(p1.name, "*?")) {
        if (p2.name[0]) {
            error("Wildcards require a destination drive");
            return;
        }
        if (p1.dev == p2.dev) {
            say("File cannot be copied onto itself");
            return;
        }
        strcpy(pattern, p1.name);
        if (!directory(p1.dev))
            return;
        limit = count;
        /* Destination checks replace the shared directory cache. Reload the
         * unchanged source before using the next source directory index. */
        for (i = 0; i < limit && !aborted; ++i) {
            if (!cachevalid || cachedev != p1.dev)
                if (!directory(p1.dev))
                    return;
            if (i >= count)
                break;
            if (!match(pattern, files[i].name))
                continue;
            if (files[i].type != CBM_T_PRG && files[i].type != CBM_T_SEQ &&
                files[i].type != CBM_T_USR && files[i].type != CBM_T_REL)
                continue;
            strcpy(p1.name, files[i].name);
            strcpy(p2.name, p1.name);
            if (!copyfile(0))
                return;
            ++total;
            if (stop())
                break;
        }
        if (!total && !aborted) {
            error("File not found");
            return;
        }
        print("        %u file(s) copied.\n", total);
    } else if (copyfile(moving))
        say(moving ? "        1 file(s) moved." : "        1 file(s) copied.");
}

static void typecmd(unsigned char printer)
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
        krnio_close(2);
        krnio_close(4);
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
    krnio_close(2);
    if (printer)
        krnio_close(4);
    if (!redirected && ox)
        newline();
    if (n < 0)
        error("Read fault error");
}

/* Reuse EDIT's idle buffer for two disk cursors and a sliding search window.
 * The second cursor preserves full lines without imposing a line-size limit. */
static int findbyte(unsigned char reader, unsigned int *pos, unsigned int *len)
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
static void findcmd(void)
{
    unsigned char i, flags = 0, size, used = 0, hit, lastcr = 0, pending = 0, skip = 0, selected,
                     col;
    unsigned int pos[2], len[2];
    unsigned long number = 0, total = 0, digits;
    int c, d;
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
            krnio_close(2);
            krnio_close(3);
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
        c = findbyte(0, pos, len);
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
                    d = findbyte(1, pos, len);
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
    krnio_close(2);
    if (!(flags & 2))
        krnio_close(3);
    if (c == -2)
        error("Read fault error");
    else if ((flags & 2) && !aborted)
        print(": %s\n", decimal(total));
}

static void renderedit(void)
{
    unsigned char r, c;
    for (r = 0; r < EDITROWS; ++r) {
        gotoxy(0, r);
        for (c = 0; c < 40; ++c)
            displayc(editbuf[(unsigned int)r * 40 + c]);
    }
}
static void editcmd(void)
{
    unsigned int pos = 0, idx, last, filled;
    unsigned char x = 0, y = 0, c, prevcr = 0, overflow = 0, r, end, wrapped = 0, redraw;
    int n, i, exists = -1;
    clock_t blink;
    unsigned char visible, oldx, oldy, insertheld = 0, insertdown;
    p1.dev = drive;
    p1.name[0] = 0;
    for (i = 1; i < argc; ++i) {
        if (args[i][0] == '/') {
            error("Invalid switch");
            return;
        } else if (p1.name[0]) {
            say("Too many parameters");
            return;
        } else if (!path(args[i], &p1))
            return;
    }
    memset(editbuf, ' ', sizeof(editbuf));
    if (p1.name[0]) {
        cachevalid = 0;
        exists = findfile(&p1);
        if (exists == -2)
            return;
        if (exists >= 0) {
            if (files[exists].type != CBM_T_SEQ) {
                say("EDIT requires a SEQ text file");
                return;
            }
            if (!openreadtype(&p1, 2, CBM_T_SEQ))
                return;
            while (!overflow && (n = readio(2, io, 256)) > 0)
                for (i = 0; i < n; ++i) {
                    c = io[i];
                    if (c == 10 && prevcr) {
                        prevcr = 0;
                        continue;
                    }
                    prevcr = c == 13;
                    if (c == 10 || c == 13) {
                        /* A full row has already advanced to the next row. */
                        if (!wrapped) {
                            pos = (pos / 40 + 1) * 40;
                            x = 0;
                        }
                        wrapped = 0;
                        if (pos > sizeof(editbuf)) {
                            overflow = 1;
                            break;
                        }
                    } else {
                        if (pos >= sizeof(editbuf)) {
                            overflow = 1;
                            break;
                        }
                        editbuf[pos++] = (c >= 32 && (c < 128 || c >= 160)) ? c : '.';
                        x = pos % 40;
                        wrapped = !x;
                    }
                }
            krnio_close(2);
            if (overflow || n < 0) {
                say("File too large or unreadable");
                return;
            }
        }
    }
    clear();
    renderedit();
    x = y = 0;
    textcursor(0);
    caret_init();
    editstatus();
    outs(" 01:01  ");
    if (p1.name[0]) {
        uppername(p1.name, statusbuf);
        outs(statusbuf);
    } else
        outs("Untitled");
    /* Leave one trailing space; the longest filename still has two before it. */
    ox = 26;
    outs("RUN/STOP:quit");
    screen_reverse(0);
    for (;;) {
        caret_show(x, y);
        visible = 1;
        blink = clock();
        for (;;) {
            /* KERNAL suppresses CTRL+INST/DEL ($FF in its control table).
               Read the scanned key index instead; trigger once per press. */
            insertdown = (PEEK(197) == 0 && (PEEK(653) & 4));
            if (insertdown && !insertheld) {
                insertheld = 1;
                c = 0;
                break;
            }
            insertheld = insertdown;
            if (kbhit()) {
                c = getch();
                break;
            }
            if ((clock_t)(clock() - blink) >= CLOCKS_PER_SEC / 2) {
                visible = !visible;
                blink = clock();
                if (visible)
                    caret_show(x, y);
                else
                    caret_hide();
            }
        }
        caret_hide();
        idx = (unsigned int)y * 40 + x;
        redraw = 0;
        if (c == CH_STOP)
            break;
        oldx = x;
        oldy = y;
        if (c == CH_CURS_LEFT) {
            if (x)
                --x;
            else if (y) {
                --y;
                x = 39;
            }
        } else if (c == CH_CURS_RIGHT) {
            if (x < 39)
                ++x;
            else if (y < 23) {
                ++y;
                x = 0;
            }
        } else if (c == CH_CURS_UP) {
            if (y)
                --y;
        } else if (c == CH_CURS_DOWN) {
            if (y < 23)
                ++y;
        } else if (c == CH_HOME)
            x = y = 0;
        else if (c == CH_ENTER) {
            x = 0;
            if (y < 23)
                ++y;
        } else if (c == 0) {
            /* CTRL + INST/DEL: make room only if no bottom-row text is lost. */
            for (r = 0; r < 40 && editbuf[sizeof(editbuf) - 40 + r] == ' '; ++r) {
            }
            if (r == 40) {
                idx = (unsigned int)y * 40;
                memmove(editbuf + idx + 40, editbuf + idx, sizeof(editbuf) - idx - 40);
                memset(editbuf + idx, ' ', 40);
                x = 0;
                renderedit();
            }
        } else if (c == CH_DEL) {
            if (x) {
                --x;
                --idx;
                memmove(editbuf + idx, editbuf + idx + 1, 39 - x);
                editbuf[(unsigned int)y * 40 + 39] = ' ';
                redraw = 1;
            }
        } else if (c == CH_INS) {
            memmove(editbuf + idx + 1, editbuf + idx, 39 - x);
            editbuf[idx] = ' ';
            redraw = 1;
        } else if (c >= 32 && (c < 128 || c >= 160)) {
            editbuf[idx] = c;
            gotoxy(x, y);
            displayc(c);
            if (x < 39)
                ++x;
            else if (y < 23) {
                x = 0;
                ++y;
            }
        }
        if (redraw) {
            gotoxy(0, y);
            for (r = 0; r < 40; ++r)
                displayc(editbuf[(unsigned int)y * 40 + r]);
        }
        if (y != oldy)
            editnumber(screenbase + 961, y + 1);
        if (x != oldx)
            editnumber(screenbase + 964, x + 1);
    }
    caret_hide();
    editprompt = 1;
    if (!yesno("Save changes"))
        goto done;
    if (!p1.name[0]) {
        editstatus();
        outs("File name: ");
        if (!input(line, LINE, 0) || !path(line, &p1) || !p1.name[0])
            goto done;
    }
    editsaving();
    if (!preparewrite(&p1) || !openwrite(&p1, CBM_T_SEQ))
        goto done;
    last = sizeof(editbuf);
    while (last && editbuf[last - 1] == ' ')
        --last;
    /* Keep the existing trimmed-line/CR format, batching serial writes. */
    n = 1;
    filled = 0;
    for (r = 0; r < EDITROWS && (unsigned int)r * 40 < last; ++r) {
        end = 40;
        while (end && editbuf[(unsigned int)r * 40 + end - 1] == ' ')
            --end;
        if (filled + end + 1 > sizeof(io)) {
            if (channel_write(3, io, filled) != (int)filled) {
                n = -1;
                break;
            }
            filled = 0;
        }
        memcpy(io + filled, editbuf + (unsigned int)r * 40, end);
        filled += end;
        io[filled++] = 13;
    }
    if (n >= 0 && filled && channel_write(3, io, filled) != (int)filled)
        n = -1;
    krnio_close(3);
    cachevalid = 0;
    if (diskstatus(p1.dev, 1) < 20 && n < 0)
        error("Write fault error");
done:
    screen_reverse(0);
    if (editprompt)
        clear();
    editprompt = 0;
}

static void runbatch(void)
{
    int n;
    if (batching) {
        say("Nested batch files not supported");
        return;
    }
    if (!openread(&p1, 2))
        return;
    n = readio(2, batch, BATCHMAX);
    batchlen = n > 0 ? n : 0;
    if (n == BATCHMAX && readio(2, io, 1) > 0)
        n = -1;
    krnio_close(2);
    if (n < 0) {
        say("Batch file too large or unreadable");
        return;
    }
    batch[batchlen] = 0;
    batchpos = 0;
    batching = 1;
}
static void runcmd(void)
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
    launch();
}

/* CBM DOS raw block interface. Each drive uses secondary address 2;
 * separate host logical files let two drives keep their buffers open. */
static unsigned char blockchannel(unsigned char dev, unsigned char lfn, unsigned char track,
                                  unsigned char sector, unsigned char writing)
{
    if (writing) {
        if (!command(dev, "b-p:2 0"))
            return 0;
        if (channel_write(lfn, io, 256) != 256)
            return 0;
    }
    snprintf(diskcmd, sizeof(diskcmd), writing ? "u2:2 0 %u %u" : "u1:2 0 %u %u", track, sector);
    if (!command(dev, diskcmd))
        return 0;
    eof[lfn] = 0; /* U1 resets the direct-access buffer, including its EOF. */
    if (!writing && readio(lfn, io, 256) != 256)
        return 0;
    return 1;
}
static unsigned char blockio(unsigned char dev, unsigned char track, unsigned char sector,
                             unsigned char writing)
{
    return blockchannel(dev, 2, track, sector, writing);
}
static unsigned char rawchannel(unsigned char dev, unsigned char lfn)
{
    if (!dev) {
        error("No disk selected");
        return 0;
    }
    if (channel_open(lfn, dev, 2, "#") != 0) {
        krnio_close(lfn);
        error("Drive not ready");
        return 0;
    }
    eof[lfn] = 0;
    POKE(144, 0);
    return 1;
}
static unsigned char rawopen(unsigned char dev)
{
    return rawchannel(dev, 2);
}
/* Read-only stock ROM identification: compressed DOS model strings have the
 * final digit's high bit set. Includes 1541-II and 1571CR. Never reset a drive:
 * DIR may be running with a redirected output file already open. Unknown ROMs
 * retain ordinary DOS file access, but cannot perform raw disk operations. */
static unsigned char drivetype(unsigned char dev, unsigned char report)
{
    unsigned char lfn = statuschannel(dev), i;
    unsigned char probe[6] = {'m', '-', 'r', 0xc4, 0xe5, 4}, signature[4];
    if (!lfn)
        return 0;
    for (i = 0; i < 2; ++i) {
        POKE(144, 0);
        if (channel_write(lfn, probe, 6) != 6 || channel_read(lfn, signature, 4) != 4)
            break;
        if (signature[0] == '1' && signature[1] == '5' && signature[3] == 0xb1) {
            if (!i && signature[2] == '4')
                return 1;
            if (!i && signature[2] == '7')
                return 2;
            if (i && signature[2] == '8')
                return 3;
        }
        probe[3] = 0xe7;
        probe[4] = 0xa6;
    }
    if (report)
        error("Unsupported drive type");
    return 0;
}
static unsigned char tracksectors(unsigned char track, unsigned char tracks)
{
    if (tracks == 80)
        return 40;
    if (track > 35)
        track -= 35;
    return track <= 17 ? 21 : track <= 24 ? 19 : track <= 30 ? 18 : 17;
}
static unsigned char bam(unsigned char dev)
{
    unsigned char ok, type = drivetype(dev, 1);
    if (!type)
        return 0;
    headertrack = type == 3 ? 40 : 18;
    labeloff = type == 3 ? 4 : 144;
    idoff = type == 3 ? 22 : 162;
    if (type == 2 && !command(dev, "u0>m1"))
        return 0;
    if (!rawopen(dev))
        return 0;
    ok = blockio(dev, headertrack, 0, 0);
    krnio_close(2);
    disktracks = type == 3 ? 80 : type == 2 && (io[3] & 128) ? 70 : 35;
    if (ok && ((type == 1 && (io[3] & 128)) || io[2] != (type == 3 ? 0x44 : 0x41) ||
               io[0] != headertrack || io[1] != (type == 3 ? 3 : 1))) {
        error("Unsupported disk format");
        ok = 0;
    }
    return ok;
}
/* Read the source's data chain through a direct-access buffer, leaving the
 * drive's REL buffer available for the destination even on a single 1541.
 * DOS creates the destination side sectors; none of their links are copied.
 * editbuf is idle during COPY and holds one complete binary record. */
static unsigned char copyrel(void)
{
    static unsigned char tr, se, r, len, next, sector, ok, code, lfn, tracks, dirtrack;
    static unsigned int off, n, pos, record, guard;
    static char name[17], position[5];
    len = pos = guard = 0;
    ok = record = 1;
    if (!bam(p1.dev) || !rawopen(p1.dev))
        return 0;
    tr = io[0];
    se = io[1];
    tracks = disktracks;
    dirtrack = headertrack;
    while (tr && !len && ++guard <= tracksectors(dirtrack, tracks)) {
        if (tr != dirtrack || se >= tracksectors(tr, tracks))
            break;
        if (!blockio(p1.dev, tr, se, 0))
            break;
        tr = io[0];
        se = io[1];
        for (off = 0; off < 256; off += 32) {
            if ((io[off + 2] & 0x87) != 0x84)
                continue;
            memcpy(name, io + off + 5, 16);
            name[16] = 0;
            for (r = 16; r && (unsigned char)name[r - 1] == 160; --r)
                name[r - 1] = 0;
            if (strcmp(name, p1.name))
                continue;
            len = io[off + 23];
            tr = io[off + 3];
            se = io[off + 4];
            break;
        }
    }
    krnio_close(2);
    if (!len || len == 255 || !tr) {
        error("Invalid REL file");
        return 0;
    }
    if (!preparewrite(&p2) || !rawopen(p1.dev))
        return 0;
    snprintf(diskcmd, sizeof(diskcmd), "0:%s,l,%c", p2.name, len);
    if (channel_open(3, p2.dev, 3, diskcmd) != 0) {
        krnio_close(3);
        krnio_close(2);
        return 0;
    }
    if (diskstatus(p2.dev, 1) >= 20)
        ok = 0;
    lfn = statuschannel(p2.dev);
    guard = 0;
    uppername(p1.name, statusbuf);
    outs(statusbuf);
    while (ok && tr) {
        if (tr > tracks || se >= tracksectors(tr, tracks) ||
            ++guard > (tracks == 80   ? 3200
                       : tracks == 70 ? 1366
                                      : 683) ||
            !blockio(p1.dev, tr, se, 0)) {
            ok = 0;
            break;
        }
        next = io[0];
        sector = io[1];
        n = next ? 256 : (unsigned int)sector + 1;
        if (n < 2) {
            ok = 0;
            break;
        }
        for (off = 2; ok && off < n; ++off) {
            editbuf[pos++] = io[off];
            if (pos != len)
                continue;
            position[0] = 'p';
            position[1] = 96 + 3;
            position[2] = record;
            position[3] = record >> 8;
            position[4] = 1;
            POKE(144, 0);
            if (channel_write(lfn, position, 5) != 5) {
                ok = 0;
                break;
            }
            code = diskstatus(p2.dev, 0);
            /* Positioning beyond EOF is how DOS extends a REL file. */
            if (code >= 20 && code != 50) {
                error(statusbuf);
                ok = 0;
                break;
            }
            POKE(144, 0);
            if (channel_write(3, editbuf, len) != len || diskstatus(p2.dev, 1) >= 20) {
                ok = 0;
                break;
            }
            pos = 0;
            ++record;
            if (stop()) {
                ok = 0;
                break;
            }
        }
        tr = next;
        se = sector;
    }
    if (pos)
        ok = 0;
    krnio_close(3);
    krnio_close(2);
    newline();
    if (diskstatus(p2.dev, 1) >= 20)
        ok = 0;
    return ok;
}
static unsigned char validate;
static unsigned char reportoptions(unsigned char disk)
{
    unsigned char i, seenpath = 0;
    validate = 0;
    for (i = 1; i < argc; ++i) {
        if (disk && !stricmp(args[i], "/V"))
            validate = 1;
        else {
            if (args[i][0] == '/' || !disk || seenpath++)
                break;
            if (!path(args[i], &p1))
                return 0;
            if (p1.name[0])
                break;
        }
    }
    if (i < argc) {
        error("Invalid parameter");
        return 0;
    }
    return 1;
}
static unsigned int freememory(void)
{
    return SHELL_RAM_END - SHELL_STACK_SIZE - ((unsigned int)&BSSEnd);
}
static void memcmd(void)
{
    if (!reportoptions(0))
        return;
    print("%10s bytes total memory\n", decimal(65536UL));
    print("%10s bytes shell and workspace\n", decimal((unsigned int)&BSSEnd - 0x0801));
    print("%10s bytes reserved for C stack\n", decimal(SHELL_STACK_SIZE));
    print("%10s bytes free\n", decimal(freememory()));
    print("%10s bytes REU expanded memory\n", decimal((unsigned long)reu_size() * 1024UL));
}
/* Check every match before scratching: DOS silently skips locked files. */
static unsigned char deletable(const Path *p)
{
    struct DirectoryEntry ent;
    unsigned char r;
    if (!p->dev) {
        error("No disk selected");
        return 0;
    }
    if (directory_open(2, p->dev) != 0) {
        krnio_close(2);
        error("Drive not ready");
        return 0;
    }
    r = directory_read(2, &ent);
    if (!r)
        while (!(r = directory_read(2, &ent))) {
            if (ent.access == CBM_A_RO && match(p->name, ent.name)) {
                krnio_close(2);
                error("File is locked");
                return 0;
            }
        }
    krnio_close(2);
    if (r != 2) {
        error("Error reading directory");
        return 0;
    }
    return 1;
}
static void delcmd(void)
{
    unsigned char i, suppress = 0;
    char *name = 0;
    for (i = 1; i < argc; ++i) {
        if (!stricmp(args[i], "/P"))
            suppress = 1;
        else if (args[i][0] == '/' || name)
            break;
        else
            name = args[i];
    }
    if (i < argc || !name || !path(name, &p1) || !p1.name[0]) {
        error("Syntax: DEL filename [/P]");
        return;
    }
    if (!deletable(&p1))
        return;
    if (suppress || yesno(strchr(p1.name, '*') || strchr(p1.name, '?') ? "Delete all matching files"
                                                                       : "Delete this file"))
        scratch(&p1);
}
static void volcmd(unsigned char stats)
{
    unsigned int i;
    unsigned int used;
    char shown[17];
    p1.dev = drive;
    if (stats) {
        if (!reportoptions(1))
            return;
    } else if (argc > 2 || (argc == 2 && !path(args[1], &p1)))
        return;
    if (stats && validate) {
        say("Checking and fixing disk . . .");
        if (!command(p1.dev, "v0")) {
            error("Disk validation failed");
            return;
        }
        say("Disk validation complete.");
    }
    if (!directory(p1.dev))
        return;
    if (stats) {
        uppername(volume, shown);
        print("Volume %s\n", shown);
        if (!bam(p1.dev))
            return;
        print("Disk ID is %c%c\n\n", toupper(io[idoff]), toupper(io[idoff + 1]));
        used = 0;
        for (i = 0; i < count; ++i)
            used += files[i].blocks;
        print("%7s bytes total disk space\n", decimal(((unsigned long)used + freeblocks) * 256));
        print("%7s bytes allocated in %u files\n", allocated(used), count);
        print("%7s bytes available on disk\n\n", allocated(freeblocks));
        /* Exactly 40 columns: outc already advances to the next row. */
        outs("    256 bytes in each block (254 usable)");
        if (redirected)
            newline();
        print("%7s total blocks on disk\n", decimal((unsigned long)used + freeblocks));
        print("%7s available blocks on disk\n\n", decimal(freeblocks));
        print("%7s total bytes memory\n", decimal(65536UL));
        print("%7s bytes free\n", decimal(freememory()));
    } else
        volumeheader(p1.dev);
}
static void labelcmd(void)
{
    unsigned char i, a = 1;
    char name[17];
    p1.dev = drive;
    if (argc > 1 && strchr(args[1], ':')) {
        if (!path(args[1], &p1))
            return;
        if (p1.name[0]) {
            error("Invalid drive specification");
            return;
        }
        ++a;
    }
    if (argc > a + 1) {
        error("Syntax: LABEL [drive:] [name]");
        return;
    }
    if (argc == a + 1) {
        if (strlen(args[a]) > 16) {
            say("Volume label too long");
            return;
        }
        filename(args[a], name);
    } else {
        if (!directory(p1.dev) || !bam(p1.dev))
            return;
        uppername(volume, name);
        print("Volume in drive %s: is %s\n", drivename(p1.dev), name);
        print("Disk ID is %c%c\n", toupper(io[idoff]), toupper(io[idoff + 1]));
        outs("Volume label  (16 characters)? ");
        if (!input(line, 17, 0))
            return;
        filename(line, name);
    }
    if (!bam(p1.dev))
        return;
    for (i = 0; i < 16; ++i)
        io[labeloff + i] = 0xa0;
    memcpy(io + labeloff, name, strlen(name));
    if (!rawopen(p1.dev))
        return;
    i = blockio(p1.dev, headertrack, 0, 1);
    krnio_close(2);
    cachevalid = 0;
    if (i && command(p1.dev, "i0"))
        say("Volume label changed.");
}
static void formatcmd(void)
{
    char name[17], id[3];
    unsigned char type;
    if (argc != 2 || !path(args[1], &p1)) {
        error("Syntax: FORMAT drive:");
        return;
    }
    type = drivetype(p1.dev, 1);
    if (!type)
        return;
    print("Insert disk in drive %s:\n", drivename(p1.dev));
    say("All data on this disk will be lost!");
    if (!yesno("Proceed with format"))
        return;
    outs("Volume label (16 characters): ");
    if (!input(line, 17, 0))
        return;
    filename(line, name);
    if (!*name)
        strcpy(name, "MCS-DOS");
    outs("New disk ID (2 letters or digits): ");
    if (!input(line, LINE, 0))
        return;
    if (strlen(line) != 2 || !isalnum(line[0]) || !isalnum(line[1])) {
        say("Disk ID must be two letters or digits");
        return;
    }
    filename(line, id);
    say("Formatting...");
    if (type == 2 && !command(p1.dev, "u0>m1"))
        return;
    snprintf(diskcmd, sizeof(diskcmd), "n0:%s,%s", name, id);
    if (command(p1.dev, diskcmd))
        say("Format complete.");
}
static void diskidcmd(void)
{
    char id[3];
    unsigned char a = 1, ok, se;
    p1.dev = drive;
    p1.name[0] = 0;
    if (argc > 1 && strchr(args[1], ':')) {
        if (!path(args[1], &p1) || p1.name[0]) {
            error("Invalid drive specification");
            return;
        }
        ++a;
    }
    if (argc > a + 1) {
        error("Syntax: DISKID [drive:] [id]");
        return;
    }
    if (argc == a + 1) {
        if (strlen(args[a]) != 2) {
            say("Disk ID must be two letters or digits");
            return;
        }
        filename(args[a], id);
    } else {
        outs("New disk ID (2 letters or digits): ");
        if (!input(line, LINE, 0))
            return;
        if (strlen(line) != 2) {
            say("Disk ID must be two letters or digits");
            return;
        }
        filename(line, id);
    }
    if (!isalnum(id[0]) || !isalnum(id[1])) {
        error("Invalid disk ID");
        return;
    }
    if (!bam(p1.dev))
        return;
    io[idoff] = id[0];
    io[idoff + 1] = id[1];
    if (!rawopen(p1.dev))
        return;
    ok = blockio(p1.dev, headertrack, 0, 1);
    /* 1581 keeps two additional ID copies in its allocation-map sectors. */
    if (headertrack == 40)
        for (se = 1; se <= 2 && ok; ++se) {
            ok = blockio(p1.dev, 40, se, 0);
            if (ok) {
                io[4] = id[0];
                io[5] = id[1];
                ok = blockio(p1.dev, 40, se, 1);
            }
        }
    krnio_close(2);
    cachevalid = 0;
    if (ok && command(p1.dev, "i0"))
        say("Disk ID changed.");
}
static void diskcopycmd(void)
{
    unsigned char tr, se, sectors, ok = 1, type, other, tracks;
    char id[2];
    if (argc != 3 || !path(args[1], &p1) || !path(args[2], &p2)) {
        error("Syntax: DISKCOPY source: destination:");
        return;
    }
    if (p1.dev == p2.dev) {
        say("Two different drives required");
        return;
    }
    if (p1.name[0] || p2.name[0]) {
        error("Invalid drive specification");
        return;
    }
    type = drivetype(p1.dev, 1);
    other = drivetype(p2.dev, 1);
    if (!type || !other)
        return;
    if (type != other) {
        error("Incompatible drive type");
        return;
    }
    if (!bam(p1.dev))
        return;
    tracks = disktracks;
    id[0] = io[idoff];
    id[1] = io[idoff + 1];
    say("Destination disk will be overwritten.");
    if (!yesno("Proceed with disk copy"))
        return;
    if (type == 2 && !command(p2.dev, tracks == 70 ? "u0>m1" : "u0>m0"))
        return;
    snprintf(diskcmd, sizeof(diskcmd), "n0:mcs-copy,%c%c", id[0], id[1]);
    if (!command(p2.dev, diskcmd))
        return;
    /* Establish both status channels before opening persistent data buffers. */
    if (!statuschannel(p1.dev) || !statuschannel(p2.dev))
        return;
    if (!rawchannel(p1.dev, 2))
        return;
    if (!rawchannel(p2.dev, 3)) {
        krnio_close(2);
        return;
    }
    for (tr = 1; tr <= tracks && ok; ++tr) {
        print("Copying track %u of %u\n", tr, tracks);
        sectors = tracksectors(tr, tracks);
        for (se = 0; se < sectors; ++se) {
            ok = blockchannel(p1.dev, 2, tr, se, 0);
            if (!ok)
                break;
            ok = blockchannel(p2.dev, 3, tr, se, 1);
            if (stop())
                ok = 0;
            if (!ok)
                break;
        }
    }
    krnio_close(3);
    krnio_close(2);
    command(p2.dev, "i0");
    cachevalid = 0;
    say(ok ? "Copy complete." : "Disk copy not completed.");
}

/* Native lock bit: preserve every other directory byte. */
static void attribcmd(void)
{
    unsigned char a = 1, mode = 0, track, sector, n, dirty, found = 0, visited[5];
    unsigned int offset;
    char name[17], shown[17];
    if (argc > 1 && (!stricmp(args[1], "+R") || !stricmp(args[1], "-R"))) {
        mode = args[1][0] == '+' ? 1 : 2;
        ++a;
    }
    if (argc > a + 1 ||
        (argc > a && (args[a][0] == '/' || args[a][0] == '+' || args[a][0] == '-'))) {
        error("Invalid parameter");
        return;
    }
    if (!path(argc > a ? args[a] : "", &p1))
        return;
    if (!p1.name[0])
        strcpy(p1.name, "*");
    if (!bam(p1.dev))
        return;
    track = io[0];
    sector = io[1];
    memset(visited, 0, sizeof(visited));
    pagelines = 0;
    if (!rawopen(p1.dev))
        return;
    while (track) {
        if (track != headertrack || sector < (headertrack == 40 ? 3 : 1) ||
            sector >= tracksectors(track, disktracks) ||
            (visited[sector / 8] & (1 << (sector % 8)))) {
            error("Invalid directory chain");
            break;
        }
        visited[sector / 8] |= 1 << (sector % 8);
        if (!blockio(p1.dev, track, sector, 0))
            break;
        dirty = 0;
        for (offset = 2; offset < 256; offset += 32) {
            if (!(io[offset] & 7))
                continue;
            for (n = 0; n < 16 && io[offset + 3 + n] != 0xa0; ++n)
                name[n] = io[offset + 3 + n];
            name[n] = 0;
            if (!match(p1.name, name))
                continue;
            found = 1;
            if (mode) {
                n = mode == 1 ? io[offset] | 0x40 : io[offset] & 0xbf;
                if (n != io[offset]) {
                    io[offset] = n;
                    dirty = 1;
                }
            } else {
                uppername(name, shown);
                print("  %c    %s\n", io[offset] & 0x40 ? 'R' : ' ', shown);
                if (!page())
                    goto done;
            }
        }
        if (dirty && !blockio(p1.dev, track, sector, 1))
            break;
        track = io[0];
        sector = io[1];
    }
done:
    krnio_close(2);
    cachevalid = 0;
    if (!found && !track)
        error("File not found");
}
static void concatcmd(void)
{
    unsigned char len, first = 1;
    char *source = args[1], *next;
    char request[41];
    if (!path(args[2], &p1))
        return;
    if (!p1.name[0] || strpbrk(p1.name, "*?=@")) {
        error("Invalid destination");
        return;
    }
    strcpy(request, "c0:");
    strcat(request, p1.name);
    strcat(request, "=");
    do {
        next = strchr(source, '+');
        if (next)
            *next++ = 0;
        if (!path(source, &p2))
            return;
        if (!strchr(source, ':'))
            p2.dev = p1.dev;
        if (p2.dev != p1.dev) {
            error("Files must be on the same disk");
            return;
        }
        if (!p2.name[0] || strpbrk(p2.name, "*?=")) {
            error("Invalid file name");
            return;
        }
        len = strlen(request);
        if (len + strlen(p2.name) + !first > 40) {
            error("File list too long");
            return;
        }
        if (!first)
            strcat(request, ",");
        strcat(request, p2.name);
        first = 0;
        source = next;
    } while (source);
    if (command(p1.dev, request))
        say("        1 file(s) copied.");
}
static const char *const commands[] = {
    "BEEP",   "CHKDSK", "CLS",   "COPY",   "DEL",  "DIR",    "DISKCOPY", "ECHO",   "EDIT", "EXIT",
    "FORMAT", "HELP",   "LABEL", "MEM",    "MOVE", "PAUSE",  "PRINT",    "REM",    "REN",  "RUN",
    "TYPE",   "VOL",    "VER",   "DISKID", "SET",  "REBOOT", "ATTRIB",   "SPLASH", "FIND"};
#define COMMANDCOUNT (sizeof(commands) / sizeof(commands[0]))
/* COMMANDS.HLP v1: MCH, version, topic count, then NUL-ended PETSCII texts.
 * Use the startup disk; a no-device startup uses the currently selected disk.
 * Reuse io so help does not reserve another permanent buffer. */
static unsigned char diskhelp(unsigned char topic)
{
    unsigned char current, c, wrapped, device = helpdrive ? helpdrive : drive;
    unsigned int i;
    int n;
    if (!device) {
        error("No disk selected");
        return 0;
    }
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
                    krnio_close(2);
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
                 * Keep redirected help byte-exact and free of page prompts. */
                if (!redirected && !ox && !page()) {
                    krnio_close(2);
                    return 0;
                }
            } else if (!c)
                ++current;
        }
        stop();
    }
    if (aborted) {
        krnio_close(2);
        return 0;
    }
failed:
    krnio_close(2);
    /* Swapping a disk with an open output file would write to the wrong disk. */
    if (redirected && outputpath.dev == device) {
        error("Insert MCS-DOS disk before redirecting help");
        return 0;
    }
    /* Always prompt on screen, including when help output is redirected. */
    error("Insert MCS-DOS disk and press any key when ready");
    if (getch() == CH_STOP) {
        aborted = 1;
        return 0;
    }
    /* Refresh the drive's media state as well as the shell directory cache. */
    command(device, "i");
    goto retry;
}
static int commandid(const char *s)
{
    unsigned char i;
    if (!stricmp(s, "DELETE") || !stricmp(s, "ERASE"))
        return 4;
    if (!stricmp(s, "RENAME"))
        return 18;
    if (!stricmp(s, "VERSION"))
        return 22;
    for (i = 0; i < COMMANDCOUNT; ++i)
        if (!stricmp(s, commands[i]))
            return i;
    return -1;
}
static void help(int id)
{
    unsigned char i, j, tmp, order[COMMANDCOUNT];
    if (id >= 0) {
        diskhelp((unsigned char)id);
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
static unsigned char tokenize(char *s)
{
    char *r = s, *w = parsebuf;
    unsigned char quote;
    argc = 0;
    memset(rawparse, 0, sizeof(rawparse));
    while (*r) {
        while (*r == ' ')
            ++r;
        if (!*r)
            break;
        if (argc == MAXARGS)
            return 0;
        argquoted[argc] = *r == '"';
        args[argc++] = w;
        quote = 0;
        /* Keep the switch's leading slash, then split at the next one.
         * Separate output storage permits DIR/W/O without overwriting /W. */
        if (*r == '/')
            *w++ = *r++;
        while (*r && ((*r != ' ' && *r != '/') || quote)) {
            if (*r == '"') {
                quote = !quote;
                ++r;
            } else {
                rawset(rawparse, w - parsebuf, rawget(rawline, r - line));
                *w++ = *r++;
            }
        }
        if (quote)
            return 0;
        while (*r == ' ')
            ++r;
        *w++ = 0;
    }
    return 1;
}
static void executecommand(char *s)
{
    char *tail, *end;
    unsigned char i, c;
    unsigned long ms;
    clock_t until;
    int id;
    aborted = 0;
    noseparators = 0;
    while (*s == ' ')
        ++s;
    if (*s == '@')
        ++s;
    if (!*s)
        return;
    if (!stricmp(s, "ECHO.")) {
        newline();
        return;
    }
    /* ECHO and REM retain their unparsed text. */
    tail = strchr(s, ' ');
    if (tail) {
        c = *tail;
        *tail = 0;
        id = commandid(s);
        *tail = c;
        if (id == 7 || id == 17 || id == 24) {
            ++tail;
            if (!strcmp(tail, "/?")) {
                help(id);
                return;
            }
            if (id == 24) {
                setcmd(tail);
                return;
            }
            if (id == 17)
                return;
            if (!stricmp(tail, "OFF"))
                echoon = 0;
            else if (!stricmp(tail, "ON"))
                echoon = 1;
            else
                say(tail);
            return;
        }
    }
    if (!tokenize(s)) {
        say("Syntax error");
        return;
    }
    if (!argc)
        return;
    if (argc == 1 && strchr(args[0], ':')) {
        if (!path(args[0], &p1))
            return;
        if (!p1.name[0]) {
            drive = p1.dev;
            cachevalid = 0;
        } else
            error("Invalid drive specification");
        return;
    }
    id = commandid(args[0]);
    if (id < 0) {
        say("Bad command or file name");
        return;
    }
    for (i = 1; i < argc; ++i)
        if (!argquoted[i] && !strcmp(args[i], "/?")) {
            help(id);
            return;
        }
    switch (id) {
    case 0:
        ms = argc > 1 ? strtoul(args[1], &end, 10) : 200;
        if (argc > 2 || (argc > 1 && (!args[1][0] || *end)) || ms > 60000UL) {
            error("Invalid duration");
            break;
        }
        POKE(0xd418, 15);
        POKE(0xd400, 220);
        POKE(0xd401, 28);
        POKE(0xd402, 0);
        POKE(0xd403, 8);
        POKE(0xd405, 0);
        POKE(0xd406, 0xf0);
        POKE(0xd404, 0x41);
        until = clock() + (ms * CLOCKS_PER_SEC + 999) / 1000;
        while (clock() < until)
            if (stop())
                break;
        POKE(0xd404, 0);
        break;
    case 1:
        volcmd(1);
        break;
    case 2:
        clear();
        break;
    case 3:
        copycmd(0);
        break;
    case 4:
        delcmd();
        break;
    case 5:
        dircmd();
        break;
    case 6:
        diskcopycmd();
        break;
    case 7:
        say(echoon ? "ECHO is on." : "ECHO is off.");
        break;
    case 8:
        editcmd();
        break;
    case 9:
        quit = 1;
        break;
    case 10:
        formatcmd();
        break;
    case 11:
        if (argc > 1) {
            id = commandid(args[1]);
            if (id < 0) {
                error("Invalid command");
                break;
            }
        } else
            id = -1;
        help(id);
        break;
    case 12:
        labelcmd();
        break;
    case 13:
        memcmd();
        break;
    case 14:
        copycmd(1);
        break;
    case 15:
        outs("Press any key to continue . . .");
        getch();
        newline();
        break;
    case 16:
        typecmd(1);
        break;
    case 17:
        break;
    case 18:
        if (argc != 3 || !path(args[1], &p1) || !path(args[2], &p2)) {
            error("Syntax: REN oldname newname");
            break;
        }
        if (!strchr(args[2], ':'))
            p2.dev = p1.dev;
        if (p1.dev != p2.dev) {
            say("Cannot rename across drives");
            break;
        }
        if (!strcmp(p1.name, p2.name))
            break;
        cachevalid = 0;
        if (findfile(&p1) < 0) {
            error("File not found");
            break;
        }
        if (!preparewrite(&p2))
            break;
        snprintf(diskcmd, sizeof(diskcmd), "r0:%s=%s", p2.name, p1.name);
        command(p1.dev, diskcmd);
        break;
    case 19:
        runcmd();
        break;
    case 20:
        typecmd(0);
        break;
    case 21:
        volcmd(0);
        break;
    case 22:
        say(BANNER);
        break;
    case 23:
        diskidcmd();
        break;
    case 24:
        if (argc > 2) {
            error("Invalid parameter");
            break;
        }
        setcmd(argc == 2 ? args[1] : "");
        break;
    case 25:
        if (argc != 1) {
            error("Invalid parameter");
            break;
        }
        reboot = 1;
        break;
    case 28:
        findcmd();
        break;
    case 26:
        attribcmd();
        break;
    case 27:
        if (argc != 1) {
            error("Invalid parameter");
            break;
        }
        bootsplash(0);
        break;
    }
}
/* One destination per built-in command. Keep the wrapper responsible for
 * closing output even when command handlers return early. */
static void execute(char *s)
{
    char *r, *op = 0, *target, *end;
    unsigned char quote = 0, append = 0, helping;
    int id, i;
    aborted = 0;
    for (r = s; *r; ++r) {
        if (*r == '"')
            quote = !quote;
        else if (*r == '>' && !quote) {
            if (op) {
                error("Multiple redirections not supported");
                return;
            }
            op = r;
            if (r[1] == '>') {
                append = 1;
                ++r;
            }
        }
    }
    if (!op) {
        executecommand(s);
        return;
    }
    if (quote) {
        error("Syntax error");
        return;
    }
    target = op + 1 + append;
    *op = 0;
    end = op;
    while (end > s && end[-1] == ' ')
        *--end = 0;
    while (*s == ' ' || *s == '@')
        ++s;
    if (!tokenize(s) || !argc) {
        error("Syntax error");
        return;
    }
    id = commandid(args[0]);
    if (!stricmp(args[0], "ECHO."))
        id = 7;
    helping = id == 11;
    for (i = 1; i < argc; ++i)
        if (!strcmp(args[i], "/?"))
            helping = 1;
    if (id != 1 && id != 5 && id != 7 && id != 11 && id != 13 && id != 20) {
        error("Redirection not supported for command");
        return;
    }
    /* Resolve TYPE's source before opening/truncating any destination. */
    if (id == 20) {
        if (argc != 2) {
            error("Syntax: TYPE filename");
            return;
        }
        if (!path(args[1], &p1))
            return;
        i = findfile(&p1);
        if (i < 0) {
            if (i == -1)
                error("File not found");
            return;
        }
        if (files[i].type != CBM_T_SEQ && files[i].type != CBM_T_PRG &&
            files[i].type != CBM_T_USR) {
            error("Unsupported file type");
            return;
        }
    }
    if (!tokenize(target) || argc != 1) {
        error("Invalid destination");
        return;
    }
    if (!stricmp(args[0], "LPT1") || !stricmp(args[0], "LPT2")) {
        error("Printer redirection not supported");
        return;
    }
    if (!path(args[0], &outputpath))
        return;
    /* Do not truncate/append to the help source before the reader opens it. */
    if (helping && outputpath.dev == (helpdrive ? helpdrive : drive) &&
        !stricmp(outputpath.name, "commands.hlp")) {
        error("Invalid destination");
        return;
    }
    if (!outputpath.name[0] || strchr(outputpath.name, '*') || strchr(outputpath.name, '?')) {
        error("Invalid destination");
        return;
    }
    if (id == 20 && p1.dev == outputpath.dev && !strcmp(p1.name, outputpath.name)) {
        error("Cannot redirect TYPE onto itself");
        return;
    }
    cachevalid = 0;
    i = findfile(&outputpath);
    if (i == -2)
        return;
    if (i >= 0 && files[i].type != CBM_T_SEQ) {
        error("Destination must be a SEQ file");
        return;
    }
    if (i >= 0 && !append && !scratch(&outputpath))
        return;
    if (!statuschannel(outputpath.dev)) {
        error("Drive not ready");
        return;
    }
    snprintf(diskcmd, sizeof(diskcmd), "0:%s,s,%c", outputpath.name, append && i >= 0 ? 'a' : 'w');
    if (channel_open(5, outputpath.dev, 5, diskcmd) != 0) {
        krnio_close(5);
        error("Write fault error");
        return;
    }
    if (diskstatus(outputpath.dev, 1) >= 20) {
        krnio_close(5);
        return;
    }
    outputused = outputfailed = outputcol = 0;
    redirected = 1;
    executecommand(s);
    outputflush();
    redirected = 0;
    krnio_close(5);
    cachevalid = 0;
    diskstatus(outputpath.dev, 1);
}
/* Use the ROM font for the artwork; interactive SPLASH restores the shell. */
static void bootsplash(unsigned char wait)
{
    static const char product[] = "MCS-DOS version " VERSION;
    static const char copyright[] = "Copyright (C) 2026 MCS";
    unsigned char x, y;
    clock_t started;
    charset_default();
    bgcolor(COLOR_BLACK);
    bordercolor(COLOR_BLACK);
    textcolor(COLOR_BLUE);
    screen_reverse(0);
    textcursor(0);
    clrscr();
    for (y = 0; y < LOGO_ROWS; ++y) {
        gotoxy((40 - LOGO_WIDTH) / 2, 2 + y);
        for (x = 0; x < LOGO_WIDTH; ++x)
            screen_putc(bootlogo[y][x]);
    }
    textcolor(COLOR_WHITE);
    gotoxy((40 - (sizeof(product) - 1)) / 2, 2 + LOGO_ROWS + 3);
    screen_puts(product);
    gotoxy((40 - (sizeof(copyright) - 1)) / 2, 2 + LOGO_ROWS + 5);
    screen_puts(copyright);
    if (wait) {
        started = clock();
        while ((clock_t)(clock() - started) < 4 * CLOCKS_PER_SEC) {
        }
    } else {
        if (screenbase != 0x0400)
            charset_enable();
        colors();
        caret_init();
        ox = 0;
        oy = 2 + LOGO_ROWS + 7;
        gotoxy(ox, oy);
    }
}
int main(void)
{
    unsigned char c, overflow, startdrive, startup;
    unsigned int n;

    /* Keep KERNAL available and read PETSCII without library translation. */
    POKE(1, 0x36);
    giocharmap = IOCHM_TRANSPARENT;
    textcursor(false);
    POKE(207, 0);
    /* Last KERNAL device; direct loaders can leave this unset or stale. */
    c = PEEK(0xba);
    startdrive = (c >= 8 && c <= 30) ? c : 0;
    helpdrive = startdrive;
    bootsplash(1);
restart:
    for (c = 0; c < 2; ++c) {
        if (cmddev[c])
            krnio_close(14 + c);
        cmddev[c] = 0;
    }
    drive = startdrive;
    quit = reboot = batching = aborted = editprompt = pagelines = 0;
    envready = 0;
    envused = histcount = histnext = cachevalid = count = cmdslot = 0;
    environment[0] = line[0] = draft[0] = 0;
    strcpy(prompttext, "$p$c$g");
    batchpos = batchlen = 0;
    memset(eof, 0, sizeof(eof));
    echoon = 1;
    startup = 1;
    charset_default();
    screenbase = 0x0400;
    fg = 15;
    bg = bd = 0;
    POKE(657, 128); /* Disable Shift+Commodore font switching. */
    colors();
    clear();
    charset_prepare();
    charset_enable();
    screenbase = 0xe000;
    gotoxy(ox, oy);
    if (drive) {
        p1.dev = drive;
        filename("AUTOEXEC.BAT", p1.name);
        /* AUTOEXEC is read from the startup device. */
        if (findfile(&p1) >= 0)
            runbatch();
    }
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

/* Generated assembly services; the shell itself is compiled directly. */
#include "../build/oscar64/hardware.h"
