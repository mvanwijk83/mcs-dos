const {tool} = require('./setup');
const fs=require('fs'),{execFileSync}=require('child_process'),assert=require('assert/strict');
const s=fs.readFileSync('src/mcsdos.c','utf8').replace(/\r\n/g, '\n');
const env=s.slice(s.indexOf('static char *envget('),s.indexOf('static unsigned char dosdrives('));
const drives=s.slice(s.indexOf('static unsigned char dosdrives('),s.indexOf('static void showprompt('));
const set=s.slice(s.indexOf('static void setcmd('),s.indexOf('static unsigned char path('));
const startup=s.slice(s.indexOf('static void startupprompt('),s.indexOf('/* Apply once after AUTOEXEC'));
const code=`
#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdarg.h>
#define ENVVALUE 32
#define ENVSIZE 512
static char environment[512],prompttext[33];
static unsigned int envused;
static unsigned char fg=15,bg,bd,errors,envready;
static char output[160];
static void print(const char *fmt,...){va_list a;va_start(a,fmt);vsprintf(output,fmt,a);va_end(a);}
static void say(const char *s){++errors;}
static void error(const char *s){++errors;}
static void colors(void){}
static void uppername(const char *s,char *d){while(*s)*d++=toupper(*s++);*d=0;}
static unsigned char charsetname(const char *s){return 1;}
static unsigned char dirdefaults(const char *s,unsigned char *f){return 1;}
${env}${drives}${set}${startup}
int main(void){
 unsigned char i;unsigned int j;char b[65];
 setcmd("abcdefgh=12345678901234567890123456789012");
 if(!envget("ABCDEFGH")||strlen(envget("ABCDEFGH"))!=32)return 1;
 setcmd("abcdefghi=x");if(errors!=1)return 2;
 setcmd("abcdefgh=123456789012345678901234567890123");if(errors!=2||strlen(envget("ABCDEFGH"))!=32)return 3;
 setcmd("color=15, 6, 14");if(fg!=15||bg||bd)return 4;
 startupcolor();if(fg!=15||bg!=6||bd!=14)return 5;
 setcmd("color=1,2,16");startupcolor();if(errors!=3||fg!=15||bg!=6||bd!=14)return 6;
 setcmd("color=1,2,3,4");startupcolor();if(errors!=4||fg!=15)return 7;
 setcmd("color=1,2");startupcolor();if(errors!=5)return 8;
 setcmd("prompt=Ready.$R$D$C$G");if(prompttext[0])return 9;
 startupprompt();if(strcmp(prompttext,"Ready.$R$D$C$G"))return 10;
 setcmd("prompt=later");if(strcmp(prompttext,"Ready.$R$D$C$G"))return 11;
 envused=0;errors=0;
 for(i=0;i<13;++i){sprintf(b,"n%02u=12345678901234567890123456789012",i);setcmd(b);}
 setcmd("edge=1234567890123456789012345");if(envused!=512||errors)return 12;
 setcmd("/ENV");if(strcmp(output,"512 bytes total environment size\\n512 bytes used\\n  0 bytes free\\n"))return 20;
 setcmd("edge=12345678901234567890123456");if(envused!=512||errors!=1)return 13;
 setcmd("edge=");setcmd("extra=ok");if(!envget("EXTRA"))return 14;
 envused=0;
 setcmd("/eNv  ");if(strcmp(output,"512 bytes total environment size\\n  0 bytes used\\n512 bytes free\\n"))return 15;
 setcmd("aa=12345678901234567890123456789012");setcmd("b=123456789");
 setcmd("/ENV");if(strcmp(output,"512 bytes total environment size\\n 48 bytes used\\n464 bytes free\\n"))return 16;
 setcmd("driveids=dos");if(strcmp(drivename(8),"8"))return 17;
 envready=1;if(strcmp(drivename(8),"A"))return 18;
 envready=0;if(strcmp(drivename(8),"8"))return 19;
 memset((void*)0xd800,7,1001);
 setcmd("color=0,15,15");startupcolor();
 for(j=0;j<1000;++j)if(((unsigned char*)0xd800)[j]!=0)return 21;
 if(*(unsigned char*)0xdbe8!=7)return 22;
 setcmd("color=1,2,16");startupcolor();
 for(j=0;j<1000;++j)if(((unsigned char*)0xd800)[j]!=0)return 23;
 return 0;
}`;
fs.writeFileSync('build/test-startup-settings.c',code);
execFileSync(tool('cc65', 'cl65'),['-t','sim6502','-O','-o','build/test-startup-settings','build/test-startup-settings.c']);
execFileSync(tool('cc65', 'sim65'),['build/test-startup-settings']);
assert(s.includes('#define LINE 65'));assert(s.includes('#define MAXARGS 33'));
console.log('PASS startup colors/prompt, atomic invalid colors, 8/32 limits exact 512-byte capacity, aligned usage statistics deferred DRIVEIDS and exact screen recoloring');
