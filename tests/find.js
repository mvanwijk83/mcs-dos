// Compare FIND matching, line numbers, counts and case options across fixture boundaries.
require('./setup');
const fs = require('fs');
const {functions} = require('./source');
const code = functions('findoptions', 'findbyte', 'findcmd');
const fixtures = [
    'DOS\r\ndos\n\rno DOS here\rfinal', '', '\r\n\r\n', 'a'.repeat(1100) + 'DOS\nlast',
    'x'.repeat(37) + 'DOS\nDOS', 'ababa\naba\nno'
];
const cases = [], strings = new Map();
// Short adjacent literals avoid Oscar64’s limit on a single string token.
// Deduplicate fixtures explicitly to keep the harness within C64 memory.
const chunks = s => s.match(/[\s\S]{1,128}/g)?.map(v => JSON.stringify(v)).join(' ') || '""';
function literal(s) {
    if (!strings.has(s))
        strings.set(s, 'text' + strings.size);
    return strings.get(s);
}
for (const input of fixtures)
    for (let flags = 0; flags < 16; flags++)
        for (const redirected of [0, 1]) {
            const needle = input.startsWith('ababa') ? 'aba' : 'DOS';
            let lines = input.split(/\r\n|\r|\n/);
            if (!input || /[\r\n]$/.test(input))
                lines.pop();
            const chosen =
                lines.map((line, i) => ({line, i}))
                    .filter(
                        ({line}) => ((flags & 8 ? line.toUpperCase().includes(needle.toUpperCase())
                                                : line.includes(needle))) !== !!(flags & 1));
            let expected = '---- MANUAL.TXT';
            if (flags & 2)
                expected += ': ' + chosen.length + '\n';
            else {
                expected += '\n';
                for (const {line, i} of chosen) {
                    const text = flags & 4 ? (`[${i + 1}]` + line) : line;
                    expected += redirected ? text
                                           : ((flags & 4 ? text.slice(0, 40) : text)
                                                     .match(/.{1,40}/g)
                                                     ?.join('\n') ||
                                                 '');
                    expected += '\n';
                }
            }
            cases.push(`{${literal(input)},${JSON.stringify(needle)},${flags},${redirected},${
                literal(expected)}}`);
        }
