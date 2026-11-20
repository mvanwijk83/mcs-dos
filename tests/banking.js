// Exercise production gates with nested services and real mapping writes.
const fs = require('fs');
const {execFileSync} = require('child_process');
const {tool} = require('./setup');
const gates = fs.readFileSync('src/bank-gates.c', 'utf8').replaceAll('\r\n', '\n');
function gate(name) {
    const start = gates.search(new RegExp('^__noinline [^\\n]*\\b' + name + '\\(', 'm'));
    if (start < 0) throw Error('Missing gate ' + name);
    return gates.slice(start, gates.indexOf('\n}', start) + 2);
}
const macros = gates.slice(gates.indexOf('#define BANK_PUSH'), gates.indexOf('\n__noinline'));
const mapping = fs.readFileSync('src/banking.c', 'utf8').replace('#include "banking.h"', '');
fs.writeFileSync('build/test-banking.c', `
#include "../src/banking.h"
#include <string.h>
#define PATHSIZE 128
#define SYSOUT_PATH_TOO_LONG "Path too long"
${mapping}
${macros}
typedef struct Path { unsigned char dev; } Path;
typedef struct HostRecord { unsigned char type; } HostRecord;
static unsigned char failed, errors;
static char text[] = "banked result";
static void error(const char *s) { ++errors; }
static void filename(const char *s, char *d) { strcpy(d, s); }
__noinline void bank_editcmd(void);
__noinline unsigned char bank_imagekind(const char *name);
__noinline char *bank_decimal(unsigned long bytes);
__noinline int bank_host_find(const Path *p);
__noinline unsigned char bank_softiec_list(const Path *p, HostRecord *records, unsigned char count, char *names);
__noinline unsigned char bank_path(const char *s, Path *p);
${gate('editcmd')}
${gate('imagekind')}
${gate('decimal')}
${gate('host_find')}
${gate('softiec_list')}
${gate('path')}
__noinline unsigned char irq(void) {
    return __asm { php; pla; and #4; sta accu };
}
__noinline unsigned char cpu_sp(void) {
    return __asm { tsx; stx accu };
}
__noinline int bank_host_find(const Path *p) {
    if (BANK_CURRENT != BANK_HOST || p->dev != 29) failed = 1;
    return -12345;
}
__noinline char *bank_decimal(unsigned long bytes) {
    Path p = {29};
    if (BANK_CURRENT != BANK_VOLUME || bytes != 0x12345678UL) failed = 2;
    if (host_find(&p) != -12345 || BANK_CURRENT != BANK_VOLUME) failed = 3;
    return text;
}
__noinline unsigned char bank_imagekind(const char *name) {
    if (BANK_CURRENT != BANK_MOUNT || name != text) failed = 4;
    if (decimal(0x12345678UL) != text || BANK_CURRENT != BANK_MOUNT) failed = 5;
    return 237;
}
__noinline void bank_editcmd(void) {
    Path p = {29};
    HostRecord r = {73};
    if (BANK_CURRENT != BANK_EDIT) failed = 6;
    if (imagekind(text) != 237 || BANK_CURRENT != BANK_EDIT) failed = 7;
    if (softiec_list(&p, &r, 191, text) != 233 || BANK_CURRENT != BANK_EDIT) failed = 13;
    if (!path(text, &p) || p.dev != 22 || BANK_CURRENT != BANK_EDIT) failed = 15;
}
__noinline unsigned char bank_softiec_list(const Path *p, HostRecord *records, unsigned char count, char *names) {
    if (BANK_CURRENT != BANK_SOFTIEC || p->dev != 29 || records->type != 73 ||
        count != 191 || names != text) failed = 14;
    return 233;
}
__noinline unsigned char bank_path(const char *s, Path *p) {
    if (BANK_CURRENT != BANK_NAV || s == text || strcmp(s, text)) failed = 16;
    if (imagekind(text) != 237 || BANK_CURRENT != BANK_NAV) failed = 17;
    p->dev = 22;
    return 1;
}
int main(void) {
    unsigned char i, j, k, sp, disabled;
    char longname[129];
    Path p;
    memset(longname, 'x', 128); longname[128] = 0;
    for (i = 0; i < 2; ++i) {
        if (i) { __asm { sei } } else { __asm { cli } }
        disabled = irq();
        for (j = 0; j < 3; ++j) {
            bank_leave(j == 0 ? BANK_NONE : j == 1 ? BANK_BOOT : BANK_MOUNT);
            sp = cpu_sp();
            for (k = 0; k < 100; ++k) editcmd();
            errors = 0;
            if (path(longname, &p) || errors != 1) return 18;
            if (failed) return failed;
            if (BANK_CURRENT != (j == 0 ? BANK_NONE : j == 1 ? BANK_BOOT : BANK_MOUNT)) return 8;
            if (*(volatile unsigned char *)0xde02 != (j == 0 ? 4 : 7)) return 9;
            if (j && *(volatile unsigned char *)0xde00 != BANK_CURRENT) return 10;
            if (*(volatile unsigned char *)1 != 0x36 || irq() != disabled) return 11;
            if (cpu_sp() != sp) return 12;
        }
    }
    return 0;
}
`);
execFileSync(tool('oscar64', 'oscar64'),
    ['-n', '-Os', '-Oo', '-e', '-o=build/test-banking.prg', 'build/test-banking.c'],
    {stdio: 'inherit', windowsHide: true, timeout: 120000});
console.log('PASS nested bank gates, byte/word/pointer returns, mapping, IRQ state and CPU stack balance');
