#include "core.h"
#pragma code(boot_code)
#pragma data(boot_data)
#include "bootsplash.h"
__noinline void bank_setcmd(const char *s);
__noinline unsigned char bank_bootstart(unsigned char startdrive);
__noinline void bank_startupprompt(void);
__noinline void bank_startupcolor(void);
__noinline void bank_startupcharset(unsigned char device);
__noinline void bank_bootsplash(unsigned char wait);

/* SET only stores the value; startup applies it after AUTOEXEC unwinds. */
__noinline void bank_startupprompt(void)
{
    const char *value = envget("PROMPT");
    if (value)
        strcpy(prompttext, value);
}

/* Parse all three colors before changing any display state. */
__noinline void bank_startupcolor(void)
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
    error(SYSOUT_INVALID_COLOR);
}

/* Apply once after AUTOEXEC unwinds, always using the startup disk.
 * MCPI v1 patches shared text slots and the backslash slot. Staging beneath
 * KERNAL keeps the default RAM font intact until validation completes. */
__noinline void bank_startupcharset(unsigned char device)
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
        error(SYSOUT_INVALID_CHARSET_NAME);
        return;
    }
    memcpy(name, v, address);
    name[address] = 0;
    filename(name, name);
    strcat(name, ".cpi");
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
    channel_close(2);
    charset_commit();
    return;
failed:
    channel_close(2);
    uppername(name, name);
    snprintf(fmtbuf, sizeof(fmtbuf), SYSOUT_CANNOT_LOAD, name);
    error(fmtbuf);
}

/* Use the ROM font for the artwork; interactive SPLASH restores the shell. */
__noinline void bank_bootsplash(unsigned char wait)
{
    static const char product[] = SYSOUT_SPLASH_PRODUCT;
    static const char copyright[] = SYSOUT_COPYRIGHT;
    unsigned char x, y, oldlo, oldhi;
    clock_t started;
    /* Interactive SPLASH temporarily uses the default screen, which now
     * overlaps EasyAPI and the filesystem state. These scratch buffers are
     * idle here, including when SPLASH is called from a batch file. */
    if (!wait) {
        memcpy(editbuf, (void *)0x0400, 768);
        memcpy(io, (void *)0x0700, 240);
    }
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
        skipautoexec = 0;
        oldlo = PEEK(0x0318);
        oldhi = PEEK(0x0319);
        started = splash_nmi_address();
        POKE(0x0318, started & 255);
        POKE(0x0319, started >> 8);
        started = clock();
        while (!skipautoexec && (clock_t)(clock() - started) < 4 * CLOCKS_PER_SEC) {
        }
        POKE(0x0318, oldlo);
        POKE(0x0319, oldhi);
    } else {
        if (screenbase != 0x0400)
            charset_enable();
        memcpy((void *)0x0400, editbuf, 768);
        memcpy((void *)0x0700, io, 240);
        colors();
        caret_init();
        ox = 0;
        oy = 2 + LOGO_ROWS + 7;
        gotoxy(ox, oy);
    }
}

__noinline void bank_setcmd(const char *s)
{
    static char value[ENVVALUE + 1];
    char name[9], *old, *v;
    const char *eq;
    unsigned int n, len, pos, size;
    unsigned char flags = 0;
    while (*s == ' ')
        ++s;
    if (!strcmp(s, "/?")) {
        say(SYSOUT_USE_HELP_SET);
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
            print(SYSOUT_ENVIRONMENT_STATS,
                  (unsigned int)ENVSIZE, envused, (unsigned int)(ENVSIZE - envused));
            return;
        }
    }
    eq = strchr(s, '=');
    if (!eq || strchr(s, '"')) {
        error(SYSOUT_INVALID_VALUE);
        return;
    }
    n = eq - s;
    while (n && s[n - 1] == ' ')
        --n;
    len = strlen(eq + 1);
    if (!n || n > 8 || len > ENVVALUE) {
        error(SYSOUT_INVALID_VALUE);
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
        error(SYSOUT_INVALID_VALUE);
        return;
    }
    old = envget(name);
    size = old ? strlen(old) + strlen(name) + 2 : 0;
    if (envused - size + (len ? n + len + 2 : 0) > ENVSIZE) {
        say(SYSOUT_ENVIRONMENT_FULL);
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

__noinline unsigned char bank_bootstart(unsigned char startdrive) {
 unsigned char c;
    for (c = 0; c < 2; ++c) {
        if (cmddev[c])
            channel_close(14 + c);
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
    c=cart_init(); if(c) error(SYSOUT_CARTRIDGE_FILESYSTEM_UNAVAILABLE);
    if (!c && !skipautoexec && !resume_requested) {
        unsigned char bootdevs[24], bi, bn=cart_config(bootdevs);
        if(cart_status()) error(SYSOUT_INVALID_CONFIG_SYS_DIRECTIVE);
        startdrive=drive=0;
        for(bi=0;bi<bn;++bi) {
            p1.dev=bootdevs[bi]; filename("AUTOEXEC.BAT",p1.name);
            if(p1.dev && !statuschannel(p1.dev)) continue;
            if(findfile(&p1)>=0) { startdrive=drive=p1.dev; runbatch(); break; }
        }
    }
    skipautoexec = 0;
return startdrive;
}
#pragma code(code)
#pragma data(data)
