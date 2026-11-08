// Exercise the production loader at its file-size boundary and protect adjacent RAM.
require('./setup');
const fs = require('fs'), {fn, constant} = require('./source');
fs.writeFileSync('build/test-batch-loading.c', `
#include <string.h>
#define BATCHMAX ${constant('BATCHMAX')}
typedef struct Path { unsigned char dev; } Path;
static Path p1;
static struct { char bytes[BATCHMAX + 1]; unsigned char guard; } storage;
#define batch storage.bytes
static unsigned char batching, io[256], opened, closed, messages, failopen, failread;
static unsigned int batchpos, batchlen, available, position;
static const char *message;
static unsigned char openread(const Path *p, unsigned char lfn) {
    ++opened;
    return !failopen;
}
static int readio(unsigned char lfn, void *buffer, unsigned int size) {
    unsigned int n = available - position;
    if (failread) return -1;
    if (n > size) n = size;
    memset(buffer, 'x', n);
    position += n;
    return n;
}
static void channel_close(unsigned char lfn) { ++closed; }
static void say(const char *s) { ++messages; message = s; }
${fn('runbatch')}
static void reset(unsigned int size) {
    memset(&storage, 0x5a, sizeof(storage));
    batching = opened = closed = messages = failopen = failread = 0;
    batchpos = 99; batchlen = 0;
    available = size; position = 0;
}
int main(void) {
    unsigned int size;
    for (size = BATCHMAX - 1; size <= BATCHMAX; ++size) {
        reset(size); runbatch();
        if (!batching || batchlen != size || batchpos || opened != 1 || closed != 1 || messages) return 1;
        if (batch[size] || storage.guard != 0x5a || batch[size - 1] != 'x') return 2;
    }
    reset(BATCHMAX + 1); runbatch();
    if (batching || messages != 1 || strcmp(message, SYS_BATCH_TOO_LARGE_OR_UNREADABLE) || closed != 1) return 3;
    if (position != BATCHMAX + 1 || storage.guard != 0x5a) return 4;
    reset(0); runbatch();
    if (!batching || batchlen || batchpos || batch[0] || closed != 1) return 5;
    reset(10); failread = 1; runbatch();
    if (batching || messages != 1 || closed != 1) return 6;
    reset(10); failopen = 1; runbatch();
    if (batching || closed || messages) return 7;
    reset(10); batching = 1; batchlen = 10; batchpos = 4; runbatch();
    if (!batching || batchlen != 10 || batchpos != 4 || opened || closed || messages != 1) return 8;
    if (strcmp(message, SYSOUT_NESTED_BATCH) || batch[0] != 0x5a || storage.guard != 0x5a) return 9;
    return 0;
}
`);
require('./simulator')('build/test-batch-loading.c');
console.log('PASS batch size limit, terminator, overflow rejection, adjacent RAM, empty/read/open failures and nesting');
