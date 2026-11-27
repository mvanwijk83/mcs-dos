// LABEL parsing plus header and 1581 allocation-map ID copies.
require('./setup');
const fs = require('fs'), {functions} = require('./source');
fs.writeFileSync('build/test-label-id.c', `
#include <string.h>
#include <ctype.h>
#define LINE 128
typedef struct {unsigned char dev,logical;char name[17];} Path;
static Path p1;
static const char *args[8], *answer;
static char line[LINE], volume[17]="OLD";
static unsigned char argc, argquoted[8], io[256], sectors[3][256];
static unsigned char headertrack, labeloff=144, idoff=162, cachevalid;
static unsigned char selected, inputs, writes, closes, commands, errors, supported, allowed;
static const char *message;
static unsigned char path(const char *s,Path *p) {
    p->logical=p->dev=*s?s[0]-'0':9;p->name[0]=0;
    if(*s && strcmp(s,"8:") && strcmp(s,"9:"))strcpy(p->name,"bad");
    return 1;
}
static unsigned char disk_location(Path *p) {selected=p->dev;return supported;}
static unsigned char subst_guard(Path *p,const char *s) {return allowed;}
static unsigned char drivetype(unsigned char d,unsigned char r) {return supported;}
static unsigned char directory(unsigned char d) {return 1;}
static void filename(const char *s,char *d) {strcpy(d,s);}
static void uppername(const char *s,char *d) {strcpy(d,s);}
static const char *drivename(unsigned char d) {return "9";}
static void print(const char *s,...) {}
static void outs(const char *s) {message=s;}
static void say(const char *s) {message=s;}
static void error(const char *s) {message=s;++errors;}
static unsigned char input(char *s,unsigned int n,unsigned char r) {
    ++inputs;if(!answer)return 0;strcpy(s,answer);return 1;
}
static unsigned char bam(unsigned char d) {memcpy(io,sectors[0],256);return 1;}
static unsigned char rawopen(unsigned char d) {return 1;}
static unsigned char blockio(unsigned char d,unsigned char t,unsigned char s,unsigned char w) {
    if(w){memcpy(sectors[s],io,256);++writes;}else memcpy(io,sectors[s],256);
    return 1;
}
static void channel_close(unsigned char l) {++closes;}
static unsigned char command(unsigned char d,const char *s) {++commands;return 1;}
${functions('labelid', 'labelcmd')}
static void reset(void) {
    memset(sectors,0x5a,sizeof(sectors));memset(argquoted,0,sizeof(argquoted));
    argc=1;inputs=writes=closes=commands=errors=selected=0;
    supported=allowed=cachevalid=1;answer=0;headertrack=18;message=0;
    args[0]="LABEL";
}
int main(void) {
    reset();argc=3;args[1]="/i";args[2]="AB";labelcmd();
    if(selected!=9||writes!=1||commands!=1||closes!=1||cachevalid||inputs||errors)return 1;
    if(sectors[0][idoff]!='A'||sectors[0][idoff+1]!='B'||sectors[0][labeloff]!=0x5a)return 2;
    reset();argc=4;args[1]="8:";args[2]="/I";args[3]="12";headertrack=40;labelcmd();
    if(selected!=8||writes!=3||sectors[0][idoff]!='1'||sectors[1][4]!='1'||sectors[2][5]!='2')return 3;
    if(sectors[1][6]!=0x5a||sectors[0][labeloff]!=0x5a)return 4;
    reset();argc=2;args[1]="/I";answer="XY";labelcmd();
    if(inputs!=1||writes!=1||strcmp(message,SYSOUT_DISK_ID_CHANGED))return 5;
    reset();argc=2;args[1]="/I";labelcmd();if(inputs!=1||writes)return 6;
    reset();argc=3;args[1]="/I";args[2]="ABC";labelcmd();
    if(writes||strcmp(message,SYSOUT_DISK_ID_FORMAT))return 7;
    args[2]="A!";labelcmd();if(writes||strcmp(message,SYSOUT_INVALID_DISK_ID))return 8;
    reset();argc=3;args[1]="/I";args[2]="/I";labelcmd();if(!errors||writes||inputs)return 9;
    reset();argc=2;args[1]="/X";labelcmd();if(!errors||writes||inputs)return 10;
    reset();argc=2;args[1]="NEW";labelcmd();
    if(writes!=1||memcmp(sectors[0]+labeloff,"NEW",3)||sectors[0][idoff]!=0x5a)return 11;
    reset();argc=2;args[1]="/I";supported=0;labelcmd();if(inputs||writes)return 12;
    reset();argc=2;args[1]="/I";allowed=0;labelcmd();if(inputs||writes)return 13;
    return 0;
}
`);
require('./simulator')('build/test-label-id.c', {subst:true});
console.log('PASS LABEL /I current/explicit drive, prompts, validation, volume isolation and all 1581 ID copies');
