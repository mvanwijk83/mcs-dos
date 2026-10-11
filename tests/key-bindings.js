require('./setup');
const fs = require('fs');
const {functions} = require('./source');
const harness = `
#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdarg.h>
#define KEYBUFSIZE 256
#define FUNCTIONKEYS 7
#define LINE 65
#define SYSOUT_INVALID_SWITCH "invalid"
#define SYSOUT_KEY_TOO_LONG "long"
#define SYSOUT_KEY_FULL "full"
static char keybindings[KEYBUFSIZE], workspace[960], output[1024], snapshot[256];
static unsigned int errors;
static void error(const char *s) {++errors;}
static void print(const char *fmt, ...) {
    char text[100];va_list a;va_start(a,fmt);vsprintf(text,fmt,a);va_end(a);strcat(output,text);
}
${functions('keytext','keyswitch','keyshow','keycmd')}
static void run(const char *s) {errors=0;output[0]=0;keycmd(s);}
int main(void) {
    int i;
    char command[100];
    run("/F1:HELP /F4:DIR/W /F7:\\"MY PROGRAM\\"");
    if(errors || strcmp(keytext(keybindings,1),"HELP") || strcmp(keytext(keybindings,4),"DIR/W") ||
       strcmp(keytext(keybindings,7),"\\"MY PROGRAM\\""))return 1;
    run("");
    if(strcmp(output,"  F1  HELP\\n  F4  DIR/W\\n  F7  \\"MY PROGRAM\\"\\n"))return 2;
    run("/F4");if(strcmp(output,"  F4  DIR/W\\n"))return 3;
    run("/F2");if(output[0])return 4;
    run("/F1 /F7");if(strcmp(output,"  F1  HELP\\n  F7  \\"MY PROGRAM\\"\\n"))return 5;
    run("/f2 type file /hex /h:10 /F3:\\"HELLO /F4:WORLD\\"");
    if(errors || strcmp(keytext(keybindings,2),"type file /hex /h:10") ||
       strcmp(keytext(keybindings,3),"\\"HELLO /F4:WORLD\\""))return 6;
    run("/CLEAR:4");if(errors || *keytext(keybindings,4) || strcmp(keytext(keybindings,7),"\\"MY PROGRAM\\""))return 7;
    run("/F4 DIR/W");if(errors || strcmp(keytext(keybindings,4),"DIR/W"))return 8;
    run("/F1:longer command with spaces");if(errors || strcmp(keytext(keybindings,1),"longer command with spaces"))return 9;
    run("/F1:X");if(errors || strcmp(keytext(keybindings,1),"X") || strcmp(keytext(keybindings,4),"DIR/W"))return 10;
    memcpy(snapshot,keybindings,256);
    run("/F2:GOOD /F8:BAD");if(errors!=1 || memcmp(snapshot,keybindings,256))return 11;
    run("/CLEAR /CLEAR:0");if(errors!=1 || memcmp(snapshot,keybindings,256))return 12;
    run("/F0:BAD");if(errors!=1 || memcmp(snapshot,keybindings,256))return 13;
    run("/CLEAR:7x");if(errors!=1 || memcmp(snapshot,keybindings,256))return 14;
    run("/CLEAR");if(errors || *keytext(keybindings,1) || *keytext(keybindings,7))return 15;
    for(i=1;i<=4;++i) {
        sprintf(command,"/F%d:",i);memset(command+4,'A'+i,56);command[60]=0;run(command);
        if(errors)return 16;
    }
    strcpy(command,"/F5:");memset(command+4,'Z',25);command[29]=0;run(command);
    if(errors || keytext(keybindings,7)!=keybindings+255)return 17;
    memcpy(snapshot,keybindings,256);
    run("/F6:X");if(errors!=1 || memcmp(snapshot,keybindings,256))return 18;
    run("/F1:");if(errors || memcmp(snapshot,keybindings,256))return 19;
    run("/CLEAR:3 /F6:OK");if(errors || strcmp(keytext(keybindings,6),"OK") || *keytext(keybindings,3))return 20;
    strcpy(command,"/F1:");memset(command+4,'A',65);command[69]=0;
    memcpy(snapshot,keybindings,256);run(command);if(errors!=1 || memcmp(snapshot,keybindings,256))return 21;
    run("/CLEAR /F7:unterminated\\"text");if(errors || strcmp(keytext(keybindings,7),"unterminated\\"text"))return 22;
    return 0;
}
`;
fs.writeFileSync('build/test-key-bindings.c', harness);
require('./simulator')('build/test-key-bindings.c');
console.log('PASS KEY packed capacity, atomic updates, all seven keys, quotes/slashes, queries, replacement, clear options and invalid requests');
