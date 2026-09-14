// Execute the actual TYPE implementation under sim65 with mocked disk/screen I/O.
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const source=fs.readFileSync('src/mcsdos.c','utf8');
const type=source.slice(source.indexOf('static void typecmd('),source.indexOf('static int findbyte('));
const harness=`
#include <stdio.h>
#include <string.h>
static unsigned char io[256],ox,aborted,pagelines,redirected;
static int argc=2,p1,rows,pages,pos,length;
static char *args[2],input[4096];
static int path(char *s,int *p) { return 1; }
static int openread(int *p,int n) { return 1; }
static int channel_open(int a,int b,int c,char *s) { return 0; }
static void krnio_close(int n) {}
static int channel_write(int a,void *b,int n) { return n; }
static void say(char *s) {}
static void error(char *s) {}
static void outputbyte(unsigned char c) {}

static void stop(void) {}
static void newline(void) { ox=0; ++rows; }
static void outc(unsigned char c) {
 if(c==13 || c==10) newline(); else if(++ox==40) newline();
}
static int page(void) { if(++pagelines==22) { ++pages; pagelines=0; } return 1; }
static int readio(int a,void *b,unsigned int size) {
 int n=length-pos; if(n>size) n=size; memcpy(b,input+pos,n); pos+=n; return n;
}
${type}
static int check(int width,char *ending,int lines,int blank) {
 int i,j; length=pos=rows=pages=ox=aborted=0;
 for(i=0;i<lines;++i) {
  for(j=0;j<width;++j) input[length++]='A';
  strcpy(input+length,ending); length+=strlen(ending);
  if(blank) { strcpy(input+length,ending); length+=strlen(ending); }
 }
 typecmd(0);
 i=lines*((width+39)/40+blank);
 if(rows!=i || pages!=i/22 || pos!=length) {
  printf("FAIL width=%d lines=%d blank=%d rows=%d expected=%d pages=%d\\n",width,lines,blank,rows,i,pages); return 1;
 }
 return 0;
}
int main(void) {
 int w,e,b; char *endings[3]; int widths[5];
 endings[0]="\\r"; endings[1]="\\n"; endings[2]="\\r\\n";
 widths[0]=39; widths[1]=40; widths[2]=41; widths[3]=80; widths[4]=15;
 for(w=0;w<5;++w) for(e=0;e<3;++e) for(b=0;b<2;++b)
  if(check(widths[w],endings[e],30,b)) return 1;
 return 0;
}
`;
fs.writeFileSync('build/test-type-wrap.c',harness);
execFileSync('tools/cc65/bin/cl65.exe',['-t','sim6502','-O','-o','build/test-type-wrap','build/test-type-wrap.c'],{stdio:'pipe'});
execFileSync('tools/cc65/bin/sim65.exe',['build/test-type-wrap'],{stdio:'pipe'});
console.log('PASS: TYPE wrapping, blank lines, CR/LF/CRLF, read boundaries and pagination (30 cases)');
