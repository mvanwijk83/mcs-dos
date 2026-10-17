// Whole-disk FORMAT dispatch, argument validation and confirmation boundaries.
require('./setup');
const fs = require('fs'), {functions} = require('./source');
fs.writeFileSync('build/test-format-label.c', `
#include <string.h>
#include <ctype.h>
#define LINE 128
#define POKE(a,b) ((void)0)
typedef struct {unsigned char dev;char name[17],dir[128];} Path;
static Path p1;
static const char *args[9], *answers[2], *lastError;
static char line[LINE], diskcmd[160], working[24][128];
static unsigned char argc, model, geometry, inputs, commands, errors, modes;
static unsigned char confirmations, selects, writes, statuses, invalidations, typecalls;
static unsigned char accept, rootok, writeok, commandok;
static unsigned char location_index(unsigned char d) {return d?d-7:0;}
static void nav_invalidate(void) {++invalidations;}
static unsigned char location_select(unsigned char d,const char *p) {++selects;return !*p&&rootok;}
static unsigned char path(const char *s,Path *p) {
    unsigned int n=strlen(s);
    if(!n||s[n-1]!=0x5c)return 0;
    p->dev=s[0]=='A'?8:s[0]-'0';p->dir[0]=p->name[0]=0;return 1;
}
static unsigned char drivetype(unsigned char d,unsigned char r) {++typecalls;return geometry;}
static unsigned char drivemodel(unsigned char d,unsigned char r) {return model;}
static unsigned char drivemode(unsigned char d,unsigned char s) {++modes;return 1;}
static const char *drivename(unsigned char d) {return "9";}
static void print(const char *s,...) {}
static void say(const char *s) {}
static void outs(const char *s) {}
static void error(const char *s) {lastError=s;++errors;}
static unsigned char yesno(const char *s) {++confirmations;return accept;}
static unsigned char input(char *s,unsigned int n,unsigned char e) {strcpy(s,answers[inputs++]);return 1;}
static void filename(const char *s,char *d) {
    unsigned char c;
    while((c=*s++)) *d++=c>=193&&c<=218?c-128:c;
    *d=0;
}
static unsigned char statuschannel(unsigned char d) {return 15;}
static int channel_write(unsigned char l,const char *s,unsigned int n) {
    ++writes;
    if((writes==1&&strcmp(s,"cd//\\r"))||(writes==2&&strcmp(s,"/\\r")))return 0;
    return writeok?n:0;
}
static unsigned char diskstatus(unsigned char d,unsigned char r) {++statuses;return 30;}
static unsigned char command(unsigned char dev,const char *s) {++commands;return commandok;}
${functions('formatcmd')}
static void reset(void) {
    inputs=commands=errors=modes=confirmations=selects=writes=statuses=invalidations=typecalls=0;
    accept=rootok=writeok=commandok=1;model=DRIVE_1581;geometry=3;
    strcpy(working[location_index(9)],"OLD");
    args[0]="format";args[1]="9:";args[2]="/V:safe";args[3]="/ID:fm";argc=4;
    answers[0]="prompted";answers[1]="pi";lastError=0;
}
int main(void) {
    unsigned char i;
    static const char *const formats[]={"81","DD8","HD8","ED8","DDN","HDN","EDN","S8","SN"};
    char option[8], expected[40];
    static const char petsciiid[]={'/','I','D',':',218,'9',0};
    reset();formatcmd();
    if(errors||inputs||commands!=1||selects!=1||confirmations!=1||strcmp(diskcmd,"n0:safe,fm")||working[2][0])return 1;
    for(i=0;i<9;++i){
        reset();model=DRIVE_CMD_FD;snprintf(option,sizeof(option),"/f:%s",formats[i]);args[4]=option;argc=5;
        formatcmd();snprintf(expected,sizeof(expected),"n0:safe,fm,%s",formats[i]);
        if(errors||inputs||commands!=1||writes!=2||statuses!=2||typecalls||selects!=1||strcmp(diskcmd,expected)||working[2][0])return 2;
    }
    reset();model=DRIVE_CMD_FD;formatcmd();
    if(errors!=1||confirmations||writes||commands||strcmp(lastError,SYSOUT_FORMAT_FD_REQUIRES_TYPE))return 3;
    reset();model=DRIVE_CMD_FD;args[4]="/F:0";argc=5;formatcmd();
    if(errors!=1||confirmations||writes||commands)return 4;
    reset();model=DRIVE_CMD_HD;formatcmd();
    if(errors!=1||confirmations||selects||writes||commands||strcmp(lastError,SYSOUT_FORMAT_CMD_HD_UNSUPPORTED))return 5;
    reset();args[4]="/F:81";argc=5;formatcmd();
    if(errors!=1||confirmations||selects||commands)return 6;
    reset();args[2]="/V:x,xx,hdn";formatcmd();
    if(errors!=1||confirmations||commands||strcmp(lastError,SYSOUT_FORMAT_INVALID_LABEL))return 7;
    reset();args[2]="/V:12345678901234567";formatcmd();
    if(errors!=1||confirmations||commands)return 8;
    reset();args[3]="/ID:a,";formatcmd();
    if(errors!=1||confirmations||commands)return 9;
    reset();args[3]="/ID:";formatcmd();if(errors!=1||commands)return 10;
    reset();args[4]="/V:again";argc=5;formatcmd();if(errors!=1||commands)return 11;
    reset();args[1]="9:DIR";formatcmd();if(errors!=1||commands)return 12;
    reset();argc=1;formatcmd();if(errors!=1||commands)return 13;
    reset();args[1]="0:";formatcmd();if(errors!=1||commands)return 14;
    reset();accept=0;formatcmd();if(errors||inputs||selects||writes||commands||!working[2][0])return 15;
    reset();argc=2;formatcmd();if(errors||inputs!=2||strcmp(diskcmd,"n0:prompted,pi"))return 16;
    reset();argc=3;answers[0]="vi";formatcmd();if(errors||inputs!=1||strcmp(diskcmd,"n0:safe,vi"))return 17;
    reset();args[2]="/ID:fm";argc=3;formatcmd();if(errors||inputs!=1||strcmp(diskcmd,"n0:prompted,fm"))return 18;
    reset();args[2]="/V:";formatcmd();if(errors||inputs||strcmp(diskcmd,"n0:MCS-DOS,fm"))return 19;
    reset();rootok=0;formatcmd();if(commands||!working[2][0])return 20;
    reset();commandok=0;formatcmd();if(commands!=1||!working[2][0])return 21;
    reset();model=DRIVE_CMD_FD;args[4]="/F:hdn";argc=5;writeok=0;formatcmd();if(commands||errors!=1)return 22;
    reset();model=DRIVE_1571;geometry=2;formatcmd();if(errors||modes!=1||selects||commands!=1)return 23;
    reset();argc=2;answers[0]="bad,XX,HDN";formatcmd();if(errors!=1||commands||selects)return 24;
    reset();args[1]="/id:fm";args[2]="/v:safe";args[3]="A:";formatcmd();
    if(errors||commands!=1||p1.dev!=8||strcmp(diskcmd,"n0:safe,fm"))return 25;
    reset();args[3]=petsciiid;formatcmd();if(errors||commands!=1||strcmp(diskcmd,"n0:safe,Z9"))return 26;
    return 0;
}
`);
require('./simulator')('build/test-format-label.c');
console.log('PASS whole-disk FORMAT: 1581 root, nine FD formats, HD rejection, switches, prompts, validation and failures');
