// Exercise directory cache boundaries, last-entry lookup and failed-read invalidation.
require('./setup');
// Include the transition beyond an 8-bit count and the configured cache limit.
const fs = require('fs');
const {functions, constant} = require('./source');
const capacity = constant('MAXFILES');
const code = functions('directory', 'findfile');
const harness = `

#include <stdio.h>
#include <string.h>
#define MAXFILES ${capacity}

typedef struct {
    unsigned char dev;
    char name[17];
} Path;

struct DirectoryEntry {
    char name[17];
    unsigned int size;
    unsigned char type;
};

static struct {
    char name[17];
    unsigned int blocks;
    unsigned char type;
} files[MAXFILES];

static unsigned int count, freeblocks, available, cursor;
static unsigned char cachevalid, cachedev, errors, closed, failmode;
static char volume[17];

/* Record a reported error so rejection and cleanup can be checked without screen I/O.
 *
 * s: Error message supplied by production code; this fixture observes the reported error. */
static void error(const char *s)
{
    ++errors;
}

/* Provide the synthetic drive family needed by this isolated test.
 *
 * d: Device identifier.
 * report: Whether the caller requests an error report. */
static unsigned char drivetype(unsigned char d, unsigned char report)
{
    return 2;
}

/* Provide the DOS command interface without talking to a physical disk drive.
 *
 * d: Device identifier.
 * s: DOS command text. */
static unsigned char command(unsigned char d, const char *s)
{
    return !failmode;
}

/* Start the synthetic directory stream at its header record.
 *
 * f: Synthetic file/channel identifier.
 * d: Synthetic device identifier. */
static unsigned char directory_open(unsigned char f, unsigned char d)
{
    cursor = 0;
    return 0;
}

/* Provide the close hook; fixtures observe resource cleanup without using KERNAL channels.
 *
 * f: Logical channel identifier. */
static void channel_close(unsigned char f)
{
    ++closed;
}

/* Supply the volume header, file entries and final free-block record in order.
 *
 * f: Synthetic directory channel.
 * e: Record receiving the next header, file or free-block entry. */
static unsigned char directory_read(unsigned char f, struct DirectoryEntry *e)
{
    if (!cursor++) {
        strcpy(e->name, "test");
        return 0;
    }
    if (cursor - 2 == available) {
        e->size = 111;
        return 2;
    }
    sprintf(e->name, "f%03u", cursor - 2);
    e->size = 1;
    e->type = 16;
    return 0;
}

${code}
/* Run the independent fixture cases; failure results identify the violated invariant. */
int main(void)
{
    Path p;
    unsigned int n, i;
    const unsigned int sizes[] = {1, 255, 256, MAXFILES - 1, MAXFILES};
    p.dev = 8;
    for (i = 0; i < sizeof(sizes) / sizeof(sizes[0]); ++i) {
        n = sizes[i];
        if (n > MAXFILES)
            continue;
        available = n;
        closed = errors = 0;
        if (!directory(8) || count != n || !cachevalid || closed != 1 || errors ||
            freeblocks != 111)
            return 1;
        sprintf(p.name, "f%03u", n - 1);
        if (findfile(&p) != n - 1)
            return 2;
    }
    available = MAXFILES + 1;
    closed = errors = 0;
    if (directory(8) || cachevalid || closed != 1 || errors != 1)
        return 3;
    cachevalid = 1;
    count = 123;
    failmode = 1;
    if (directory(8) || cachevalid || count)
        return 4;
    return 0;
}
`;
fs.writeFileSync('build/test-cache-capacity.c', harness);
require('./simulator')('build/test-cache-capacity.c');

console.log(
    'PASS 8-bit count boundary, configured cache capacity, last-entry lookup, oversized refusal and failed-mode invalidation');
