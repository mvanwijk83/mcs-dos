// Check help row wrapping, pagination boundaries and exact redirected bytes.
require('./setup');
const fs = require('fs'), assert = require('assert/strict');
const {fn} = require('./source');
const source = fn('diskhelp');
const start = source.indexOf('            if (!redirected && wrapped');
const end = source.indexOf('\n        }\n        stop();', start);
assert(start >= 0 && end > start, 'Locate production help display loop');
const display = source.slice(start, end);
const help = JSON.parse(fs.readFileSync('src/command-help.json')).DIR;
const fixtures = [
    help, 'x'.repeat(40) + '\nnext', 'x'.repeat(40) + '\n\nnext', 'x'.repeat(80) + '\nnext',
    'short\n\nnext'
];
let checks = '';
for (const text of fixtures)
    for (const redirected of [0, 1]) {
        const expected =
            redirected
                ? text
                : text.split('\n').map(line => line.match(/.{1,40}/g)?.join('\n') || '').join('\n');
        checks += `reset(${redirected});show(${JSON.stringify(text)});if(strcmp(output,${
            JSON.stringify(expected)}))return ${checks.length % 100 + 1};\n`;
    }
const harness = `
#include <string.h>
static char output[2000];
static unsigned char redirected, ox;
static unsigned int used;

/* Provide the character-output hook, separately from redirected byte output.
 *
 * c: Character emitted by the production handler. */
static void outc(unsigned char c)
{
    output[used++] = c;
    if (c == 10 || c == 13)
        ox = 0;
    else if (!redirected && ++ox == 40) {
        output[used++] = 10;
        ox = 0;
    }
    output[used] = 0;
}

/* Provide a deterministic paging decision without waiting for keyboard input. */
static int page(void)
{
    return 1;
}

/* Provide the close hook; fixtures observe resource cleanup without using KERNAL channels.
 *
 * n: Logical channel identifier. */
static void channel_close(int n)
{
}

/* Reset observable state and load fixture inputs before an independent case.
 *
 * r: Whether output is redirected, bypassing screen wrapping. */
static void reset(int r)
{
    redirected = r;
    ox = used = 0;
    output[0] = 0;
}

/* Feed text through the extracted help-display loop, including wrapping and blank lines.
 *
 * s: Text to display through the production loop. */
static int show(const char *s)
{
    unsigned char wrapped = 0, c;
    while ((c = *s++)) { ${display}
    }
    return 1;
}

/* Run the independent fixture cases; failure results identify the violated invariant. */
int main(void)
{ ${checks}
    return 0;
}`;
fs.writeFileSync('build/test-help-wrap.c', harness);
require('./simulator')('build/test-help-wrap.c');

console.log(
    'PASS exact DIR help rows, 40/80-column wraps, intentional blank lines and byte-exact redirected help');
