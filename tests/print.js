require('./setup');
// Run the production TYPE/PRINT handler with observable KERNAL I/O mocks.
const fs = require('fs');
const {functions} = require('./source');
const type = functions('typeoptions', 'typehex', 'typecmd');
const harness = `

#include <stdio.h>
#include <string.h>
#include <ctype.h>
static unsigned char io[256], ox, aborted, pagelines, redirected;
static int argc, p1, pos, length, device, secondary, opened, closed, errors, failopen, failwrite,
    written;
static const char *args[4];
static char input[600], output[600];

/* Resolve a controlled fixture path without performing device I/O.
 *
 * s: Path text supplied by the caller.
 * p: Result path or placeholder used by this fixture. */
static int path(const char *s, int *p)
{
    return 1;
}

/* Provide a successful input-open hook and fixture-controlled stream state.
 *
 * p: Input path or fixture placeholder.
 * n: Requested input channel. */
static int openread(int *p, int n)
{
    return 1;
}

/* Provide the KERNAL open hook using fixture-controlled device and failure state.
 *
 * a: Logical channel identifier.
 * b: Device identifier.
 * c: Secondary channel address.
 * s: Open command or filename. */
static int channel_open(int a, int b, int c, const char *s)
{
    device = b;
    secondary = c;
    ++opened;
    return failopen;
}

/* Provide the close hook; fixtures observe resource cleanup without using KERNAL channels.
 *
 * n: Logical channel identifier. */
static void channel_close(int n)
{
    closed |= 1 << n;
}

/* Provide the device-write hook, allowing command bytes and failure handling to be observed.
 *
 * a: Synthetic channel identifier.
 * b: Source byte buffer.
 * n: Requested byte count. */
static int channel_write(int a, void *b, int n)
{
    if (failwrite)
        return -1;
    memcpy(output + written, b, n);
    written += n;
    return n;
}

/* Record a reported error so rejection and cleanup can be checked without screen I/O.
 *
 * s: Error message supplied by production code; this fixture observes the reported error. */
static void error(const char *s)
{
    ++errors;
}

/* Append an emitted byte to the fixture output so binary content can be compared.
 *
 * c: Byte emitted by the production handler. */
static void outputbyte(unsigned char c)
{
    output[written++] = c;
}

/* Provide the cancellation hook without reading the physical keyboard. */
static void stop(void)
{
}

/* Provide the newline hook; fixtures capture it when text layout is under test. */
static void newline(void)
{
}

/* Provide the character-output hook, separately from redirected byte output.
 *
 * c: Character emitted by the production handler. */
static void outc(unsigned char c)
{
}

/* Provide a deterministic paging decision without waiting for keyboard input. */
static int page(void)
{
    return 1;
}

/* Read a bounded portion of fixture input while tracking its stream position.
 *
 * a: Synthetic input channel.
 * b: Destination byte buffer.
 * size: Maximum bytes requested. */
static int readio(int a, void *b, unsigned int size)
{
    int n = length - pos;
    if (n > size)
        n = size;
    memcpy(b, input + pos, n);
    pos += n;
    return n;
}

${type}
/* Reset observable state and load fixture inputs before an independent case. */
static void reset(void)
{
    pos = written = device = secondary = opened = closed = errors = failopen = failwrite = 0;
}

/* Run the independent fixture cases; failure results identify the violated invariant. */
int main(void)
{
    int i, j;
    const char *names[5];
    names[0] = "4:";
    names[1] = "5:";
    names[2] = "LPT1";
    names[3] = "lpt2";
    names[4] = "6:";
    args[1] = "input";
    length = 600;
    for (i = 0; i < length; ++i)
        input[i] = i;
    for (i = 0; i < 4; ++i) {
        reset();
        argc = 3;
        args[2] = names[i];
        typecmd(1);
        if (device != (i % 2 ? 5 : 4) || secondary != 7 || errors || written != length ||
            memcmp(input, output, length) || closed != 20)
            return 1;
    }
    reset();
    argc = 2;
    typecmd(1);
    if (device != 4 || written != length)
        return 2;
    reset();
    argc = 3;
    args[2] = names[4];
    typecmd(1);
    if (!errors || opened)
        return 3;
    for (j = 0; j < 2; ++j) {
        reset();
        argc = j ? 4 : 1;
        typecmd(1);
        if (!errors || opened)
            return 4;
    }
    reset();
    argc = 2;
    failopen = 1;
    typecmd(1);
    if (!errors || closed != 20)
        return 5;
    reset();
    argc = 2;
    failwrite = 1;
    typecmd(1);
    if (!errors || closed != 20)
        return 6;
    reset();
    argc = 2;
    redirected = 1;
    typecmd(0);
    if (errors || opened || written != length || memcmp(input, output, length) || closed != 4)
        return 7;
    return 0;
}
`;
fs.writeFileSync('build/test-print.c', harness);
require('./simulator')('build/test-print.c');

console.log(
    'PASS PRINT defaults, devices, aliases, raw bytes, invalid arguments and failure cleanup; redirected TYPE raw bytes');
