require('./setup');
const fs=require('fs');
const {fn}=require('./source');
const harness=`
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <time.h>
#define VERSION "test"
#include "../src/sysout.h"
#define POKE(a,b) ((void)0)
static unsigned char aborted,copysuppress,noseparators,cachevalid,drive,quit,echoon,reboot;
static int argc,reads,helpid=-1;
static char *args[5];
static unsigned char argquoted[5];
static char output[100];
static struct {unsigned char dev;char name[17];} p1;
static int stop(void) {return 0;}
static int path(const char *s,void *p) {return 0;}
static void outs(const char *s) {strcat(output,s);}
static void say(const char *s) {strcat(output,s);strcat(output,"\\n");}
static void newline(void) {strcat(output,"\\n");}
static void error(const char *s) {strcat(output,"ERROR");}
static int getch(void) {++reads;return 'X';}
static void help(int id) {helpid=id;}
static int commandid(const char *s) {return !stricmp(s,"PAUSE")?15:-1;}
static int tokenize(char *s) {argc=1;args[0]=s;return 1;}
#define volcmd(n) ((void)0)
#define clear() ((void)0)
#define copycmd(n) ((void)0)
#define delcmd() ((void)0)
#define dircmd() ((void)0)
#define diskcopycmd() ((void)0)
#define editcmd() ((void)0)
#define formatcmd() ((void)0)
#define labelcmd() ((void)0)
#define memcmd() ((void)0)
#define typecmd(n) ((void)0)
#define renamecmd() ((void)0)
#define runcmd() ((void)0)
#define diskidcmd() ((void)0)
#define setcmd(s) ((void)0)
#define findcmd() ((void)0)
#define diskinitcmd() ((void)0)
#define tapecopycmd() ((void)0)
#define attribcmd() ((void)0)
#define bootsplash(n) ((void)0)
${fn('executecommand')}
static int check(const char *text,const char *expected) {
    char command[65];strcpy(command,text);output[0]=0;reads=0;
    executecommand(command);
    return strcmp(output,expected) || reads!=1;
}
int main(void) {
    if(check("PAUSE", SYSOUT_PRESS_ANY_KEY "\\n")) return 1;
    if(check("PAUSE Press a key", "Press a key\\n")) return 2;
    if(check("PAUSE   ",SYSOUT_PRESS_ANY_KEY "\\n")) return 3;
    if(check("pause   Press / restore!", "Press / restore!\\n")) return 4;
    if(check("PAUSE \\"a key\\"", "\\"a key\\"\\n")) return 5;
    output[0]=0;reads=0;{char command[]="PAUSE /?";executecommand(command);}
    if(helpid!=15 || reads || output[0]) return 6;
    return 0;
}
`;
fs.writeFileSync('build/test-pause.c',harness);
require('./simulator')('build/test-pause.c');
console.log('PASS PAUSE custom text, default, whitespace, raw quotes/slashes and help');
