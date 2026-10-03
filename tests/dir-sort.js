// Compare production ordering across ties, unsigned sizes and every supported sort mode.
require('./setup');
const fs = require('fs'), assert = require('assert/strict');
const {fn, functions} = require('./source');
const options = functions('diroption', 'dirdefaults');
const edit = fn('editnumber');
const compare = fn('dircompare');
const s = fn('dircmd');
const sort = s.slice(s.indexOf('for (i = 0; i < count; ++i)\n        order[i] = i;'),
    s.indexOf('pagelines = 5;', s.indexOf('static void dircmd(')));
const fixtures = [
    ['zboot', 3, 99], ['beta', 1, 3], ['alpha', 1, 3], ['delta', 0, 65535], ['gamma', 2, 0],
    ['epsilon', 4, 256]
];
let checks = '', n = 0;
for (const mode of ['N', 'T', 'S'])
    for (const reverse of [false, true])
        for (const first of [false, true]) {
            const sw = '/O' + (reverse ? '-' : '') + mode + (first ? 'F' : '');
            const indices = fixtures.map((_, i) => i);
            const head = first ? indices.shift() : null;
            indices.sort((a, b) => {
                let r = mode === 'T'   ? fixtures[a][1] - fixtures[b][1]
                        : mode === 'S' ? fixtures[a][2] - fixtures[b][2]
                                       : 0;
                return (r || fixtures[a][0].localeCompare(fixtures[b][0])) * (reverse ? -1 : 1)
            });
            if (first)
                indices.unshift(head);
            checks += `flags=0;if(!dirdefaults("/B${sw}/L/W",&flags))return ${++n};sort=flags&4;${
                sort}\n`;
            for (let i = 0; i < indices.length; i++)
                checks += `if(order[${i}]!=${indices[i]})return ${++n};\n`;
        }
for (const sw of ['/OX', '/O-', '/O-NFF', '/ONX', '/OSN', '/O--S'])
    checks += `flags=0;if(diroption("${sw}",&flags))return ${++n};\n`;
checks +=
    'flags=0;if(!diroption("/O",&flags)||flags!=4)return 120; if(!dirdefaults("/O-SF/ON",&flags)||flags!=4)return 121;';
checks +=
    'for(i=1;i<=40;++i){editnumber(0,i);if(cells[0]!=176+i/10 || cells[1]!=176+i%10)return 122;}';
const code = `
#include <string.h>
#include <ctype.h>

struct Entry {
    const char *name;
    unsigned char type;
    unsigned int blocks;
};
static struct Entry files[] = {${fixtures.map(f => `{"${f[0]}",${f[1]},${f[2]}}`).join(',')}};

/* Supply predictable file-type labels for the independent ordering fixtures.
 *
 * t: Fixture file-type value. */
static const char *typename(unsigned char t)
{
    static const char *names[] = {"DEL", "PRG", "REL", "SEQ", "USR"};
    return names[t];
}

static unsigned char cells[2];
#define POKE(a, v) cells[a] = (v)

${edit}
${options}
${compare}
/* Run the independent fixture cases; failure results identify the violated invariant. */
int main(void)
{
    unsigned int i, j, tmp, order[6], count = 6;
    unsigned char flags, sort; ${checks}
    return 0;
}
`;
fs.writeFileSync('build/test-dir-sort.c', code);
require('./simulator')('build/test-dir-sort.c');
console.log(
    'PASS all 12 sort modes, type/size ties, unsigned sizes, first entry, DIRCMD, invalid options');
