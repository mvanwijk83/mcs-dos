// Test live SET changes, environment capacity, and screen recoloring.
require('./setup');
const fs = require('fs'), assert = require('assert/strict');
const {constant, fn, functions, header} = require('./source');
const env = fn('envget');
const drives = functions('dosdrives', 'drivename');
const set = functions('setcolor', 'setcmd', 'settingscmd');
const code = `

#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdarg.h>
#define ENVVALUE 32
#define ENVSIZE ${constant('ENVSIZE')}
static char environment[ENVSIZE], prompttext[33], activecharset[17];
static unsigned char driveids,argc;
static const char *args[3];
static unsigned int envused;
static unsigned char fg = 15, bg, bd, errors, envready, startupdevice, colorcalls;
static char output[160];

/* Format the supplied values into captured output for independent report comparisons.
 *
 * fmt: Printf-style format string.
 * ...: Values consumed by the format string. */
static void print(const char *fmt, ...)
{
    va_list a;
    va_start(a, fmt);
    vsprintf(output, fmt, a);
    va_end(a);
}

/* Provide the line-output hook; the fixture captures text when report layout is under test.
 *
 * s: Line text supplied by the production handler. */
static void say(const char *s)
{
    ++errors;
}

/* Record a reported error so rejection and cleanup can be checked without screen I/O.
 *
 * s: Error message supplied by production code; this fixture observes the reported error. */
static void error(const char *s)
{
    ++errors;
}

/* Provide the color hook without opening a display. */
static void newline(void) { strcat(output, "|"); }
static void colors(void)
{
    ++colorcalls;
}

/* Provide filename conversion for controlled fixture inputs.
 *
 * s: Source name.
 * d: Destination name buffer. */
static void uppername(const char *s, char *d)
{
    while (*s)
        *d++ = toupper(*s++);
    *d = 0;
}

/* Font loading is covered by cartridge integration tests. */
static unsigned char setcharset(const char *s)
{
    return 1;
}

/* Accept default directory options; detailed option parsing is tested separately.
 *
 * s: Directory option text.
 * f: Option flag destination. */
static unsigned char dirdefaults(const char *s, unsigned char *f)
{
    return 1;
}

${env} ${drives} ${set}
/* Run the independent fixture cases; failure results identify the violated invariant. */
int main(void)
{
    unsigned char i;
    unsigned int j;
    char b[65];
    setcmd("abcdefgh=12345678901234567890123456789012");
    if (!envget("ABCDEFGH") || strlen(envget("ABCDEFGH")) != 32)
        return 1;
    setcmd("abcdefghi=x");
    if (errors != 1)
        return 2;
    setcmd("abcdefgh=123456789012345678901234567890123");
    if (errors != 2 || strlen(envget("ABCDEFGH")) != 32)
        return 3;
    setcmd("color=15, 6, 14");
    setcmd("prompt=ignored");
    setcmd("driveids=dos");
    setcmd("charset=anything");
    if (fg != 15 || bg || bd || *prompttext || driveids) return 4;
    argc = 3; args[2] = "COLOR=15, 6, 14";
    settingscmd(42, "CON:");
    if (fg != 15 || bg != 6 || bd != 14) return 5;
    args[2] = "COLOR=1,2,16";
    settingscmd(42, "con");
    if (errors != 3 || fg != 15 || bg != 6 || bd != 14) return 6;
    args[2] = "COLOR=1,2,3,4"; settingscmd(42, "con");
    args[2] = "COLOR=1,2"; settingscmd(42, "con");
    if (errors != 5) return 7;
    args[2] = "COLOR=15,0,0"; settingscmd(42, "con");
    settingscmd(41, "Ready.$R$D$C$G");
    if (strcmp(prompttext, "Ready.$R$D$C$G")) return 10;
    settingscmd(41, "");
    if (strcmp(prompttext, "$p$g")) return 9;
    envused = 0;
    errors = 0;
    for (i = 0; i < 6; ++i) {
        sprintf(b, "n%02u=12345678901234567890123456789012", i);
        setcmd(b);
    }
    setcmd("edge=1234567890123456789012345678");
    if (envused != 256 || errors)
        return 12;
    setcmd("/ENV");
    if (strcmp(output, "  256 bytes total environment size\\n  256 bytes used\\n    0 bytes free\\n"))
        return 20;
    settingscmd(41, "full environment");
    if (strcmp(prompttext, "full environment") || envused != ENVSIZE) return 25;
    settingscmd(41, "123456789012345678901234567890123");
    if (strcmp(prompttext, "full environment") || errors != 1) return 26;
    errors = 0;
    settingscmd(41, "");
    setcmd("edge=12345678901234567890123456789");
    if (envused != 256 || errors != 1 || strcmp(envget("EDGE"), "1234567890123456789012345678"))
        return 13;
    setcmd("color=1,2,3");
    setcmd("prompt=full");
    if (errors != 3 || fg != 15 || bg || bd || strcmp(prompttext, "$p$g"))
        return 24;
    setcmd("edge=");
    setcmd("extra=ok");
    if (!envget("EXTRA"))
        return 14;
    envused = 0;
    setcmd("/eNv  ");
    if (strcmp(output, "  256 bytes total environment size\\n    0 bytes used\\n  256 bytes free\\n"))
        return 15;
    setcmd("aa=12345678901234567890123456789012");
    setcmd("b=123456789");
    setcmd("/ENV");
    if (strcmp(output, "  256 bytes total environment size\\n   48 bytes used\\n  208 bytes free\\n"))
        return 16;
    argc = 3; args[2] = "IDS=DOS"; settingscmd(42, "drv:");
    if (strcmp(drivename(8), "A")) return 17;
    args[2] = "IDS=C64"; settingscmd(42, "DRV");
    if (strcmp(drivename(8), "8")) return 19;
    memset((void *)0xd800, 7, 1001);
    args[2] = "COLOR=0,15,15"; settingscmd(42, "CON");
    for (j = 0; j < 1000; ++j)
        if (((unsigned char *)0xd800)[j] != 0)
            return 21;
    if (*(unsigned char *)0xdbe8 != 7)
        return 22;
    args[2] = "COLOR=1,2,16"; settingscmd(42, "CON");
    for (j = 0; j < 1000; ++j)
        if (((unsigned char *)0xd800)[j] != 0)
            return 23;
    errors = 0;
    args[2] = "COLORS=1,2,3"; settingscmd(42, "CON");
    if (errors != 1 || fg || bg != 15 || bd != 15) return 27;
    /* Equal text/background colors must silently preserve settings and screen RAM. */
    errors = colorcalls = 0;
    memset((void *)0xd800, 7, 1001);
    for (i = 0; i < 16; ++i) {
        sprintf(b, "COLOR=%u,%u,3", i, i);
        args[2] = b; settingscmd(42, "CON");
        if (errors || colorcalls || fg || bg != 15 || bd != 15) return 28;
        for (j = 0; j < 1001; ++j)
            if (((unsigned char *)0xd800)[j] != 7) return 29;
    }
    return 0;
}`;
fs.writeFileSync('build/test-startup-settings.c', code);
require('./simulator')('build/test-startup-settings.c');

assert(header.includes('#define LINE 128'));
assert(header.includes('#define MAXARGS 33'));
console.log(
    'PASS live colors and prompt, invalid values, defaults, environment limits, aligned usage statistics and exact screen recoloring');
