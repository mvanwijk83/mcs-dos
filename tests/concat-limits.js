require('./setup');
const fs=require('fs');const src=fs.readFileSync('src/mcsdos.c','utf8').replace(/\r\n/g, '\n');const code=src.slice(src.indexOf("static void concatcmd(void)\n{"),src.indexOf("static const char *const commands[]"))+src.slice(src.indexOf('static unsigned char tokenize('),src.indexOf('static void executecommand('));
const harness=`
#include <stdio.h>
#include <string.h>
#define MAXARGS 33
static char *args[MAXARGS],parsebuf[98],line[65],rawparse[13],rawline[9],sent[41];
static unsigned char argc,drive=8,argquoted[MAXARGS];
static int errors,calls;
typedef struct {unsigned char dev;char name[17];} Path;
static Path p1,p2;
static int rawget(char *m,int p){return 0;}
static void rawset(char *m,int p,int v){}
static void error(const char *s){++errors;}
static int path(const char *s,Path *p){p->dev=drive;strcpy(p->name,s);return 1;}
static void say(const char *s){}
static int command(int d,const char *s){++calls;strcpy(sent,s);return 1;}
${code}
int main(void){
 strcpy(line,"copy abcdefghijklmnop+abc abcdefghijklmnop");if(!tokenize(line))return 1;concatcmd();if(calls!=1||strlen(sent)!=40)return 2;
 strcpy(line,"copy abcdefghijklmnop+abcd abcdefghijklmnop");tokenize(line);concatcmd();if(calls!=1||errors!=1)return 3;
 strcpy(line,"copy a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a x");if(!tokenize(line))return 4;concatcmd();if(calls!=2||strlen(sent)!=40)return 5;
 strcpy(line,"copy a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a x");tokenize(line);concatcmd();if(calls!=2||errors!=2)return 6;
 return 0;
}`;fs.writeFileSync('build/test-concat-limits.c',harness);require('./simulator')('build/test-concat-limits.c');console.log('PASS COPY concatenation 40/41 character boundary and 18/19-source token lists');
