// Commas must not turn a FORMAT label into CMD FD whole-disk format extensions.
require('./setup');
const fs = require('fs'), {functions} = require('./source');
fs.writeFileSync('build/test-format-label.c', `
#include <string.h>
#define LINE 160
typedef struct {unsigned char dev;char name[17];} Path;
static Path p1;
static const char *args[]={"format","9:"};
static char line[160], diskcmd[160];
static unsigned char argc=2, inputs, commands, errors, modes;
static const char *label="safe", *lastError;
static unsigned char path(const char *s,Path *p) { p->dev=9;p->name[0]=0;return 1; }
static unsigned char drivetype(unsigned char d,unsigned char r) { return 1; }
static unsigned char drivemodel(unsigned char d,unsigned char r) { return DRIVE_CMD_FD; }
static unsigned char drivemode(unsigned char d,unsigned char s) { ++modes;return 1; }
static const char *drivename(unsigned char d) { return "9"; }
static void print(const char *s,...) {}
static void say(const char *s) {}
static void outs(const char *s) {}
static void error(const char *s) { lastError=s;++errors; }
static unsigned char yesno(const char *s) { return 1; }
static unsigned char input(char *s,unsigned int n,unsigned char e) { strcpy(s,inputs++ ? "fm" : label);return 1; }
static void filename(const char *s,char *d) { strcpy(d,s); }
static unsigned char command(unsigned char dev,const char *s) { ++commands;return 1; }
${functions('formatcmd')}
int main(void)
{
    formatcmd();
    if(commands!=1 || errors || strcmp(diskcmd,"n0:safe,fm"))return 1;
    inputs=commands=errors=0;label="x,xx,hdn";
    formatcmd();
    if(commands || inputs!=1 || errors!=1 || strcmp(lastError,SYSOUT_FORMAT_INVALID_LABEL))return 2;
    inputs=commands=errors=0;label="";
    formatcmd();
    if(commands!=1 || errors || strcmp(diskcmd,"n0:MCS-DOS,fm"))return 3;
    return modes?4:0;
}
`);
require('./simulator')('build/test-format-label.c');
console.log('PASS FORMAT labels, default label and CMD whole-disk extension rejection before writes');
