require('./setup');
const fs=require('fs');
const {functions}=require('./source');
const harness=`
#include <string.h>
#include <stdio.h>
#include <ctype.h>
#define MAXARGS 44
#define CBM_T_SEQ 16
#define CBM_T_PRG 17
#define CBM_T_USR 18
typedef struct {unsigned char dev;char name[17];} Path;
static Path p1,outputpath;
static unsigned char argc,argquoted[MAXARGS],aborted,redirected,outputused,outputfailed,outputcol,cachevalid,drive=8;
static char line[160],parsebuf[160],rawparse[160],rawline[160],diskcmd[160],*args[MAXARGS];
static struct {unsigned char type;} files[1]={{CBM_T_SEQ}};
static int errors,opened,deleted,executed;
static const char *message;
static void rawset(void *p,int i,int v) {}
static int rawget(void *p,int i) {return 0;}
static void error(const char *s) {++errors;message=s;}
static void filename(const char *s,char *d) {strcpy(d,s);}
static int commandid(const char *s) {
 if(!stricmp(s,"HELP"))return 11;if(!stricmp(s,"FIND"))return 28;
 if(!stricmp(s,"TYPE"))return 20;if(!stricmp(s,"DIR"))return 5;return -1;
}
static int findfile(const Path *p) {return !strcmp(p->name,"missing")?-1:0;}
static int scratch(const Path *p) {++deleted;return 1;}
static int statuschannel(int dev) {return 15;}
static int channel_open(int l,int dev,int sa,const char *s) {++opened;return 0;}
static void channel_close(int l) {}
static int diskstatus(int dev,int report) {return 0;}
static void outputflush(void) {}
static void executecommand(char *s) {++executed;}
${functions('path','typeoptions','findoptions','tokenize','execute')}
static void run(const char *s) {
 strcpy(line,s);errors=opened=deleted=executed=0;message="";execute(line);
}
static int rejected(const char *s) {run(s);return errors==1&&!opened&&!deleted&&!executed;}
int main(void) {
 if(!rejected("HELP >out")||!rejected("HELP FIND >>out")||!rejected("FIND /? >out")||!rejected("DIR /? >out"))return 1;
 if(!rejected("FIND \\\"word\\\" input >input")||strcmp(message,SYSOUT_CANNOT_REDIRECT_FIND_ONTO_ITSELF))return 2;
 if(!rejected("FIND /C \\\"word\\\" input >>A:input"))return 3;
 if(!rejected("FIND \\\"word\\\" missing >out")||strcmp(message,SYSOUT_FILE_NOT_FOUND))return 4;
 if(!rejected("FIND /X \\\"word\\\" input >out")||!rejected("FIND word input >out"))return 5;
 run("FIND /N \\\"word\\\" input >out");if(errors||opened!=1||deleted!=1||executed!=1||redirected)return 6;
 run("FIND /C \\\"word\\\" input >>out");if(errors||opened!=1||deleted||executed!=1||!strstr(diskcmd,",a"))return 7;
 run("FIND \\\"/?\\\" input >out");if(errors||opened!=1||executed!=1)return 8;
 run("FIND \\\"a>b\\\" input >out");if(errors||opened!=1||executed!=1)return 9;
 run("FIND \\\"word\\\" input >9:input");if(errors||opened!=1||executed!=1)return 10;
 run("HELP FIND");if(errors||opened||executed!=1)return 11;
 return 0;
}
`;
fs.writeFileSync('build/test-find-redirection.c',harness);
require('./simulator')('build/test-find-redirection.c');
console.log('PASS FIND redirection validation, append, input protection, quoted help/redirect characters and HELP rejection');
