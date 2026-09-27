require('./setup');
const fs = require('fs');
const {functions} = require('./source');
const harness = `
#include <stdio.h>
#include <string.h>
#include <ctype.h>
static unsigned char io[256],ox,aborted,pagelines,redirected=1;
static int argc=3,p1,pos,length,written,errors,opens,closed,chunk=256,failread;
static const char *args[4];
static char input[1024],output[6000];
static int path(const char *s,int *p) { return 1; }
static int openread(int *p,int n) { pos=0;++opens;return 1; }
static int channel_open(int a,int b,int c,const char *s) { return 0; }
static void channel_close(int n) { ++closed; }
static int channel_write(int a,void *b,int n) { return n; }
static void error(const char *s) { ++errors; }
static void outputbyte(unsigned char c) { output[written++]=c;output[written]=0; }
static void stop(void) {}
static void newline(void) { outputbyte(13);ox=0; }
static void outc(unsigned char c) { outputbyte(c); }
static int page(void) { return 1; }
static int readio(int a,void *b,unsigned int size) {
 int n=length-pos;if(failread)return -1;if(n>size)n=size;if(n>chunk)n=chunk;
 memcpy(b,input+pos,n);pos+=n;return n;
}
${functions('typeoptions','typehex','typecmd')}
static void run(const char *option) {
 args[1]="input";args[2]=option;argc=option?3:2;
 written=errors=opens=closed=ox=aborted=0;output[0]=0;typecmd(0);
}
static int expect(const char *option,const char *text) {
 run(option);if(errors||strcmp(output,text)||opens!=closed) {
  printf("FAIL %s errors=%d output=%s\\n",option,errors,output);return 1;
 } return 0;
}
int main(void) {
 int e,k,i;const char *ending[3];char fixture[100],first[50],last[50];
 ending[0]="\\r";ending[1]="\\n";ending[2]="\\r\\n";
 for(e=0;e<3;++e)for(k=0;k<2;++k) {
  strcpy(first,"one");strcat(first,ending[e]);strcat(first,ending[e]);
  strcpy(last,"three");if(k)strcat(last,ending[e]);
  strcpy(fixture,first);strcat(fixture,last);strcpy(input,fixture);length=strlen(input);
  chunk=1;
  if(expect("/H:2",first)||expect("/T:1",last)||expect("/H:0","")||expect("/T:0","")||
     expect("/H:99",fixture)||expect("/T:99",fixture)||expect(0,fixture))return 1;
 }
 length=0;if(expect("/T:1","")||expect("/HEX",""))return 2;
 chunk=256;memset(input,'A',255);strcpy(input+255,"\\r\\nB\\r\\nC");length=261;
 if(expect("/T:1","C"))return 3;
 run("/H:1");if(errors||written!=257||output[255]!=13||output[256]!=10)return 4;
 /* Raw binary includes its first bytes; controls are dots, high PETSCII survives. */
 input[0]=0;input[1]=13;input[2]=31;input[3]=32;input[4]=65;input[5]=127;input[6]=128;input[7]=160;input[8]=255;length=9;
 run("/HEX");if(errors||written!=80||memcmp(output,"000000 00 0D 1F 20 41 7F 80 A0 ",31)||
    memcmp(output+40,"000008 FF",9)||output[31]!='.'||output[32]!='.'||output[37]!='.'||
    (unsigned char)output[38]!=160||(unsigned char)output[71]!=255)return 5;
 run("/H:");if(!errors||opens)return 6;
 run("/H:-1");if(!errors||opens)return 7;
 run("/H:16777216");if(!errors||opens)return 8;
 run("/T:1x");if(!errors||opens)return 9;
 run("/HEXx");if(!errors||opens)return 10;
 failread=1;run("/T:1");if(errors!=1||opens!=closed)return 11;
 return 0;
}
`;
fs.writeFileSync('build/test-type-options.c', harness);
require('./simulator')('build/test-type-options.c');
console.log('PASS TYPE head/tail, mixed boundaries, empty files, binary hex, invalid counts and read failure');
