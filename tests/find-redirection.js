// Observe FIND destination validation and channel lifecycle independently of file data.
require('./setup');
const fs = require('fs');
const {functions, commands, header} = require('./source');
const harness = `

#include <string.h>
#include <stdio.h>
#include <ctype.h>
#define MAXARGS      ${header.match(/^#define MAXARGS (\d+)/m)[1]}
#define COMMANDCOUNT ${commands.length}
static const char *const commands[] = {${commands.map(name => JSON.stringify(name)).join(',')}};
#define CBM_T_SEQ 16
#define CBM_T_PRG 17
#define CBM_T_USR 18

typedef struct {
    unsigned char dev;
    char name[17];
} Path;

static Path p1, outputpath;
static unsigned char argc, argquoted[MAXARGS], aborted, redirected, outputused, outputfailed,
    outputcol, cachevalid, drive = 8;
static char line[160], parsebuf[160], rawparse[160], rawline[160], diskcmd[160], *args[MAXARGS];

static struct {
    unsigned char type;
} files[1] = {{CBM_T_SEQ}};

static int errors, opened, deleted, executed;
static const char *message;

/* Ignore raw-byte annotations here; exact PETSCII filename handling has integration coverage.
 *
 * p: Raw-byte flag map, unused here.
 * i: Requested flag position.
 * v: Requested flag value. */
static void rawset(void *p, int i, int v)
{
}

/* Report no raw-byte annotations for these controlled ASCII-only arguments.
 *
 * p: Raw-byte flag map, unused for the controlled ASCII inputs.
 * i: Requested flag position. */
static int rawget(void *p, int i)
{
    return 0;
}

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

${functions('commandid')}
/* Resolve the fixture file entry or simulate a missing input before output is opened.
 *
 * p: Controlled input path. */
static int findfile(const Path *p)
{
    return !strcmp(p->name, "missing") ? -1 : 0;
}

/* Record a simulated file deletion without changing physical media.
 *
 * p: Fixture path identifying the file selected for deletion. */
static int scratch(const Path *p)
{
    ++deleted;
    return 1;
}

/* Return a synthetic status-channel handle without opening a drive.
 *
 * dev: Synthetic device identifier. */
static int statuschannel(int dev)
{
    return 15;
}

/* Provide the KERNAL open hook using fixture-controlled device and failure state.
 *
 * l: Logical channel identifier.
 * dev: Device identifier.
 * sa: Secondary channel address.
 * s: Open command or filename. */
static int channel_open(int l, int dev, int sa, const char *s)
{
    ++opened;
    return 0;
}

/* Provide the close hook; fixtures observe resource cleanup without using KERNAL channels.
 *
 * l: Logical channel identifier. */
static void channel_close(int l)
{
}

/* Provide the fixture status result without reading a physical drive error channel.
 *
 * dev: Device identifier.
 * report: Whether the caller requests an error report. */
static int diskstatus(int dev, int report)
{
    return 0;
}

/* Provide the flush hook without performing actual disk output. */
static void outputflush(void)
{
}

/* Count accepted dispatches without invoking unrelated command handlers.
 *
 * s: Accepted command text; the mock observes dispatch instead of executing it. */
static void executecommand(char *s)
{
    ++executed;
}

${functions('path', 'typeoptions', 'findoptions', 'tokenize', 'execute')}
/* Prepare fixture arguments and observable state, then call the production handler.
 *
 * s: Command line dispatched through the production command parser. */
static void run(const char *s)
{
    strcpy(line, s);
    errors = opened = deleted = executed = 0;
    message = "";
    execute(line);
}

/* Check that a rejected command reports one error without opening, deleting or executing output.
 *
 * s: Command whose rejection must leave output state untouched. */
static int rejected(const char *s)
{
    run(s);
    return errors == 1 && !opened && !deleted && !executed;
}

/* Run the independent fixture cases; failure results identify the violated invariant. */
int main(void)
{
    if (!rejected("HELP >out") || !rejected("HELP FIND >>out") || !rejected("FIND /? >out") ||
        !rejected("DIR /? >out"))
        return 1;
    if (!rejected("FIND \\"word\\" input >input") ||
        strcmp(message, SYSOUT_CANNOT_REDIR_FIND_ON_SELF))
        return 2;
    if (!rejected("FIND /C \\"word\\" input >>A:input"))
        return 3;
    if (!rejected("FIND \\"word\\" missing >out") || strcmp(message, SYSOUT_FILE_NOT_FOUND))
        return 4;
    if (!rejected("FIND /X \\"word\\" input >out") || !rejected("FIND word input >out"))
        return 5;
    run("FIND /N \\"word\\" input >out");
    if (errors || opened != 1 || deleted != 1 || executed != 1 || redirected)
        return 6;
    run("FIND /C \\"word\\" input >>out");
    if (errors || opened != 1 || deleted || executed != 1 || !strstr(diskcmd, ",a"))
        return 7;
    run("FIND \\"/?\\" input >out");
    if (errors || opened != 1 || executed != 1)
        return 8;
    run("FIND \\"a>b\\" input >out");
    if (errors || opened != 1 || executed != 1)
        return 9;
    run("FIND \\"word\\" input >9:input");
    if (errors || opened != 1 || executed != 1)
        return 10;
    run("HELP FIND");
    if (errors || opened || executed != 1)
        return 11;
    return 0;
}
`;
fs.writeFileSync('build/test-find-redirection.c', harness);
require('./simulator')('build/test-find-redirection.c');
console.log(
    'PASS FIND redirection validation, append, input protection, quoted help/redirect characters and HELP rejection');