const harness = `

#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdarg.h>
#define MAXARGS 44
static char argstore[MAXARGS][32];
static char editbuf[960], *args[MAXARGS], diskcmd[160], out[5000];
static unsigned char argc, argquoted[MAXARGS], eof[16], aborted, ox, pagelines, redirected;
static int errors, cursor[2], noseparators;

/* Convert a fixture counter to decimal text for the captured report.
 *
 * n: Counter value to format. */
static char *decimal(unsigned long n)
{
    static char b[16];
    sprintf(b, "%lu", n);
    return b;
}

static const char *input;

static struct {
    unsigned char dev;
    char name[17];
} p1;

/* Provide the newline hook; fixtures capture it when text layout is under test. */
static void newline(void)
{
    strcat(out, "\\n");
    ox = 0;
}

/* Provide the character-output hook, separately from redirected byte output.
 *
 * c: Character emitted by the production handler. */
static void outc(unsigned char c)
{
    int n = strlen(out);
    out[n] = c;
    out[n + 1] = 0;
    if (!redirected && ++ox == 40)
        newline();
}

/* Format the supplied values into captured output for independent report comparisons.
 *
 * s: Printf-style format string.
 * ...: Values consumed by the format string. */
static void print(const char *s, ...)
{
    char b[100], *p;
    va_list a;
    va_start(a, s);
    vsprintf(b, s, a);
    va_end(a);
    for (p = b; *p; p++) {
        if (*p == 10)
            newline();
        else
            outc(*p);
    }
}

/* Provide a deterministic paging decision without waiting for keyboard input. */
static int page(void)
{
    return 1;
}

/* Provide the cancellation hook without reading the physical keyboard. */
static int stop(void)
{
    return 0;
}

/* Record a reported error so rejection and cleanup can be checked without screen I/O.
 *
 * s: Error message supplied by production code; this fixture observes the reported error. */
static void error(const char *s)
{
    errors++;
}

/* Resolve a controlled fixture path without performing device I/O.
 *
 * s: Path text supplied by the caller.
 * p: Result path or placeholder used by this fixture. */
static int path(const char *s, void *p)
{
    strcpy(p1.name, s);
    return 1;
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

/* Provide a successful input-open hook and fixture-controlled stream state.
 *
 * p: Input path or fixture placeholder.
 * n: Requested input channel. */
static int openread(void *p, int n)
{
    return 1;
}

/* Provide the KERNAL open hook using fixture-controlled device and failure state.
 *
 * a: Logical channel identifier.
 * b: Device identifier.
 * c: Secondary channel address.
 * d: Open command or filename. */
static int channel_open(int a, int b, int c, const char *d)
{
    return 0;
}

/* Provide the close hook; fixtures observe resource cleanup without using KERNAL channels.
 *
 * n: Logical channel identifier. */
static void channel_close(int n)
{
}

/* Provide the fixture status result without reading a physical drive error channel.
 *
 * a: Device identifier.
 * b: Whether the caller requests an error report. */
static int diskstatus(int a, int b)
{
    return 0;
}

/* Read a bounded portion of fixture input while tracking its stream position.
 *
 * channel: Synthetic input channel.
 * p: Destination byte buffer.
 * len: Maximum bytes requested. */
static int readio(int channel, char *p, int len)
{
    int n = 0;
    while (n < len && input[cursor[channel - 2]])
        p[n++] = input[cursor[channel - 2]++];
    return n;
}

${code}
/* Copy search text into writable argument storage for an independent fixture.
 *
 * s: Text copied into writable argument storage. */
static char *argument(const char *s)
{
    strcpy(argstore[argc], s);
    return argstore[argc];
}

/* Reset observable state and load fixture inputs before an independent case.
 *
 * s: Text supplied by the simulated input stream.
 * needle: Text to search for.
 * flags: Flags selecting the FIND matching and output modes. */
static void reset(const char *s, const char *needle, int flags)
{
    int i;
    input = s;
    cursor[0] = cursor[1] = errors = ox = aborted = 0;
    out[0] = 0;
    memset(argquoted, 0, sizeof(argquoted));
    argc = 1;
    for (i = 0; i < 4; i++)
        if (flags & (1 << i)) {
            args[argc] = argument(i == 0 ? "/V" : i == 1 ? "/C" : i == 2 ? "/N" : "/I");
            ++argc;
        }
    argquoted[argc] = 1;
    args[argc] = argument(needle);
    ++argc;
    args[argc] = argument("manual.txt");
    ++argc;
}

// A data table keeps all 96 cases in one loop and avoids an enormous main.
${[...strings].map(([s, n]) => `static const char ${n}[]=${chunks(s)};`).join('\n')}
static const struct {
    const char *input, *needle;
    int flags, redirected;
    const char *expected;
} cases[] = {
    ${cases.join(',\n')}
};

/* Run the independent fixture cases; failure results identify the violated invariant. */
int main(void)
{
    unsigned int i;
    for (i = 0; i < sizeof(cases) / sizeof(cases[0]); ++i) {
        reset(cases[i].input, cases[i].needle, cases[i].flags);
        redirected = cases[i].redirected;
        findcmd();
        if (errors || strcmp(out, cases[i].expected)) {
            printf("FAIL %u: %s", i + 1, out);
            return 1;
        }
    }
    reset("DOS", "DOS", 0);
    argquoted[1] = 0;
    findcmd();
    if (!errors)
        return 2;
    reset("DOS", "DOS", 0);
    args[argc] = argument("extra");
    ++argc;
    findcmd();
    if (!errors)
        return 3;
    reset("DOS", "DOS", 0);
    args[argc] = argument("/X");
    ++argc;
    findcmd();
    if (!errors)
        return 4;
    reset("DOS", "DOS", 0);
    strcpy(args[2], "*");
    findcmd();
    if (!errors)
        return 5;
    reset("x\\n\\n", "", 2);
    findcmd();
    if (strcmp(out, "---- MANUAL.TXT: 2\\n"))
        return 6;
    return 0;
}
`;
fs.writeFileSync('build/test-find.c', harness);
require('./simulator')('build/test-find.c');

console.log(
    'PASS FIND: 192 screen/redirected switch/line fixtures, empty string, and invalid arguments');
