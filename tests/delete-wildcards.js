require('./setup');
const fs = require('fs');
const {functions} = require('./source');
const harness = `

#include <string.h>
#include <stdio.h>
#include <ctype.h>

typedef struct {
    unsigned char dev;
    char name[17];
} Path;

static Path p1;
static unsigned char aborted;
static unsigned int count;
static int argc, errors, prompts, deleted, loads, faildir, failscratch, locked;
static char *args[4], patternarg[17], switcharg[3] = "/P";
static const char *answers;

static struct {
    char name[17];
} files[4];

static char requests[4][24], removed[4][17];

/* Resolve a controlled fixture path without performing device I/O.
 *
 * s: Path text supplied by the caller.
 * p: Result path or placeholder used by this fixture. */
static int path(const char *s, Path *p)
{
    p->dev = 8;
    strcpy(p->name, s);
    return 1;
}

/* Record a reported error so rejection and cleanup can be checked without screen I/O.
 *
 * s: Error message supplied by production code; this fixture observes the reported error. */
static void error(const char *s)
{
    ++errors;
}

/* Provide the fixture deletion policy independently of actual media access.
 *
 * p: Controlled candidate path. */
static int deletable(const Path *p)
{
    return !locked;
}

/* Provide fixture directory metadata instead of loading a physical disk.
 *
 * dev: Synthetic device identifier. */
static int directory(int dev)
{
    ++loads;
    if (faildir)
        return 0;
    count = 4;
    strcpy(files[0].name, "one.txt");
    strcpy(files[1].name, "other.bin");
    strcpy(files[2].name, "two.txt");
    strcpy(files[3].name, "three.txt");
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

/* Return a planned answer and observe confirmations without reading a keyboard.
 *
 * s: Confirmation prompt supplied by the production handler. */
static int yesno(const char *s)
{
    strcpy(requests[prompts], s);
    return answers[prompts++] == 'Y';
}

/* Record a simulated file deletion without changing physical media.
 *
 * p: Fixture path identifying the file selected for deletion. */
static int scratch(const Path *p)
{
    strcpy(removed[deleted++], p->name);
    return !failscratch;
}

${functions('match', 'delcmd')}
/* Prepare fixture arguments and observable state, then call the production handler.
 *
 * pattern: File name or wildcard pattern to delete.
 * reply: Simulated answers to confirmation prompts.
 * suppress: Whether confirmation prompts are suppressed. */
static void run(const char *pattern, const char *reply, int suppress)
{
    errors = prompts = deleted = loads = aborted = 0;
    argc = suppress ? 3 : 2;
    strcpy(patternarg, pattern);
    args[1] = patternarg;
    args[2] = switcharg;
    answers = reply;
    delcmd();
}

/* Run the independent fixture cases; failure results identify the violated invariant. */
int main(void)
{
    run("*.txt", "YNY", 0);
    if (errors || prompts != 3 || deleted != 2 || loads != 1 || strcmp(removed[0], "one.txt") ||
        strcmp(removed[1], "three.txt"))
        return 1;
    if (strcmp(requests[0], "Delete ONE.TXT") || strcmp(requests[1], "Delete TWO.TXT") ||
        strcmp(requests[2], "Delete THREE.TXT"))
        return 2;
    run("*.txt", "NNN", 0);
    if (errors || deleted || prompts != 3)
        return 3;
    run("t??.txt", "Y", 0);
    if (errors || deleted != 1 || prompts != 1 || strcmp(removed[0], "two.txt"))
        return 4;
    run("*.txt", "", 1);
    if (errors || prompts || loads || deleted != 1 || strcmp(removed[0], "*.txt"))
        return 5;
    run("*.none", "", 0);
    if (errors != 1 || prompts || deleted)
        return 6;
    failscratch = 1;
    run("*.txt", "YYY", 0);
    if (prompts != 1 || deleted != 1)
        return 7;
    failscratch = 0;
    faildir = 1;
    run("*.txt", "YYY", 0);
    if (prompts || deleted)
        return 8;
    faildir = 0;
    locked = 1;
    run("*.txt", "YYY", 0);
    if (prompts || deleted || loads)
        return 9;
    locked = 0;
    run("one.txt", "Y", 0);
    if (errors || loads || prompts != 1 || deleted != 1)
        return 10;
    return 0;
}
`;
fs.writeFileSync('build/test-delete-wildcards.c', harness);
require('./simulator')('build/test-delete-wildcards.c');
console.log(
    'PASS wildcard DEL individual choices, names, skipped files, /P, no matches and failures');
