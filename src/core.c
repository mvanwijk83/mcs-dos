#include "core.h"
#include "memory.h"
Entry directory_entries[MAXFILES];
unsigned int count;
unsigned char cachedev, cachevalid, drive;
unsigned int freeblocks;
char volume[17], diskid[3];
unsigned char ox, oy, fg = 15, bg = 0, bd = 0, quit, reboot, echoon = 1, batching;
volatile unsigned char skipautoexec;
unsigned char copysuppress;
unsigned char pagelines, aborted, editprompt;
unsigned int screenbase = 0x0400;
char environment[ENVSIZE];
unsigned int envused;
/* Behavioral settings remain inactive until AUTOEXEC has unwound. */
unsigned char envready;
char line[LINE], history[10][LINE], draft[LINE];
char prompttext[ENVVALUE + 1];
/* Completed bytes live in the command itself, never as cache indices. */
unsigned char rawline[RAWMAP], rawhistory[10][RAWMAP], rawdraft[RAWMAP];
unsigned char rawparse[(LINE + MAXARGS + 7) / 8];
unsigned char histcount, histnext;
/* Formatting and disk command construction never overlap. */
char fmtbuf[160], statusbuf[64];
unsigned char io[256];
unsigned char eof[16];
unsigned char cmddev[2], cmdslot;
/* Current raw operation's geometry; refreshed from the medium, never cached. */
unsigned char headertrack, labeloff, idoff, disktracks;
char batch[BATCHMAX + 1];
/* Commands execute one at a time. DIR, FIND and REL COPY use EDIT's idle
 * workspace; EDIT initializes it before use. Keep batch storage separate:
 * a batch can invoke any of these commands and must survive their return. */
char workspace[EDITROWS * 40];
unsigned int batchpos, batchlen;
char *args[MAXARGS];
char parsebuf[LINE + MAXARGS];
unsigned char argc;
unsigned char argquoted[MAXARGS];
Path p1, p2;
Path outputpath;
unsigned char redirected, outputfailed, outputused, outputcol;
unsigned char outputbuf[128];
/* Loader parameters consumed before the shell is overwritten. */
char launchname[17];
unsigned char launchdevice, launchlength, launchabsolute;
unsigned int launchaddress;

unsigned char noseparators, validate;
unsigned char resume_requested;

const char *const commands[] = {
    "BEEP",   "CHKDSK", "CLS",   "COPY",   "DEL",  "DIR",    "DISKCOPY", "ECHO",   "EDIT", "BASIC",
    "FORMAT", "HELP",   "LABEL", "MEM",    "MOVE", "PAUSE",  "PRINT",    "REM",    "REN",  "RUN",
    "TYPE",   "VOL",    "VER",   "DISKID", "SET",  "REBOOT", "ATTRIB",   "SPLASH", "FIND", "DISKINIT"};

void clear(void)
{
    clrscr();
    ox = oy = 0;
}

void newline(void)
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
void displayc(unsigned char c)
{
    screen_putc(c == 96 ? ' ' : c);
}

void outc(unsigned char c)
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

void outs(const char *s)
{
    while (*s)
        outc(*s++);
}

void say(const char *s)
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

void error(const char *s)
{
    unsigned char saved = redirected;
    redirected = 0;
    say(s);
    redirected = saved;
}

void outputflush(void)
{
    if (outputused && !outputfailed) {
        if (channel_write(5, outputbuf, outputused) != outputused) {
            outputfailed = aborted = 1;
            error(SYSOUT_WRITE_FAULT_ERROR);
        }
    }
    outputused = 0;
}

void outputbyte(unsigned char c)
{
    if (outputfailed)
        return;
    outputbuf[outputused++] = c;
    if (outputused == sizeof(outputbuf))
        outputflush();
}

void print(const char *s, ...)
{
    va_list ap;
    va_start(ap, s);
    vsnprintf(fmtbuf, sizeof(fmtbuf), s, ap);
    va_end(ap);
    outs(fmtbuf);
}

