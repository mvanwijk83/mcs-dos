require('./setup');
const fs=require('fs');
const source=fs.readFileSync('src/mcsdos.c','utf8').replace(/\r\n/g, '\n');
const code=source.slice(source.indexOf('static int findbyte('),source.indexOf('static void renderedit('));
const fixtures=['DOS\r\ndos\n\rno DOS here\rfinal','', '\r\n\r\n','a'.repeat(1100)+'DOS\nlast','x'.repeat(37)+'DOS\nDOS','ababa\naba\nno'];
const cases=[], strings=new Map();
// Short adjacent literals avoid Oscar64’s limit on a single string token.
// Deduplicate fixtures explicitly to keep the harness within C64 memory.
const chunks=s=>s.match(/[\s\S]{1,128}/g)?.map(v=>JSON.stringify(v)).join(" ") || '""';
function literal(s){if(!strings.has(s))strings.set(s,'text'+strings.size);return strings.get(s);}
for(const input of fixtures)for(let flags=0;flags<16;flags++){
 const needle=input.startsWith('ababa')?'aba':'DOS';
 let lines=input.split(/\r\n|\r|\n/);if(!input||/[\r\n]$/.test(input))lines.pop();
 const chosen=lines.map((line,i)=>({line,i})).filter(({line})=>((flags&8?line.toUpperCase().includes(needle.toUpperCase()):line.includes(needle)))!==!!(flags&1));
 let expected='---- MANUAL.TXT';
 if(flags&2)expected+=': '+chosen.length+'\n';else{expected+='\n';for(const {line,i}of chosen){const text=flags&4?(`[${i+1}]`+line).slice(0,40):line;expected+=text.match(/.{1,40}/g)?.join('\n')||'';expected+='\n';}}
 cases.push(`{${literal(input)},${JSON.stringify(needle)},${flags},${literal(expected)}}`);
}
const harness=`
#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdarg.h>
#define MAXARGS 44
static char argstore[MAXARGS][32];
static char editbuf[960],*args[MAXARGS],diskcmd[160],out[5000];
static unsigned char argc,argquoted[MAXARGS],eof[16],aborted,ox,pagelines;
static int errors,cursor[2],noseparators;
static char *decimal(unsigned long n){static char b[16];sprintf(b,"%lu",n);return b;}
static const char *input;
static struct {unsigned char dev;char name[17];} p1;
static void newline(void){strcat(out,"\\n");ox=0;}
static void outc(unsigned char c){int n=strlen(out);out[n]=c;out[n+1]=0;if(++ox==40)newline();}
static void print(const char *s,...){char b[100],*p;va_list a;va_start(a,s);vsprintf(b,s,a);va_end(a);for(p=b;*p;p++){if(*p==10)newline();else outc(*p);}}
static int page(void){return 1;}
static int stop(void){return 0;}
static void error(const char *s){errors++;}
static int path(const char *s,void *p){strcpy(p1.name,s);return 1;}
static void uppername(const char *s,char *d){while(*s)*d++=toupper(*s++);*d=0;}
static int openread(void *p,int n){return 1;}
static int channel_open(int a,int b,int c,const char *d){return 0;}
static void krnio_close(int n){}
static int diskstatus(int a,int b){return 0;}
static int readio(int channel,char *p,int len){int n=0;while(n<len && input[cursor[channel-2]])p[n++]=input[cursor[channel-2]++];return n;}
${code}
static char *argument(const char *s){strcpy(argstore[argc],s);return argstore[argc];}
static void reset(const char *s,const char *needle,int flags){int i;input=s;cursor[0]=cursor[1]=errors=ox=aborted=0;out[0]=0;memset(argquoted,0,sizeof(argquoted));argc=1;for(i=0;i<4;i++)if(flags&(1<<i)){args[argc]=argument(i==0?"/V":i==1?"/C":i==2?"/N":"/I");++argc;}argquoted[argc]=1;args[argc]=argument(needle);++argc;args[argc]=argument("manual.txt");++argc;}
// A data table keeps all 96 cases in one loop and avoids an enormous main.
${[...strings].map(([s,n])=>`static const char ${n}[]=${chunks(s)};`).join('\n')}
static const struct {const char *input,*needle;int flags;const char *expected;} cases[]={
${cases.join(',\n')}
};
int main(void){
unsigned int i;
for(i=0;i<sizeof(cases)/sizeof(cases[0]);++i){
 reset(cases[i].input,cases[i].needle,cases[i].flags);findcmd();
 if(errors || strcmp(out,cases[i].expected)){printf("FAIL %u: %s",i+1,out);return 1;}
}
reset("DOS","DOS",0);argquoted[1]=0;findcmd();if(!errors)return 2;
reset("DOS","DOS",0);args[argc]=argument("extra");++argc;findcmd();if(!errors)return 3;
reset("DOS","DOS",0);args[argc]=argument("/X");++argc;findcmd();if(!errors)return 4;
reset("DOS","DOS",0);strcpy(args[2],"*");findcmd();if(!errors)return 5;
reset("x\\n\\n","",2);findcmd();if(strcmp(out,"---- MANUAL.TXT: 2\\n"))return 6;
return 0;}
`;
fs.writeFileSync('build/test-find.c',harness);
require('./simulator')('build/test-find.c');

console.log('PASS FIND: 96 switch/line fixtures, empty string, and invalid arguments');
