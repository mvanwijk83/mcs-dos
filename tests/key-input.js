require('./setup');
const fs = require('fs');
const {functions} = require('./source');
const harness = `
#include <stdio.h>
#include <string.h>
#include "../tests/location-fixture.h"
#include <ctype.h>
#include <time.h>
#define LINE 128
#define RAWMAP 16
#define KEYBUFSIZE 256
#define CH_ENTER 13
#define CH_STOP 3
#define CH_CURS_UP 145
#define CH_CURS_DOWN 17
#define CH_CURS_LEFT 157
#define CH_CURS_RIGHT 29
#define CH_HOME 19
#define CH_DEL 20
#define PEEK(a) ((a)==197 ? scan : held)
static unsigned char held,scan=64, ox=3,oy, histcount,histnext,editprompt,cachevalid=1,cachedev;
static unsigned int count;
static unsigned char rawline[9],rawdraft[9],rawhistory[10][9];
static char history[10][65],draft[65],keybindings[256],shownline[40];
static unsigned char events[10],mods[10];
static int used,reads,newlines;
typedef struct {unsigned char dev; char name[17]; char dir[128];} Path;
static struct {char name[17];} files[1];
static clock_t ticks;
static clock_t testclock(void) {return ++ticks;}
#define clock testclock
static int kbhit(void) {held=mods[reads];return reads<used;}
static unsigned char getch(void) {held=mods[reads];return events[reads++];}
static void textcursor(unsigned char c) {}
static void caret_init(void) {}
static void caret_show(unsigned char x,unsigned char y) {}
static void caret_hide(void) {}
static void gotoxy(unsigned char x,unsigned char y) {}
static void newline(void) {++newlines;}
static void screen_puts(const char *s) {strcpy(shownline,s);}
static int commandid(const char *s) {return -1;}
static int path(const char *s,Path *p) {return 0;}
static const char *drivename(unsigned char d) {return "8";}
static int directory(unsigned char d) {return 0;}
static void showprompt(void) {}
${functions('rawget','rawset','keytext','rawedit','controlkey','input')}
static void prepare(unsigned char code,unsigned char mod,unsigned char recall) {
    memset(keybindings,0,sizeof(keybindings));strcpy(keybindings,"HELP");
    events[0]=code;mods[0]=mod;events[1]=13;mods[1]=0;
    used=2;reads=held=newlines=0;scan=64;editprompt=0;controlkey();
}
int main(void) {
    char buf[65];
    int i;
    unsigned char codes[7];
    codes[0]=133;codes[1]=137;codes[2]=134;codes[3]=138;codes[4]=135;codes[5]=139;codes[6]=136;
    for(i=0;i<7;++i) {
        prepare(codes[i],0,1);memset(keybindings,0,sizeof(keybindings));strcpy(keytext(keybindings,i+1),"HELP");
        if(!input(buf,65,1) || strcmp(buf,"HELP") || reads!=2 || newlines!=1)return 1+i;
        prepare(codes[i],4,1);memset(keybindings,0,sizeof(keybindings));strcpy(keytext(keybindings,i+1),"HELP");used=1;
        if(!input(buf,65,1) || strcmp(buf,"HELP") || reads!=1 || newlines!=1)return 8+i;
        if(strncmp(shownline,"HELP",4))return 15;
    }
    prepare(134,4,1);if(!input(buf,65,1) || *buf || reads!=2)return 16;
    prepare(133,4,0);if(!input(buf,65,0) || *buf || reads!=2)return 17;
    prepare(133,4,1);editprompt=1;if(!input(buf,65,1) || *buf || reads!=2 || newlines)return 18;
    prepare('X',0,1);events[1]=133;mods[1]=4;used=2;
    if(!input(buf,65,1) || strcmp(buf,"HELP") || reads!=2)return 19;
    for(i=0;i<9;++i)if(rawline[i])return 20;
    prepare(140,4,1);if(!input(buf,65,1) || *buf || reads!=2)return 21;
    for(i=0;i<7;++i) {
        prepare(13,0,1);held=4 | ((i&1)?1:0);scan=i<6?4+i/2:3;
        if(controlkey()!=codes[i] || controlkey()!=0)return 22+i;
        held=0;if(controlkey()!=0)return 29;
        held=4 | ((i&1)?1:0);if(controlkey()!=codes[i])return 30;
    }
    prepare(13,0,1);held=4;scan=64;if(controlkey())return 31;
    scan=0;if(controlkey())return 32;
    scan=3;held=5;if(controlkey()!=140)return 33;
    prepare(13,4,1);used=0;held=4;scan=4;
    if(!input(buf,65,1) || strcmp(buf,"HELP") || reads || newlines!=1)return 34;
    return 0;
}
`;
fs.writeFileSync('build/test-key-input.c', harness);
require('./simulator')('build/test-key-input.c');
console.log('PASS F1-F7 recall and CTRL accept, redraw before execution, unbound/F8 keys, prompt-only behavior, current-input replacement, and physical CTRL keys with an empty KERNAL queue');