void colors(void)
{
    textcolor(fg);
    bgcolor(bg);
    bordercolor(bd);
}

#pragma optimize(push, 0)
/* Oscar64 needs this routine unoptimized for 32-bit decimal division. */
char *decimal(unsigned long bytes)
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
char *allocated(unsigned int blocks)
{
    return decimal((unsigned long)blocks * 256);
}

void volumeheader(unsigned char dev)
{
    char shown[17];
    uppername(volume, shown);
    print(SYSOUT_VOLUME_HEADER, drivename(dev));
    if (ox + strlen(shown) > 40)
        newline();
    outs(shown);
    if (ox)
        newline();
    if (!dev) { outs(SYSOUT_CARTRIDGE_DISK_ID); return; }
    if (bam(dev)) {
        diskid[0] = toupper(io[idoff]);
        diskid[1] = toupper(io[idoff + 1]);
        diskid[2] = 0;
        print(SYSOUT_DISK_ID_HEADER, diskid);
    }
}

/* A single-color sprite supplies a true eight-pixel underscore without
 * changing the ROM font or the character under the cursor. Cassette RAM
 * $0340-$037f is no longer needed when the launch trampoline overwrites it. */
void caret_hide(void)
{
    POKE(0xd015, PEEK(0xd015) & 254);
}

void caret_init(void)
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

void caret_show(unsigned char x, unsigned char y)
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

unsigned char stop(void)
{
    if (kbhit() && getch() == CH_STOP) {
        aborted = 1;
        return 1;
    }
    return 0;
}

unsigned char yesno(const char *s)
{
    unsigned char c;
    if (editprompt)
        editstatus();
    outs(s);
    outs(SYSOUT_YES_NO_SUFFIX);
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

unsigned char page(void)
{
    unsigned char c;
    if (redirected)
        return !aborted && !stop();
    if (++pagelines < 22)
        return !stop();
    outs(SYSOUT_PRESS_ANY_KEY_TO_CONTINUE);
    c = getch();
    gotoxy(0, oy);
    screen_clear(40);
    ox = 0;
    pagelines = 0;
    if (c == CH_STOP)
        aborted = 1;
    return !aborted;
}

void uppername(const char *s, char *d)
{
    while (*s)
        *d++ = toupper(*s++);
    *d = 0;
}

unsigned char rawget(const unsigned char *map, unsigned char pos)
{
    return map[pos >> 3] & (1 << (pos & 7));
}

void rawset(unsigned char *map, unsigned char pos, unsigned char value)
{
    unsigned char bit = 1 << (pos & 7);
    if (value)
        map[pos >> 3] |= bit;
    else
        map[pos >> 3] &= ~bit;
}

void filename(const char *s, char *d)
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
char *envget(const char *name)
{
    unsigned int p = 0, n = strlen(name);
    while (p < envused) {
        if (!strncmp(environment + p, name, n) && environment[p + n] == '=')
            return environment + p + n + 1;
        p += strlen(environment + p) + 1;
    }
    return 0;
}

unsigned char dosdrives(void)
{
    char *v = envready ? envget("DRIVEIDS") : (char *)0;
    if (!v)
        return 0;
    while (*v == ' ')
        ++v;
    return toupper(*v) == 'D';
}

const char *drivename(unsigned char dev)
{
    static char text[4];
    if (dosdrives() && dev >= 8 && dev <= 30) {
        text[0] = 'A' + dev - 8;
        text[1] = 0;
    } else
        snprintf(text, sizeof(text), "%u", dev);
    return text;
}

void showprompt(void)
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
                print(SYSOUT_DRIVE_NUMBER, drive);
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

/* A 12-character stem leaves room for .CPI in a native 16-byte filename. */
unsigned char charsetname(const char *s)
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

unsigned char path(const char *s, Path *p)
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
        if (d != 0 && (d < 8 || d > 30)) {
            error(SYSOUT_INVALID_DRIVE_SPECIFICATION);
            return 0;
        }
        p->dev = d;
        s = q + 1;
    }
    if (strlen(s) > 16) {
        error(SYSOUT_FILE_NAME_TOO_LONG);
        return 0;
    }
    if (strchr(s, ':') || strchr(s, ',') || strchr(s, '"')) {
        error(SYSOUT_INVALID_FILE_NAME);
        return 0;
    }
    filename(s, p->name);
    return 1;
}

