require('./setup');
const fs=require('fs'),{functions}=require('./source');
fs.writeFileSync('build/test-output-flush.c',`
#include <stdio.h>
#include <string.h>
#undef mount_guard
typedef struct Path {unsigned char dev;char name[17],dir[128];} Path;
static Path outputpath={11,"MCSNOPT","TEMP"};
static char fmtbuf[160],outputbuf[128];
#define diskcmd fmtbuf
static unsigned char outputused=128,outputmode='w',outputstarted;
static unsigned char mount_guard(const Path *p){return 1;}
static unsigned char location_file(unsigned char d,const char *p){return 1;}
static int channel_open(unsigned char a,unsigned char d,unsigned char s,const char *c){return strcmp(c,"0:MCSNOPT,s,w");}
static int diskstatus(unsigned char d,unsigned char r){return 0;}
static void channel_close(unsigned char a){}
static int channel_write(unsigned char a,const void *b,unsigned int n){return n;}
${functions('output_append')}
int main(void){strcpy(fmtbuf,"  2 File(s)       349,696 bytes");if(!output_append()||strcmp(fmtbuf,"  2 File(s)       349,696 bytes"))return 1;puts("PASS redirected output flush preserves a formatted line in progress");return 0;}
`);
require('./simulator')('build/test-output-flush.c');
