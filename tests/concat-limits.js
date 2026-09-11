const fs=require('fs'),{execFileSync}=require('child_process');const src=fs.readFileSync('src/mcsdos.c','utf8');const code=src.slice(src.indexOf('static void concatcmd('),src.indexOf('static const char * const commands[]'))+src.slice(src.indexOf('static unsigned char tokenize('),src.indexOf('static void executecommand('));
const harness=`
#include <stdio.h>
#include <string.h>
#define MAXARGS 44
static char *args[MAXARGS],parsebuf[130],line[86],rawparse[17],rawline[11],sent[41];
static unsigned char argc,drive=8;
static int errors,calls;
typedef struct {unsigned char dev;char name[17];} Path;
static Path p1,p2;
static int rawget(char *m,int p){return 0;}
static void rawset(char *m,int p,int v){}
static void error(char *s){++errors;}
static int path(char *s,Path *p){p->dev=drive;strcpy(p->name,s);return 1;}
static void command(int d,char *s){++calls;strcpy(sent,s);}
${code}
int main(void){
 strcpy(line,"concat abcdefghijklmnop abcdefghijklmnop abc");if(!tokenize(line))return 1;concatcmd();if(calls!=1||strlen(sent)!=40)return 2;
 strcpy(line,"concat abcdefghijklmnop abcdefghijklmnop abcd");tokenize(line);concatcmd();if(calls!=1||errors!=1)return 3;
 strcpy(line,"concat x a a a a a a a a a a a a a a a a a a");if(!tokenize(line))return 4;concatcmd();if(calls!=2||strlen(sent)!=40)return 5;
 strcat(line," a");tokenize(line);concatcmd();if(calls!=2||errors!=2)return 6;
 return 0;
}`;fs.writeFileSync('build/test-concat-limits.c',harness);execFileSync('tools/cc65/bin/cl65.exe',['-t','sim6502','-O','-o','build/test-concat-limits','build/test-concat-limits.c'],{stdio:'pipe'});execFileSync('tools/cc65/bin/sim65.exe',['build/test-concat-limits'],{stdio:'pipe'});console.log('PASS CONCAT 40/41 character boundary and 18/19-source token lists');