/* Closing a 1541 command channel also closes its data channels. Keep two
 * command channels resident so two-drive copying never closes a live file. */
unsigned char statuschannel(unsigned char dev)
{
    unsigned char i;
    if (!dev) return 13;
    for (i = 0; i < 2; ++i)
        if (cmddev[i] == dev)
            return 14 + i;
    i = cmdslot;
    cmdslot ^= 1;
    if (cmddev[i])
        channel_close(14 + i);
    cmddev[i] = 0;
    if (channel_open(14 + i, dev, 15, "") != 0) {
        channel_close(14 + i);
        return 0;
    }
    cmddev[i] = dev;
    return 14 + i;
}

unsigned char diskstatus(unsigned char dev, unsigned char report)
{
    int n;
    unsigned char code, lfn = statuschannel(dev);
    if (!dev) { code=cart_status(); if(code>=20 && report) error(SYSOUT_CARTRIDGE_FILE_OPERATION_FAILED); return code; }
    if (!lfn) {
        if (report)
            error(SYSOUT_NOT_READY_READING_DRIVE);
        return 255;
    }
    POKE(144, 0);
    n = channel_read(lfn, statusbuf, 63);
    POKE(144, 0);
    if (n <= 0) {
        if (report)
            error(SYSOUT_DRIVE_NOT_READY);
        return 255;
    }
    statusbuf[n] = 0;
    code = atoi(statusbuf);
    if (code >= 20 && report) {
        error(SYSOUT_DISK_ERROR);
        error(statusbuf);
    }
    return code;
}

/* KERNAL ST belongs to the current serial operation, not to a file.
 * Preserve EOF per logical file while switching data/status channels. */
int readio(unsigned char lfn, void *buf, unsigned int size)
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

unsigned char command(unsigned char dev, const char *s)
{
    unsigned char lfn = statuschannel(dev);
    if (!dev) { cachevalid=0; if(cart_command(s)) { error(SYSOUT_CARTRIDGE_OPERATION_FAILED); return 0; } return 1; }
    if (!lfn) {
        error(SYSOUT_DRIVE_NOT_READY);
        return 0;
    }
    POKE(144, 0);
    if (channel_write(lfn, s, strlen(s)) != (int)strlen(s)) {
        error(SYSOUT_DRIVE_NOT_READY);
        return 0;
    }
    cachevalid = 0;
    return diskstatus(dev, 1) < 20;
}

unsigned char match(const char *p, const char *s)
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

const char *typename(unsigned char t)
{
    switch (t) {
    case CBM_T_DEL:
        return SYSOUT_TYPE_DELETED;
    case CBM_T_PRG:
        return SYSOUT_TYPE_PROGRAM;
    case CBM_T_SEQ:
        return SYSOUT_TYPE_SEQUENTIAL;
    case CBM_T_USR:
        return SYSOUT_TYPE_USER;
    case CBM_T_REL:
        return SYSOUT_TYPE_RELATIVE;
    default:
        return SYSOUT_TYPE_UNKNOWN;
    }
}

