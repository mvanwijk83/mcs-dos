const {tool} = require('./setup');
const fs = require('fs'), assert = require('assert/strict');
const {execFileSync} = require('child_process');
const {functions} = require('./source');
// Run the stock KERNAL's scanner and decode logic. Replace only its CIA row
// reads with a controlled keyboard matrix, so CTRL still selects the real ROM
// table (which suppresses all four function keys).
const rom = fs.readFileSync(require('path').join(require('./environment').viceData('C64'), 'kernal-901227-03.bin'));
const scanner = Buffer.from(rom.subarray(0xa87, 0xb48));
assert.equal(scanner[12], 0xae);
assert.equal(scanner[36], 0xad);
assert.equal(scanner[39], 0xcd);
const harness = `
#include <c64/memmap.h>
#include <string.h>
#include <conio.h>
#define PEEK(a) (*(volatile unsigned char *)(a))
#define POKE(a,v) (*(volatile unsigned char *)(a)=(v))
typedef void (*Scan)(void);
${functions('controlkey')}
static unsigned char scanner[] = {${Array.from(scanner).join(',')}};
static unsigned char rows[] = {
    0xad,0x00,0xdc,0xc9,0xfe,0xd0,4,0xa9,0xff,0xd0,18,
    0xc9,0xfd,0xd0,4,0xa9,0xff,0xd0,10,
    0xc9,0x7f,0xd0,4,0xa9,0xfb,0xd0,2,0xa9,0xff,
    0x8d,0,0,0xcd,0,0,0x60,0
};
static unsigned char first[] = {0xa9,0,0xaa,0x60};
static void patch(unsigned char *at, unsigned char *target) {
    unsigned int address = (unsigned int)target;
    at[0]=0x20;at[1]=address;at[2]=address>>8;
}
static unsigned char check(unsigned char n) {
    unsigned char index = n==7 ? 3 : 4+(n-1)/2;
    unsigned char expected = n==7 ? 136 : (n&1 ? 133+(n-1)/2 : 137+(n-1)/2);
    POKE(197,64);POKE(653,0);controlkey();
    rows[8]=255 ^ (1<<index);
    rows[16]=(n&1)?255:127;
    POKE(198,0);
    ((Scan)scanner)();
    if(PEEK(197)!=index)return 32+PEEK(197);
    if(PEEK(653)!=(n&1?4:5))return 100+PEEK(653);
    if(PEEK(198))return 200+PEEK(198);
    if(controlkey()!=expected || controlkey())return 2;
    return 0;
}
int main(void) {
    unsigned char n,result;
    unsigned int scratch=(unsigned int)(rows+36);
    __asm {sei}
    patch(scanner+12,first);patch(scanner+36,rows);
    memset(scanner+39,0xea,3);
    rows[30]=rows[33]=scratch;rows[31]=rows[34]=scratch>>8;
    for(n=1;n<=7;++n) {
        result=check(n);
        if(result) {POKE(0x2a8,n);POKE(0x2a9,result);POKE(0x2a7,3);for(;;);}
    }
    POKE(0x2a7,2);for(;;);
}
`;
fs.writeFileSync('build/test-key-scanner.c', harness);
execFileSync(tool('oscar64', 'oscar64'), ['-n', '-o=build/test-key-scanner.prg', 'build/test-key-scanner.c'],
    {stdio:'inherit',windowsHide:true});
require('./vice-harness')('build/test-key-scanner.prg').then(() => {
    console.log('PASS real KERNAL CTRL/SHIFT function-key decoding with an empty character queue and held-key debounce');
}).catch(error => {console.error(error);process.exitCode=1;});
