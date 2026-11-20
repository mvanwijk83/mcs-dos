// Production probe against stock ROMs and small, documented replacement fields.
require('./setup');
const fs = require('fs'), path = require('path'), {functions} = require('./source');
const vice = require('./environment').viceData('C64');
const spans = [[0xe47c, 48], [0xfc00, 8], [0xe4ee, 1]];
// Independent, sparse bytes captured from reference ROMs and Jani's patcher.
// Full ROMs are deliberately not distributed with the tests.
const replacements = require('./kernal-fingerprints.json');
const stocks = fs.readdirSync(vice).filter(f => /^kernal.*\.bin$/.test(f));
const fields = stocks.map(f => {
    const bytes = fs.readFileSync(path.join(vice, f));
    return '{' +
           spans.flatMap(([at, n]) => [...bytes.subarray(at - 0xe000, at - 0xe000 + n)]).join(',') +
           '}';
});
const probe = functions('romtext', 'romcode', 'kernalname');
const harness = `

#include <string.h>
static unsigned char rom[8192];
#define PEEK(a) rom[(a) - 0xe000]
${probe}
static const unsigned char stock[][57] = {${fields.join(',')}};
static const unsigned char replacements[][57] = {${replacements.map(r => '{'+r.fields.join(',')+'}').join(',')}};
static const char *const names[] = {${replacements.map(r => JSON.stringify(r.name)).join(',')}};
static const unsigned char dolphin[] = {0xa2, 2, 0x20, 0x13, 0xee, 0xa5, 0x90, 0xd0};

/* Compare the current fixture result with its expected output or state.
 *
 * expected: Expected enhanced KERNAL name, or null for a stock ROM. */
static unsigned char check(const char *expected)
{
    const char *actual = kernalname();
    return expected ? !actual || strcmp(actual, expected) : actual != 0;
}

/* ROM text is ASCII even when the production compiler uses PETSCII literals. */
static void banner(unsigned int offset, const char *text, unsigned char n)
{
    while (n--)
        rom[offset++] = *text++ & 127;
}

/* Run the independent fixture cases; failure results identify the violated invariant. */
int main(void)
{
    unsigned char i;
    for (i = 0; i < sizeof(stock) / sizeof(stock[0]); ++i) {
        memset(rom, 0, sizeof(rom));
        memcpy(rom + 0x47c, stock[i], 48);
        memcpy(rom + 0x1c00, stock[i] + 48, 8);
        rom[0x4ee] = stock[i][56];
        if (check(0))
            return 1;
    }
    memset(rom, 0, sizeof(rom));
    banner(0x47c, "JIFFYDOS V6.01 ", 15);
    rom[0x1c00] = 0xa3;
    rom[0x4ee] = 0x44;
    if (check("JiffyDOS 6.01"))
        return 2;
    rom[0x489] = '9';
    if (check("JiffyDOS"))
        return 3;
    memset(rom + 0x47c, 0, 15);
    if (check("JiffyDOS"))
        return 4;
    rom[0x4ee] = 0x52;
    if (check(0))
        return 5; /* PiffyDOS marker is not JiffyDOS. */
    memset(rom, 0, sizeof(rom));
    memcpy(rom + 0x1c00, dolphin, 8);
    banner(0x49b, "DOLPHINDOS 2.0 ", 15);
    if (check("DolphinDOS 2.0"))
        return 6;
    rom[0x4a6] = '9';
    if (check("DolphinDOS"))
        return 7;
    banner(0x49b, "SILVER DREAM !", 14);
    if (check("DolphinDOS"))
        return 8;
    rom[0x1c04] ^= 1;
    if (check(0))
        return 9; /* Near-match is insufficient. */
    memset(rom, 0, sizeof(rom));
    banner(0x49b, "DOLPHINDOS ?.??", 14);
    if (check("DolphinDOS"))
        return 10;
    for (i = 0; i < sizeof(replacements) / sizeof(replacements[0]); ++i) {
        memset(rom, 0, sizeof(rom));
        memcpy(rom + 0x47c, replacements[i], 48);
        memcpy(rom + 0x1c00, replacements[i] + 48, 8);
        rom[0x4ee] = replacements[i][56];
        if (check(names[i]))
            return 20 + i;
        memset(rom + 0x47c, 0, 48); /* Customized banner keeps family detection. */
        if (check(i < 3 ? "EXOS" : i == 3 ? "SpeedDOS" : i == 12 ? "JaffyDOS" : "SpeedDOS PLUS"))
            return 40 + i;
        rom[0x1c07] ^= 1;
        if (check(0))
            return 60 + i;
    }
    return 0;
}
`;
fs.writeFileSync('build/test-kernal-models.c', harness);
require('./simulator')('build/test-kernal-models.c');
// Also exercise raw opcode operands under the cartridge's PETSCII encoding.
require('child_process').execFileSync(require('./setup').tool('oscar64', 'oscar64'),
    ['-n', '-Os', '-Oo', '-psci', '-e', '-o=build/test-kernal-petscii.prg', 'build/test-kernal-models.c'],
    {stdio: 'inherit', windowsHide: true, timeout: 120000});
console.log(
    'PASS stock KERNALs, JiffyDOS, DolphinDOS, EXOS 3/4, JaffyDOS 1.3, SpeedDOS/PLUS/PLUS+, customized banners and near-match rejection');