void runbatch(void)
{
    int n;
    if (batching) {
        say(SYSOUT_NESTED_BATCH_DIRECTORY_ENTRIES_NOT_SUPPORTED);
        return;
    }
    if (!openread(&p1, 2))
        return;
    n = readio(2, batch, BATCHMAX);
    batchlen = n > 0 ? n : 0;
    if (n == BATCHMAX && readio(2, io, 1) > 0)
        n = -1;
    channel_close(2);
    if (n < 0) {
        say(SYSOUT_BATCH_FILE_TOO_LARGE_OR_UNREADABLE);
        return;
    }
    batch[batchlen] = 0;
    batchpos = 0;
    batching = 1;
}

unsigned char reportoptions(unsigned char disk)
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
        error(SYSOUT_INVALID_PARAMETER);
        return 0;
    }
    return 1;
}

unsigned int freememory(void)
{
    return 0xa000U - ((unsigned int)&BSSEnd) + 0x0400U;
}

void memcmd(void)
{
    unsigned long reserved;
    if (!reportoptions(0))
        return;
    reserved = 65536UL - ((unsigned int)&BSSEnd - 0x0801) - SHELL_STACK_SIZE - freememory() - 8192U;
    print(SYSOUT_MEM_TOTAL, decimal(65536UL));
    print(SYSOUT_MEM_SHELL, decimal((unsigned int)&BSSEnd - 0x0801));
    print(SYSOUT_MEM_STACK, decimal(SHELL_STACK_SIZE));
    print(SYSOUT_MEM_ROM_WINDOW, decimal(8192U));
    print(SYSOUT_MEM_SYSTEM, decimal(reserved));
    print(SYSOUT_MEM_FREE, decimal(freememory()));
}

int commandid(const char *s)
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

unsigned char tokenize(char *s)
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

