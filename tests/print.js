// Run the production TYPE/PRINT handler with observable KERNAL I/O mocks.
const fs=require('fs'),{execFileSync}=require('child_process');
const source=fs.readFileSync('src/mcsdos.c','utf8');
const type=source.slice(source.indexOf('static void typecmd('),source.indexOf('static int findbyte('));
const harness=`
#include <stdio.h>
#include <string.h>
static unsigned char io[256],ox,aborted,pagelines,redirected;
static int argc,p1,pos,length,device,secondary,opened,closed,errors,failopen,failwrite,written;
static char *args[4],input[600],output[600];
static int path(char *s,int *p) { return 1; }
static int openread(int *p,int n) { return 1; }
static int channel_open(int a,int b,int c,char *s) { device=b;secondary=c;++opened;return failopen; }
static void krnio_close(int n) { closed|=1<<n; }
static int channel_write(int a,void *b,int n) { if(failwrite)return -1;memcpy(output+written,b,n);written+=n;return n; }
static void error(char *s) { ++errors; }
static void outputbyte(unsigned char c) { output[written++]=c; }
static void stop(void) {}
static void newline(void) {}
static void outc(unsigned char c) {}
static int page(void) { return 1; }
static int readio(int a,void *b,unsigned int size) { int n=length-pos;if(n>size)n=size;memcpy(b,input+pos,n);pos+=n;return n; }
${type}
static void reset(void) { pos=written=device=secondary=opened=closed=errors=failopen=failwrite=0; }
int main(void) {
 int i,j; char *names[5];
 names[0]="4:";names[1]="5:";names[2]="LPT1";names[3]="lpt2";names[4]="6:";
 args[1]="input";length=600;for(i=0;i<length;++i)input[i]=i;
 for(i=0;i<4;++i) {
  reset();argc=3;args[2]=names[i];typecmd(1);
  if(device!=(i%2?5:4)||secondary!=7||errors||written!=length||memcmp(input,output,length)||closed!=20)return 1;
 }
 reset();argc=2;typecmd(1);if(device!=4||written!=length)return 2;
 reset();argc=3;args[2]=names[4];typecmd(1);if(!errors||opened)return 3;
 for(j=0;j<2;++j){reset();argc=j?4:1;typecmd(1);if(!errors||opened)return 4;}
 reset();argc=2;failopen=1;typecmd(1);if(!errors||closed!=20)return 5;
 reset();argc=2;failwrite=1;typecmd(1);if(!errors||closed!=20)return 6;
 reset();argc=2;redirected=1;typecmd(0);if(errors||opened||written!=length||memcmp(input,output,length)||closed!=4)return 7;
 return 0;
}
`;
fs.writeFileSync('build/test-print.c',harness);
execFileSync('tools/cc65/bin/cl65.exe',['-t','sim6502','-O','-o','build/test-print','build/test-print.c'],{stdio:'pipe'});
execFileSync('tools/cc65/bin/sim65.exe',['build/test-print'],{stdio:'pipe'});
console.log('PASS PRINT defaults, devices, aliases, raw bytes, invalid arguments and failure cleanup; redirected TYPE raw bytes');
