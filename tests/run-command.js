require('./setup');
const fs=require('fs');
const {fn,functions}=require('./source');
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
static char *args[33];
static unsigned char rawparse[13], rawline[9];
static char parsebuf[98], line[65];
#define MAXARGS 33
#define rawset(a,b,c) ((void)0)
#define rawget(a,b) 0
static unsigned char argquoted[33];
static char output[100];
static struct {unsigned char dev;char name[17];} p1;
static int stop(void) {return 0;}
static int path(const char *s,void *p) {
    const char *q=strchr(s,':');p1.dev=0;
    if(q){p1.dev=s[0]-'0';s=q+1;}
    strcpy(p1.name,s);return 1;
}
static void outs(const char *s) {strcat(output,s);}
static void say(const char *s) {strcat(output,s);strcat(output,"\\n");}
static void newline(void) {strcat(output,"\\n");}
static void error(const char *s) {strcat(output,"ERROR");}
static int getch(void) {++reads;return 'X';}
static void help(int id) {helpid=id;}
static int commandid(const char *s) {return !stricmp(s,"CLS")?2:!stricmp(s,"RUN")?19:-1;}

#define volcmd(n) ((void)0)
#define clear() (++cleared)
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

#define diskidcmd() ((void)0)
#define setcmd(s) ((void)0)
#define findcmd() ((void)0)
#define diskinitcmd() ((void)0)
#define tapecopycmd() ((void)0)
#define attribcmd() ((void)0)
#define bootsplash(n) ((void)0)
static int launched, saved, batches, cleared, probes, fault;
static char launchname[17];
static unsigned char launchabsolute,launchlength,launchdevice;
static unsigned int launchaddress;
#define CBM_T_PRG 17
static struct {unsigned char type;} files[1];
static int findfile(void *p) {
    ++probes;
    if(!strcmp(p1.name,"fault"))return -2;
    if(strcmp(p1.name,"program") && strcmp(p1.name,"two words") && strcmp(p1.name,"CLS") && strcmp(p1.name,"data") && stricmp(p1.name,"test.bat") && strcmp(p1.name,"two words.bat"))return -1;
    files[0].type=(!strcmp(p1.name,"data") || strstr(p1.name,".bat"))?16:CBM_T_PRG;
    return 0;
}
static void runbatch(void) {++batches;}
static int session_run(void) {++saved;return !fault;}
static int cart_launch(const char *s,unsigned char a,unsigned int n) {++launched;return 1;}
static void launch(void) {++launched;}
${functions('tokenize','runcmd','executecommand')}
static void run(const char *s) {
    strcpy(line,s);output[0]=0;launched=saved=batches=cleared=probes=fault=0;
    cachevalid=1;launchabsolute=1;launchname[0]=0;
    executecommand(line);
}
int main(void) {
    run("program");
    if(launched!=1 || saved!=1 || probes!=1 || launchabsolute || strcmp(launchname,"program") || !cachevalid)return 1;
    run("RUN program");
    if(launched!=1 || saved!=1 || launchabsolute || cachevalid)return 2;
    run("8:program");
    if(launched!=1 || launchdevice!=8 || drive)return 3;
    run("\\"two words\\"");
    if(launched!=1 || strcmp(launchname,"two words"))return 4;
    run("data");
    if(launched || saved || !strstr(output,SYSOUT_BAD_CMD_OR_FILE_NAME))return 5;
    run("missing");
    if(launched || saved || !strstr(output,SYSOUT_BAD_CMD_OR_FILE_NAME))return 6;
    run("CLS");
    if(cleared!=1 || probes || launched)return 7;
    run("program /A 8192");
    if(probes || launched || !strstr(output,SYSOUT_BAD_CMD_OR_FILE_NAME))return 8;
    run("RUN program /A 8192");
    if(launched!=1 || !launchabsolute || launchaddress!=8192)return 9;
    run("RUN program /A 1");
    if(launched || saved)return 10;
    run("RUN test.bat");
    if(batches!=1 || launched)return 11;
    run("8:");
    if(drive!=8 || launched || probes)return 12;
    run("fault");
    if(launched || saved || output[0])return 13;
    strcpy(line,"program");fault=1;launched=saved=0;executecommand(line);
    if(launched || saved!=1)return 14;
    run("test.bat");
    if(batches!=1 || launched || saved || probes!=1)return 15;
    run("8:test.bat");
    if(batches!=1 || p1.dev!=8 || launched || saved)return 16;
    run("\\"two words.bat\\"");
    if(batches!=1 || launched || strcmp(p1.name,"two words.bat"))return 17;
    run("test.BAT");
    if(batches!=1 || launched)return 18;
    run("missing.bat");
    if(batches || launched || !strstr(output,SYSOUT_BAD_CMD_OR_FILE_NAME))return 19;
    run("test.bat /A 8192");
    if(batches || launched)return 20;
    run("RUN test.bat /A 8192");
    if(batches || launched)return 21;
    return 0;
}
`;
fs.writeFileSync('build/test-run-command.c',harness);
require('./simulator')('build/test-run-command.c');
console.log('PASS implicit PRG/batch dispatch, built-in precedence, quotes/devices, data/missing rejection, explicit RUN /A, batches and failed session save');
