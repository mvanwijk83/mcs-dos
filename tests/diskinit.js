require('./setup');
const fs = require('fs');
const {functions} = require('./source');
const harness = `

#include <string.h>
#include <ctype.h>

typedef struct {
    unsigned char dev;
    char name[17];
} Path;

static Path p1;
static unsigned char drive = 8;
static int argc, errors, calls, device;
static const char *args[3], *message;
static char sent[8];

/* Record a reported error so rejection and cleanup can be checked without screen I/O.
 *
 * s: Error message supplied by production code; this fixture observes the reported error. */
static void error(const char *s)
{
    ++errors;
    message = s;
}

/* Provide controlled filename conversion for the fixture paths.
 *
 * s: Source filename.
 * d: Destination filename buffer. */
static void filename(const char *s, char *d)
{
    strcpy(d, s);
}

/* Provide the DOS command interface without talking to a physical disk drive.
 *
 * dev: Device identifier.
 * s: DOS command text. */
static int command(unsigned char dev, const char *s)
{
    ++calls;
    device = dev;
    strcpy(sent, s);
    return 1;
}

${functions('path', 'diskinitcmd')}
/* Prepare fixture arguments and observable state, then call the production handler.
 *
 * arg: Optional device argument; null selects the current drive. */
static void run(const char *arg)
{
    argc = arg ? 2 : 1;
    args[1] = arg;
    errors = calls = 0;
    message = "";
    diskinitcmd();
}

/* Run the independent fixture cases; failure results identify the violated invariant. */
int main(void)
{
    run(0);
    if (errors || calls != 1 || device != 8 || strcmp(sent, "i0"))
        return 1;
    run("9:");
    if (errors || calls != 1 || device != 9 || drive != 8)
        return 2;
    run("b:");
    if (errors || calls != 1 || device != 9)
        return 3;
    run("0:");
    if (errors != 1 || calls || strcmp(message, SYSOUT_UNSUPPORTED_OP_CRT))
        return 4;
    drive = 0;
    run(0);
    if (errors != 1 || calls || strcmp(message, SYSOUT_UNSUPPORTED_OP_CRT))
        return 5;
    run("8:");
    if (errors || calls != 1 || device != 8 || drive != 0)
        return 6;
    run("8:file");
    if (errors != 1 || calls)
        return 7;
    run("8");
    if (errors != 1 || calls)
        return 8;
    run("");
    if (errors != 1 || calls)
        return 9;
    run("31:");
    if (errors != 1 || calls)
        return 10;
    run("/x");
    if (errors != 1 || calls)
        return 11;
    errors = calls = 0;
    argc = 3;
    diskinitcmd();
    if (errors != 1 || calls || strcmp(message, SYSOUT_SYNTAX_DISKINIT))
        return 12;
    return 0;
}
`;
fs.writeFileSync('build/test-diskinit.c', harness);
require('./simulator')('build/test-diskinit.c');
console.log(
    'PASS DISKINIT default/explicit drives, letters, I0 command, cartridge and invalid argument rejection');
