// Validate command reports and rejected options through observable output and side effects.
require('./setup');
const fs = require('fs');
const {functions} = require('./source');
let code = 'static unsigned char noseparators,validate;\n' +
           functions('decimal', 'allocated', 'reportoptions', 'freememory', 'memcmd', 'deletable',
               'delcmd', 'driveinfo', 'volcmd');
code = code.replace(/static unsigned char deletable\(const Path \*p\)\s*\{[\s\S]*?\n\}/,
    'static unsigned char deletable(void *p) { return 1; }');
code = code.replace(/static unsigned int freememory\(void\)\s*\{[\s\S]*?\n\}/,
    'static unsigned int freememory(void) { return 2000; }');
const harness = `

#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdarg.h>
static int argc, errors, prompts, deleted, answer = 1;
static char *args[12], argstore[2][20];
static char out[1000], volume[17] = "TEST", io[256];
static unsigned char drive = 8, redirected, idoff = 162, aborted;
static unsigned int count = 2;
static unsigned int freeblocks = 660;
static char BSSEnd;
#define SHELL_STACK_SIZE 2048U

static struct {
    unsigned char dev;
    char name[17];
} p1;

static struct {
    unsigned int blocks;
    char name[17];
} files[2] = {{2, "one"}, {2, "two"}};

/* Resolve a controlled fixture path without performing device I/O.
 *
 * s: Path text supplied by the caller.
 * p: Result path or placeholder used by this fixture. */
static int path(const char *s, void *p)
{
    p1.name[0] = 0;
    if (!strchr(s, ':'))
        strcpy(p1.name, s);
    return 1;
}

/* Record a reported error so rejection and cleanup can be checked without screen I/O.
 *
 * s: Error message supplied by production code; this fixture observes the reported error. */
static void error(const char *s)
{
    ++errors;
}

/* Provide the line-output hook; the fixture captures text when report layout is under test.
 *
 * s: Line text supplied by the production handler. */
static void say(const char *s)
{
    strcat(out, s);
    strcat(out, "\\n");
}

/* Capture an un-terminated string without adding a newline.
 *
 * s: Text to emit without a newline. */
static void outs(const char *s)
{
    strcat(out, s);
}

/* Provide the newline hook; fixtures capture it when text layout is under test. */
static void newline(void)
{
    strcat(out, "\\n");
}

/* Format the supplied values into captured output for independent report comparisons.
 *
 * s: Printf-style format string.
 * ...: Values consumed by the format string. */
static void print(const char *s, ...)
{
    char b[200];
    va_list a;
    va_start(a, s);
    vsprintf(b, s, a);
    va_end(a);
    strcat(out, b);
}

/* Return predictable cartridge statistics so report values can be checked independently.
 *
 * line: Statistic selector: capacity, allocation or file count. */
static const char *cart_stats(unsigned char line)
{
    return line == 0 ? "64000" : line == 1 ? "12345" : "5";
}

static int compactions, compactresult = 1;

/* Count compaction requests and return the configured result without writing flash. */
static int cart_compact(void)
{
    ++compactions;
    return compactresult;
}

/* Return a planned answer and observe confirmations without reading a keyboard.
 *
 * s: Confirmation prompt supplied by the production handler. */
static int yesno(const char *s)
{
    ++prompts;
    return answer;
}

/* Record a simulated file deletion without changing physical media.
 *
 * p: Fixture path identifying the file selected for deletion. */
static int scratch(void *p)
{
    ++deleted;
    return 1;
}

/* Accept controlled fixture candidates; wildcard matching has its own dedicated coverage.
 *
 * p: Controlled wildcard pattern.
 * s: Controlled candidate name. */
static int match(const char *p, const char *s)
{
    return 1;
}

/* Provide the DOS command interface without talking to a physical disk drive.
 *
 * d: Device identifier.
 * s: DOS command text. */
static int command(int d, const char *s)
{
    return 1;
}

/* Provide fixture directory metadata instead of loading a physical disk.
 *
 * d: Synthetic device identifier. */
static int directory(int d)
{
    return 1;
}

/* Provide a successful allocation-map lookup; the fixture supplies disk counts directly.
 *
 * d: Synthetic device identifier. */
static int bam(int d)
{
    return 1;
}

static unsigned char model = 1;

/* Supply the configured drive model so report formatting can be tested independently.
 *
 * d: Device identifier.
 * report: Whether the caller requests an error report. */
static int drivemodel(int d, int report)
{
    return model;
}

/* Provide filename conversion for controlled fixture inputs.
 *
 * s: Source name.
 * d: Destination name buffer. */
static void uppername(const char *s, char *d)
{
    strcpy(d, s);
}

/* Provide the volume-heading hook without introducing unrelated directory output.
 *
 * d: Synthetic device identifier. */
static void volumeheader(int d)
{
}

${code}
/* Reset observable state and load fixture inputs before an independent case.
 *
 * a: First optional command argument; null omits it.
 * b: Second optional command argument; null omits it. */
static void reset(const char *a, const char *b)
{
    out[0] = 0;
    errors = prompts = deleted = noseparators = 0;
    argc = 1;
    if (a) {
        strcpy(argstore[0], a);
        args[argc++] = argstore[0];
    }
    if (b) {
        strcpy(argstore[1], b);
        args[argc++] = argstore[1];
    }
}

/* Run the independent fixture cases; failure results identify the violated invariant. */
int main(void)
{
    int i;
    const char *removed[11];
    removed[0] = "/T";
    removed[1] = "/U";
    removed[2] = "/F";
    removed[3] = "/R";
    removed[4] = "/A";
    removed[5] = "/T:0";
    removed[6] = "/A:1";
    removed[7] = "/F:1";
    removed[8] = "/X";
    removed[9] = "/S";
    removed[10] = "/s";
    for (i = 0; i < 11; ++i) {
        reset(removed[i], 0);
        memcmd();
        if (!errors || out[0])
            return 1;
        reset(removed[i], 0);
        volcmd(1);
        if (!errors || out[0])
            return 2;
    }
    reset(0, 0);
    memcmd();
    if (errors || !strstr(out, "65,536 bytes total") || !strstr(out, "bytes reserved for system") ||
        strstr(out, "REU"))
        return 3;
    reset("/s", 0);
    memcmd();
    if (!errors || out[0])
        return 4;
    reset(0, 0);
    volcmd(1);
    if (errors || !strstr(out, "169,984 bytes total") || !strstr(out, "1,024 bytes allocated"))
        return 5;
    if (strstr(out, "memory"))
        return 19;
    drive = 0;
    reset(0, 0);
    volcmd(1);
    if (errors || !strstr(out, " 64,000 bytes total disk space") ||
        !strstr(out, " 12,345 bytes allocated in 5 files") ||
        !strstr(out, " 51,655 bytes available on disk") || strstr(out, "blocks") ||
        strstr(out, "memory"))
        return 20;
    reset(0, 0);
    noseparators = 1;
    volcmd(1);
    if (!strstr(out, "  64000 bytes total disk space") || strchr(out, ','))
        return 21;
    reset("/c", 0);
    volcmd(1);
    if (errors || compactions != 1 || strcmp(out, SYSOUT_COMPACT_COMPLETE "\\n"))
        return 22;
    compactresult = 0;
    reset("/C", 0);
    volcmd(1);
    if (errors || strcmp(out, SYSOUT_ALREADY_COMPACT "\\n"))
        return 23;
    compactresult = -1;
    reset("/C", 0);
    volcmd(1);
    if (!errors || out[0])
        return 24;
    reset("/V", "/C");
    volcmd(1);
    if (!errors || compactions != 3)
        return 25;
    reset("/C", 0);
    memcmd();
    if (!errors || compactions != 3)
        return 26;
    if (strstr(out, "Drive model"))
        return 28;
    drive = 8;
    reset(0, 0);
    volcmd(1);
    if (!strstr(out, "\\n\\nDrive model is 1541\\nDrive identifier is 8 (CBM) / A (DOS)\\n"))
        return 29;
    drive = 9;
    model = 2;
    reset(0, 0);
    volcmd(1);
    if (!strstr(out, "Drive model is 1571\\nDrive identifier is 9 (CBM) / B (DOS)\\n"))
        return 30;
    drive = 30;
    model = 3;
    reset(0, 0);
    volcmd(1);
    if (!strstr(out, "Drive model is 1581\\nDrive identifier is 30 (CBM) / W (DOS)\\n"))
        return 31;
    drive = 0;
    reset(0, 0);
    volcmd(1);
    if (!strstr(out, "\\n\\nDrive model is EasyFlash\\nDrive identifier is 0\\n"))
        return 32;
    drive = 8;
    reset("/V", 0);
    volcmd(1);
    if (errors || strstr(out, "Drive model"))
        return 33;
    drive = 8;
    reset("/C", 0);
    volcmd(1);
    if (!errors || compactions != 3)
        return 27;
    reset("8:", "/S");
    volcmd(1);
    if (!errors || out[0])
        return 6;
    reset("/s", "8:");
    volcmd(1);
    if (!errors || out[0])
        return 7;
    reset("8:", 0);
    volcmd(1);
    if (errors || !strstr(out, "169,984 bytes total"))
        return 11;
    reset("8:", "9:");
    volcmd(1);
    if (!errors || out[0])
        return 8;
    reset("file", 0);
    volcmd(1);
    if (!errors || out[0])
        return 9;
    reset("8:", 0);
    memcmd();
    if (!errors || out[0])
        return 10;
    reset("file", 0);
    delcmd();
    if (prompts != 1 || deleted != 1)
        return 13;
    reset("*", "/p");
    delcmd();
    if (prompts || deleted != 1)
        return 14;
    reset("/P", "file");
    delcmd();
    if (prompts || deleted != 1)
        return 15;
    reset("file", "/X");
    delcmd();
    if (!errors || deleted || prompts)
        return 16;
    reset("/P", 0);
    delcmd();
    if (!errors || deleted)
        return 17;
    reset("file", 0);
    answer = 0;
    delcmd();
    if (prompts != 1 || deleted)
        return 18;
    return 0;
}
`;
fs.writeFileSync('build/test-amount-switches.c', harness);
require('./simulator')('build/test-amount-switches.c');

console.log(
    'PASS full MEM/CHKDSK reports, removed switch rejection, drive arguments and DEL confirmation');
