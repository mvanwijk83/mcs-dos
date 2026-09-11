const fs=require('fs'),{execFileSync}=require('child_process');
const s=fs.readFileSync('src/mcsdos.c','utf8');
let code=s.slice(s.indexOf('static unsigned char noseparators;'),s.indexOf('static void volumeheader('))+s.slice(s.indexOf('static unsigned char validate;'),s.indexOf('static void labelcmd('));
code=code.replace(/static unsigned int freememory\(void\) \{[\s\S]*?\n\}/,'static unsigned int freememory(void) { return 2000; }');
const harness=`
#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdarg.h>
#define stricmp strcasecmp
static int argc,errors,prompts,deleted,answer=1;
static char *args[12],out[1000],volume[17]="TEST",io[256];
static unsigned char drive=8,count=2,redirected;
static unsigned int freeblocks=660;
static char _HIMEM__,_STACKSIZE__,_BSS_RUN__,_BSS_SIZE__;
static struct {unsigned char dev; char name[17];} p1;
static struct {unsigned int blocks;} files[2]={{2},{2}};
static int path(char *s,void *p) {p1.name[0]=0;if(!strchr(s,':'))strcpy(p1.name,s);return 1;}
static void error(char *s) {++errors;}
static void say(char *s) {strcat(out,s);strcat(out,"\\n");}
static void outs(char *s) {strcat(out,s);}
static void newline(void) {strcat(out,"\\n");}
static void print(char *s,...) {char b[200];va_list a;va_start(a,s);vsprintf(b,s,a);va_end(a);strcat(out,b);}
static int reu_size(void) {return 512;}
static int yesno(char *s) {++prompts;return answer;}
static void scratch(void *p) {++deleted;}
static int command(int d,char *s) {return 1;}
static int directory(int d) {return 1;}
static int bam(int d) {return 1;}
static void uppername(char *s,char *d) {strcpy(d,s);}
static void volumeheader(int d) {}
${code}
static void reset(char *a,char *b) {out[0]=0;errors=prompts=deleted=noseparators=0;argc=1;if(a)args[argc++]=a;if(b)args[argc++]=b;}
int main(void) {
 int i;
 char *removed[9];
 removed[0]="/T";removed[1]="/U";removed[2]="/F";removed[3]="/R";
 removed[4]="/A";removed[5]="/T:0";removed[6]="/A:1";removed[7]="/F:1";removed[8]="/X";
 for(i=0;i<9;++i) {
  reset(removed[i],0);memcmd();if(!errors||out[0])return 1;
  reset(removed[i],0);volcmd(1);if(!errors||out[0])return 2;
 }
 reset(0,0);memcmd();if(errors||!strstr(out,"65,536 bytes total")||!strstr(out,"524,288 bytes REU"))return 3;
 reset("/s",0);memcmd();if(errors||strchr(out,',')||!strstr(out,"65536 bytes total"))return 4;
 reset(0,0);volcmd(1);if(errors||!strstr(out,"169,984 bytes total")||!strstr(out,"1,024 bytes allocated"))return 5;
 reset("8:","/S");volcmd(1);if(errors||strchr(out,',')||!strstr(out,"169984 bytes total"))return 6;
 reset("/s","8:");volcmd(1);if(errors||strchr(out,','))return 7;
 reset("8:","9:");volcmd(1);if(!errors||out[0])return 8;
 reset("file",0);volcmd(1);if(!errors||out[0])return 9;
 reset("8:",0);memcmd();if(!errors||out[0])return 10;
 reset("file",0);delcmd();if(prompts!=1||deleted!=1)return 13;
 reset("*","/p");delcmd();if(prompts||deleted!=1)return 14;
 reset("/P","file");delcmd();if(prompts||deleted!=1)return 15;
 reset("file","/X");delcmd();if(!errors||deleted||prompts)return 16;
 reset("/P",0);delcmd();if(!errors||deleted)return 17;
 reset("file",0);answer=0;delcmd();if(prompts!=1||deleted)return 18;
 return 0;
}
`;
fs.writeFileSync('build/test-amount-switches.c',harness);
execFileSync('tools/cc65/bin/cl65.exe',['-t','sim6502','-O','-o','build/test-amount-switches','build/test-amount-switches.c'],{stdio:'pipe'});
execFileSync('tools/cc65/bin/sim65.exe',['build/test-amount-switches'],{stdio:'pipe'});
console.log('PASS full MEM/CHKDSK reports, /S, removed switch rejection, drive arguments and DEL confirmation');
