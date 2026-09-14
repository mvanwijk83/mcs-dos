// Exercise the production formatter and screen writer with Oscar64 in VICE.
const fs = require('fs');
const {execFileSync} = require('child_process');
const source = fs.readFileSync('src/c64-support.c', 'utf8');
const formatter = source.slice(source.indexOf('int vsnprintf('))
    .replace(/\bvsnprintf\b/g, 'test_vsnprintf').replace(/\bsnprintf\b/g, 'test_snprintf');
const screen = source.slice(source.indexOf('void screen_reverse('), source.indexOf('void screen_puts('));
const literal = text => JSON.stringify(text).replace(/\\u0000/g, '\\0');
const cases = [];
for (const value of ['', 'a', 'example', 'a'.repeat(40)]) {
    for (const width of [0, 1, 3, 12]) {
        for (const left of [false, true]) {
            const format = '%' + (left ? '-' : '') + (width || '') + 's';
            cases.push({format, args: literal(value), expected: left ? value.padEnd(width) : value.padStart(width)});
        }
    }
}
for (const value of [0, 9, 10, 255, 256, 32768, 65535]) {
    cases.push({format: '[%8u][%-8u]', args: `${value}U, ${value}U`,
        expected: '[' + String(value).padStart(8) + '][' + String(value).padEnd(8) + ']'});
}
cases.push({format: '%c%%:%s:%u', args: `0, "text", 65535U`, expected: '\0%:text:65535'});
let checks = '', count = 0;
for (const fixture of cases) {
    for (const cap of [0, 1, 2, 5, 16, 64]) {
        checks += `memset(buffer, 90, sizeof(buffer));\n`;
        checks += `n = test_snprintf(buffer + 1, ${cap}, ${literal(fixture.format)}, ${fixture.args});\n`;
        checks += `if (!check(${cap}, ${literal(fixture.expected)}, ${fixture.expected.length}, n)) { *(volatile unsigned int *)0x02a8 = ${count}; return 1; }\n`;
        ++count;
    }
}
const harness = `
#include <stdio.h>
#include <string.h>
#include <stdarg.h>
typedef const char *StringPtr;
static unsigned char reverse_mask, x, y, writes, values[2];
static unsigned int addresses[2];
static unsigned char wherex(void) { return x; }
static unsigned char wherey(void) { return y; }
static void gotoxy(unsigned char a, unsigned char b) { x = a; y = b; }
#define PEEK(a) ((a) == 648 ? 224 : 7)
#define POKE(a,v) (addresses[writes]=(a),values[writes++]=(v))
${screen}
${formatter}
static char buffer[68];
/* Preserve the former branch-based conversion as an independent oracle. */
static unsigned char expected_screen(unsigned char c) {
    if (c < 32) return c + 128;
    if (c < 64) return c;
    if (c < 96) return c - 64;
    if (c < 128) return c - 32;
    if (c < 160) return c + 64;
    if (c < 192) return c - 64;
    return c - 128;
}
static int check(unsigned int cap, const char *expected, unsigned int len, int n) {
    unsigned int kept, i;
    if (n != len || buffer[0] != 90) return 0;
    kept = cap ? (len < cap ? len : cap - 1) : 0;
    if (cap && (memcmp(buffer + 1, expected, kept) || buffer[kept + 1])) return 0;
    for (i = cap ? kept + 2 : 1; i < sizeof(buffer); ++i)
        if (buffer[i] != 90) return 0;
    return 1;
}
int test_main(void) {
    unsigned int c;
    unsigned char reverse;
    int n;
    ${checks}
    for (reverse = 0; reverse < 2; ++reverse) {
        screen_reverse(reverse);
        for (c = 0; c < 256; ++c) {
            x = 39; y = 24; writes = 0;
            screen_putc(c);
            if (writes != 2 || addresses[0] != 0xe3e7 || addresses[1] != 0xdbe7 ||
                values[0] != (expected_screen(c) | (reverse ? 128 : 0)) ||
                values[1] != 7 || x || y != 24) return 2;
        }
    }
    x = 3; y = 4; writes = 0; screen_putc(' ');
    if (x != 4 || y != 4) return 3;
    x = 39; writes = 0; screen_putc(' ');
    if (x || y != 5) return 4;
    return 0;
}
int main(void) {
    *(volatile unsigned char *)0x02a7 = 1;
    *(volatile unsigned int *)0x02a8 = 65535U;
    *(volatile unsigned char *)0x02a7 = test_main() ? 3 : 2;
    for (;;) {}
}
`;
fs.writeFileSync('build/test-c64-support.c', harness);
execFileSync('tools/oscar64/oscar64/bin/oscar64.exe', ['-n', '-Os', '-Oo', '-psci', '-o=build/test-c64-support.prg', 'build/test-c64-support.c'], {stdio: 'pipe'});
require('./vice-harness')('build/test-c64-support.prg').then(() => {
    console.log(`PASS ${count} bounded formatting cases, all 256 PETSCII bytes in both reverse modes, screen addresses and cursor wrapping`);
}).catch(error => { console.error(error); process.exitCode = 1; });