void executecommand(char *s)
{
    char *tail, *end;
    unsigned char i, c;
    unsigned long ms;
    clock_t until;
    int id;
    aborted = 0;
    copysuppress = 0;
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
            else {
                end = tail + strlen(tail);
                if (end > tail && end[-1] == ';') {
                    end[-1] = 0;
                    if (end - tail > 1 && end[-2] == ';')
                        say(tail);
                    else
                        outs(tail);
                } else
                    say(tail);
            }
            return;
        }
    }
    if (!tokenize(s)) {
        say(SYSOUT_SYNTAX_ERROR);
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
            error(SYSOUT_INVALID_DRIVE_SPECIFICATION);
        return;
    }
    id = commandid(args[0]);
    if (id < 0) {
        say(SYSOUT_BAD_COMMAND_OR_FILE_NAME);
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
            error(SYSOUT_INVALID_DURATION);
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
        say(echoon ? SYSOUT_ECHO_IS_ON : SYSOUT_ECHO_IS_OFF);
        break;
    case 8:
        editcmd();
        break;
    case 9:
        if(argc!=1)error(SYSOUT_SYNTAX_BASIC);
        else quit = 1;
        break;
    case 10:
        formatcmd();
        break;
    case 11:
        if (argc > 1) {
            id = commandid(args[1]);
            if (id < 0) {
                error(SYSOUT_INVALID_COMMAND);
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
        outs(SYSOUT_PRESS_ANY_KEY_TO_CONTINUE);
        getch();
        newline();
        break;
    case 16:
        typecmd(1);
        break;
    case 17:
        break;
    case 18:
        renamecmd();
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
        say(SYSOUT_BANNER);
        break;
    case 23:
        diskidcmd();
        break;
    case 24:
        if (argc > 2) {
            error(SYSOUT_INVALID_PARAMETER);
            break;
        }
        setcmd(argc == 2 ? args[1] : "");
        break;
    case 25:
        if (argc != 1) {
            error(SYSOUT_INVALID_PARAMETER);
            break;
        }
        reboot = 1;
        break;
    case 28:
        findcmd();
        break;
    case 29:
        diskinitcmd();
        break;
    case 26:
        attribcmd();
        break;
    case 27:
        if (argc != 1) {
            error(SYSOUT_INVALID_PARAMETER);
            break;
        }
        bootsplash(0);
        break;
    }
}

/* One destination per built-in command. Keep the wrapper responsible for
 * closing output even when command handlers return early. */
void execute(char *s)
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
                error(SYSOUT_MULTIPLE_REDIRECTIONS_NOT_SUPPORTED);
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
        error(SYSOUT_SYNTAX_ERROR);
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
        error(SYSOUT_SYNTAX_ERROR);
        return;
    }
    id = commandid(args[0]);
    if (!stricmp(args[0], "ECHO."))
        id = 7;
    helping = id == 11;
    for (i = 1; i < argc; ++i)
        if (!argquoted[i] && !strcmp(args[i], "/?"))
            helping = 1;
    if (helping || (id != 1 && id != 5 && id != 7 && id != 13 && id != 20 && id != 28)) {
        error(SYSOUT_REDIRECTION_NOT_SUPPORTED_FOR_COMMAND);
        return;
    }
    /* Resolve file inputs before opening/truncating any destination. */
    if (id == 20 || id == 28) {
        unsigned char mode;
        unsigned long limit;
        char *needle;
        if (id == 28) {
            if (!findoptions(&mode, &needle))
                return;
        } else {
            if (!typeoptions(&mode, &limit)) {
                error(SYSOUT_SYNTAX_TYPE);
                return;
            }
            if (!path(args[1], &p1))
                return;
        }
        i = findfile(&p1);
        if (i < 0) {
            if (i == -1)
                error(SYSOUT_FILE_NOT_FOUND);
            return;
        }
        if (directory_entries[i].type != CBM_T_SEQ && directory_entries[i].type != CBM_T_PRG &&
            directory_entries[i].type != CBM_T_USR) {
            error(SYSOUT_UNSUPPORTED_FILE_TYPE);
            return;
        }
    }
    if (!tokenize(target) || argc != 1) {
        error(SYSOUT_INVALID_DESTINATION);
        return;
    }
    if (!stricmp(args[0], "LPT1") || !stricmp(args[0], "LPT2")) {
        error(SYSOUT_PRINTER_REDIRECTION_NOT_SUPPORTED);
        return;
    }
    if (!path(args[0], &outputpath))
        return;
    if (!outputpath.name[0] || strchr(outputpath.name, '*') || strchr(outputpath.name, '?')) {
        error(SYSOUT_INVALID_DESTINATION);
        return;
    }
    if ((id == 20 || id == 28) && p1.dev == outputpath.dev && !strcmp(p1.name, outputpath.name)) {
        error(id == 20 ? SYSOUT_CANNOT_REDIRECT_TYPE_ONTO_ITSELF : SYSOUT_CANNOT_REDIRECT_FIND_ONTO_ITSELF);
        return;
    }
    cachevalid = 0;
    i = findfile(&outputpath);
    if (i == -2)
        return;
    if (i >= 0 && directory_entries[i].type != CBM_T_SEQ) {
        error(SYSOUT_DESTINATION_MUST_BE_A_SEQ_FILE);
        return;
    }
    if (i >= 0 && outputpath.dev && !append && !scratch(&outputpath))
        return;
    if (!statuschannel(outputpath.dev)) {
        error(SYSOUT_DRIVE_NOT_READY);
        return;
    }
    snprintf(diskcmd, sizeof(diskcmd), "0:%s,s,%c", outputpath.name, append && i >= 0 ? 'a' : 'w');
    if (channel_open(5, outputpath.dev, 5, diskcmd) != 0) {
        channel_close(5);
        error(SYSOUT_WRITE_FAULT_ERROR);
        return;
    }
    if (diskstatus(outputpath.dev, 1) >= 20) {
        channel_close(5);
        return;
    }
    outputused = outputfailed = outputcol = 0;
    redirected = 1;
    executecommand(s);
    outputflush();
    redirected = 0;
    channel_close(5);
    cachevalid = 0;
    diskstatus(outputpath.dev, 1);
}
