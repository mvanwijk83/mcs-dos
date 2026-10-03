require('./setup');
// Exercise production expansion and prompt rendering on the 6502 simulator.
const fs = require('fs'), assert = require('assert/strict');
const {fn} = require('./source');
const expansion = fn('showprompt');
const harness = `

#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdarg.h>
#define VERSION "test-version"
static char prompttext[33], output[1024];
static unsigned char drive, aborted, dos;
static int used, helpid;

/* Provide the character-output hook, separately from redirected byte output.
 *
 * c: Character emitted by the production handler. */
static void outc(unsigned char c)
{
    output[used++] = c;
    output[used] = 0;
}

/* Capture an un-terminated string without adding a newline.
 *
 * s: Text to emit without a newline. */
static void outs(const char *s)
{
    while (*s)
        outc(*s++);
}

/* Format the supplied values into captured output for independent report comparisons.
 *
 * fmt: Printf-style format string.
 * ...: Values consumed by the format string. */
static void print(const char *fmt, ...)
{
    char b[16];
    va_list a;
    va_start(a, fmt);
    vsprintf(b, fmt, a);
    va_end(a);
    outs(b);
}

/* Render the fixture device identifier in its selected naming mode.
 *
 * d: Synthetic device identifier. */
static const char *drivename(unsigned char d)
{
    static char b[4];
    if (dos) {
        b[0] = 'A' + d - 8;
        b[1] = 0;
    } else
        sprintf(b, "%u", d);
    return b;
}

/* Provide the help hook without loading or displaying an unrelated help resource.
 *
 * id: Requested help topic index. */
static void help(int id)
{
    helpid = id;
}

${expansion}

/* Compare the current fixture result with its expected output or state.
 *
 * cmd: Prompt format containing the dollar codes to expand.
 * expected: Exact text expected after expansion. */
static int check(const char *cmd, const char *expected)
{
    strcpy(prompttext, cmd);
    used = 0;
    showprompt();
    return strcmp(output, expected);
}

/* Run the independent fixture cases; failure results identify the violated invariant. */
int main(void)
{
    drive = 8;
    if (check("$p$c$g", "8:>"))
        return 1;
    if (check("$d$c$g $n $p $q$s$v$$", "A:> 8 8 = test-version$"))
        return 2;
    dos = 1;
    drive = 30;
    used = 0;
    showprompt();
    if (strcmp(output, "W:> 30 W = test-version$"))
        return 3;
    if (check("$D$C$G $N $P $Q$S$V$$", "W:> 30 W = test-version$"))
        return 4;
    if (check("$b$H$r", "\\xdd\\xa0\\r"))
        return 5;
    if (check("$x$Z$ $/ $$$x $$d", "$x$Z$ $/ $$x $d"))
        return 6;
    if (check("$p$c$g", "W:>"))
        return 9;
    if (check("  ", "  "))
        return 10;
    drive = 0;
    if (check("$d$c$g$n", ":>0"))
        return 11;
    return 0;
}
`;
fs.writeFileSync('build/test-prompt.c', harness);
require('./simulator')('build/test-prompt.c');

const help = JSON.parse(fs.readFileSync('src/command-help.json'));
assert(!help.PROMPT && !help.COLOR);
console.log(
    'PASS prompt codes, case, graphics bytes, dynamic drives, literals, defaults, removed command help and no-device rendering');
