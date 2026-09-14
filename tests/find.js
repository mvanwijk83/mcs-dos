const {tool} = require('./setup');
const fs=require('fs'),{execFileSync}=require('child_process');
const source=fs.readFileSync('src/mcsdos.c','utf8').replace(/\r\n/g, '\n');
const code=source.slice(source.indexOf('static int findbyte('),source.indexOf('static void renderedit('));
const fixtures=['DOS\r\ndos\n\rno DOS here\rfinal','', '\r\n\r\n','a'.repeat(1100)+'DOS\nlast','x'.repeat(37)+'DOS\nDOS','ababa\naba\nno'];
let checks='';let id=0;
for(const input of fixtures)for(let flags=0;flags<16;flags++){
 const needle=input.startsWith('ababa')?'aba':'DOS';
 let lines=input.split(/\r\n|\r|\n/);if(!input||/[\r\n]$/.test(input))lines.pop();
 const chosen=lines.map((line,i)=>({line,i})).filter(({line})=>((flags&8?line.toUpperCase().includes(needle.toUpperCase()):line.includes(needle)))!==!!(flags&1));
 let expected='---- MANUAL.TXT';
 if(flags&2)expected+=': '+chosen.length+'\n';else{expected+='\n';for(const {line,i}of chosen){const text=flags&4?(`[${i+1}]`+line).slice(0,40):line;expected+=text.match(/.{1,40}/g)?.join('\n')||'';expected+='\n';}}
 checks+=`reset(${JSON.stringify(input)},${JSON.stringify(needle)},${flags});findcmd();if(errors || strcmp(out,${JSON.stringify(expected)})){printf("FAIL ${++id}: %s",out);return 1;}\n`;
}
const harness=`
#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdarg.h>
#define MAXARGS 44
#define stricmp strcasecmp
static char editbuf[960],*args[MAXARGS],diskcmd[160],out[5000];
static unsigned char argc,argquoted[MAXARGS],eof[16],aborted,ox,pagelines;
static int errors,cursor[2],noseparators;
static char *decimal(unsigned long n){static char b[16];sprintf(b,"%lu",n);return b;}
static const char *input;
static struct {unsigned char dev;char name[17];} p1;
static void newline(void){strcat(out,"\\n");ox=0;}
static void outc(unsigned char c){int n=strlen(out);out[n]=c;out[n+1]=0;if(++ox==40)newline();}
static void print(char *s,...){char b[100],*p;va_list a;va_start(a,s);vsprintf(b,s,a);va_end(a);for(p=b;*p;p++){if(*p==10)newline();else outc(*p);}}
static int page(void){return 1;}
static int stop(void){return 0;}
static void error(char *s){errors++;}
static int path(char *s,void *p){strcpy(p1.name,s);return 1;}
static void uppername(char *s,char *d){while(*s)*d++=toupper(*s++);*d=0;}
static int openread(void *p,int n){return 1;}
static int channel_open(int a,int b,int c,char *d){return 0;}
static void krnio_close(int n){}
static int diskstatus(int a,int b){return 0;}
static int readio(int channel,char *p,int len){int n=0;while(n<len && input[cursor[channel-2]])p[n++]=input[cursor[channel-2]++];return n;}
${code}
static void reset(const char *s,char *needle,int flags){int i;input=s;cursor[0]=cursor[1]=errors=ox=aborted=0;out[0]=0;memset(argquoted,0,sizeof(argquoted));argc=1;for(i=0;i<4;i++)if(flags&(1<<i))args[argc++]=i==0?"/V":i==1?"/C":i==2?"/N":"/I";argquoted[argc]=1;args[argc++]=needle;args[argc++]="manual.txt";}
int main(void){
${checks}
reset("DOS","DOS",0);argquoted[1]=0;findcmd();if(!errors)return 2;
reset("DOS","DOS",0);args[argc++]="extra";findcmd();if(!errors)return 3;
reset("DOS","DOS",0);args[argc++]="/X";findcmd();if(!errors)return 4;
reset("DOS","DOS",0);args[2]="*";findcmd();if(!errors)return 5;
reset("x\\n\\n","",2);findcmd();if(strcmp(out,"---- MANUAL.TXT: 2\\n"))return 6;
return 0;}
`;
fs.writeFileSync('build/test-find.c',harness);
execFileSync(tool('cc65', 'cl65'),['-t','sim6502','-O','-o','build/test-find','build/test-find.c'],{stdio:'pipe'});
execFileSync(tool('cc65', 'sim65'),['build/test-find'],{stdio:'inherit'});
console.log('PASS FIND: 96 switch/line fixtures, empty string, and invalid arguments');
