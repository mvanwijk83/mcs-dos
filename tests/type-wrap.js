// Verify TYPE newline handling, wrapping and pagination independently of KERNAL hardware.
require('./setup');
// Execute the actual TYPE implementation under Oscar64 with mocked disk/screen I/O.
const fs = require('fs'), assert = require('assert/strict');
const {functions} = require('./source');
const type = functions('typeoptions', 'typehex', 'typecmd');
const harness = `

#include <stdio.h>
#include <string.h>
#include <ctype.h>
static unsigned char io[256], ox, aborted, pagelines, redirected;
static int argc = 2, p1, rows, pages, pos, length;
static const char *args[3];
static char input[4096];

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
    return 0;
}

/* Provide the close hook; fixtures observe resource cleanup without using KERNAL channels.
 *
 * n: Logical channel identifier. */
static void channel_close(int n)
{
}

/* Provide the device-write hook, allowing command bytes and failure handling to be observed.
 *
 * a: Synthetic channel identifier.
 * b: Source byte buffer.
 * n: Requested byte count. */
static int channel_write(int a, void *b, int n)
{
    return n;
}

/* Provide the line-output hook; the fixture captures text when report layout is under test.
 *
 * s: Line text supplied by the production handler. */
static void say(const char *s)
{
}

/* Record a reported error so rejection and cleanup can be checked without screen I/O.
 *
 * s: Error message supplied by production code; this fixture observes the reported error. */
static void error(const char *s)
{
}

/* Append an emitted byte to the fixture output so binary content can be compared.
 *
 * c: Byte emitted by the production handler. */
static void outputbyte(unsigned char c)
{
}

/* Provide the cancellation hook without reading the physical keyboard. */
static void stop(void)
{
}

/* Provide the newline hook; fixtures capture it when text layout is under test. */
static void newline(void)
{
    ox = 0;
    ++rows;
}

/* Provide the character-output hook, separately from redirected byte output.
 *
 * c: Character emitted by the production handler. */
static void outc(unsigned char c)
{
    if (c == 13 || c == 10)
        newline();
    else if (++ox == 40)
        newline();
}

/* Provide a deterministic paging decision without waiting for keyboard input. */
static int page(void)
{
    if (++pagelines == 22) {
        ++pages;
        pagelines = 0;
    }
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
/* Compare the current fixture result with its expected output or state.
 *
 * width: Number of text characters in each input line.
 * ending: Bytes separating the input lines.
 * lines: Number of text lines to generate.
 * blank: Whether to insert an empty line after each text line. */
static int check(int width, const char *ending, int lines, int blank)
{
    int i, j;
    length = pos = rows = pages = ox = aborted = 0;
    for (i = 0; i < lines; ++i) {
        for (j = 0; j < width; ++j)
            input[length++] = 'A';
        strcpy(input + length, ending);
        length += strlen(ending);
        if (blank) {
            strcpy(input + length, ending);
            length += strlen(ending);
        }
    }
    typecmd(0);
    i = lines * ((width + 39) / 40 + blank);
    if (rows != i || pages != i / 22 || pos != length) {
        printf("FAIL width=%d lines=%d blank=%d rows=%d expected=%d pages=%d\\n", width, lines,
               blank, rows, i, pages);
        return 1;
    }
    return 0;
}

/* Run the independent fixture cases; failure results identify the violated invariant. */
int main(void)
{
    int w, e, b;
    const char *endings[3];
    int widths[5];
    args[1] = "input";
    endings[0] = "\\r";
    endings[1] = "\\n";
    endings[2] = "\\r\\n";
    widths[0] = 39;
    widths[1] = 40;
    widths[2] = 41;
    widths[3] = 80;
    widths[4] = 15;
    for (w = 0; w < 5; ++w)
        for (e = 0; e < 3; ++e)
            for (b = 0; b < 2; ++b)
                if (check(widths[w], endings[e], 30, b))
                    return 1;
    return 0;
}
`;
fs.writeFileSync('build/test-type-wrap.c', harness);
require('./simulator')('build/test-type-wrap.c');

console.log(
    'PASS: TYPE wrapping, blank lines, CR/LF/CRLF, read boundaries and pagination (30 cases)');
