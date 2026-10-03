// Check COPY source-list boundaries without dropping or truncating an argument.
require('./setup');
const fs = require('fs');
const {functions} = require('./source');
const code = functions('concatcmd', 'tokenize');
const harness = `

#include <stdio.h>
#include <string.h>
#define MAXARGS 33
static char *args[MAXARGS], parsebuf[98], line[65], rawparse[13], rawline[9], sent[41];
static unsigned char argc, drive = 8, argquoted[MAXARGS];
static int errors, calls;

typedef struct {
    unsigned char dev;
    char name[17];
} Path;

static Path p1, p2;

/* Report no raw-byte annotations for these controlled ASCII-only arguments.
 *
 * m: Raw-byte flag map, unused for the controlled ASCII inputs.
 * p: Requested flag position. */
static int rawget(char *m, int p)
{
    return 0;
}

/* Ignore raw-byte annotations here; exact PETSCII filename handling has integration coverage.
 *
 * m: Raw-byte flag map, unused here.
 * p: Requested flag position.
 * v: Requested flag value. */
static void rawset(char *m, int p, int v)
{
}

/* Record a reported error so rejection and cleanup can be checked without screen I/O.
 *
 * s: Error message supplied by production code; this fixture observes the reported error. */
static void error(const char *s)
{
    ++errors;
}

/* Resolve a controlled fixture path without performing device I/O.
 *
 * s: Path text supplied by the caller.
 * p: Result path or placeholder used by this fixture. */
static int path(const char *s, Path *p)
{
    p->dev = drive;
    strcpy(p->name, s);
    return 1;
}

/* Provide the line-output hook; the fixture captures text when report layout is under test.
 *
 * s: Line text supplied by the production handler. */
static void say(const char *s)
{
}

/* Provide the DOS command interface without talking to a physical disk drive.
 *
 * d: Device identifier.
 * s: DOS command text. */
static int command(int d, const char *s)
{
    ++calls;
    strcpy(sent, s);
    return 1;
}

/* Accept the controlled destination without creating an actual disk file.
 *
 * p: Controlled output path. */
static int preparewrite(const Path *p)
{
    return 1;
}

${code}
/* Run the independent fixture cases; failure results identify the violated invariant. */
int main(void)
{
    strcpy(line, "copy abcdefghijklmnop+abc abcdefghijklmnop");
    if (!tokenize(line))
        return 1;
    concatcmd();
    if (calls != 1 || strlen(sent) != 40)
        return 2;
    strcpy(line, "copy abcdefghijklmnop+abcd abcdefghijklmnop");
    tokenize(line);
    concatcmd();
    if (calls != 1 || errors != 1)
        return 3;
    strcpy(line, "copy a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a x");
    if (!tokenize(line))
        return 4;
    concatcmd();
    if (calls != 2 || strlen(sent) != 40)
        return 5;
    strcpy(line, "copy a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a x");
    tokenize(line);
    concatcmd();
    if (calls != 2 || errors != 2)
        return 6;
    return 0;
}`;
fs.writeFileSync('build/test-concat-limits.c', harness);
require('./simulator')('build/test-concat-limits.c');
console.log('PASS COPY concatenation 40/41 character boundary and 18/19-source token lists');
