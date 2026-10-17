// Exact 40-column rows, allocation limits and footer placement using production formatting.
require('./setup');
const fs=require('fs'),{functions}=require('./source');
fs.writeFileSync('build/test-dir-layout.c',`
#include <stdio.h>
#include <string.h>
#include <stdarg.h>
#define CBM_T_DIR 20
#define CBM_T_SEQ 16
typedef struct Entry {char name[17];unsigned int blocks;unsigned char type;} Entry;
typedef struct PartitionInfo {unsigned char type;} PartitionInfo;
static Entry files[1];
static struct Path {unsigned char dev;char dir[128];} p1={9,""};
static unsigned char model=DRIVE_CMD_HD,root=1,parttype=1,ox,redirected,outputcol,noseparators;
static unsigned int freeblocks=24475,used;
static char output[512];
static unsigned char location_root(unsigned char d,const char *p){return root;}
static unsigned char partition_info(unsigned char d,unsigned char n,PartitionInfo *p){p->type=parttype;return 1;}
static unsigned char drivemodel(unsigned char d,unsigned char r){return model;}
static const char *typename(unsigned char t){return "SEQ";}
static void newline(void){output[used++]='\\n';output[used]=0;ox=outputcol=0;}
static void outs(const char *s){
    while(*s){output[used++]=*s++;output[used]=0;
        if(redirected)outputcol=1;else if(++ox==40)newline();}
}
static void print(const char *fmt,...){char text[160];va_list a;va_start(a,fmt);vsnprintf(text,sizeof(text),fmt,a);va_end(a);outs(text);}
static void reset(void){used=ox=outputcol=0;output[0]=0;}
${functions('decimal','allocated','direntry','dirfooter')}
int main(void){
    unsigned char pass;
    for(pass=0;pass<2;++pass){
        redirected=pass;root=0;model=DRIVE_1581;files[0].type=CBM_T_SEQ;
        files[0].blocks=7;reset();direntry(0,"CHANGELOG.TXT",0);
        if(strcmp(output,"CHANGELOG.TXT    SEQ      1,792 (  7 bl)\\n"))return 1;
        files[0].blocks=93;reset();direntry(0,"MANUAL.TXT",0);
        if(strcmp(output,"MANUAL.TXT       SEQ     23,808 ( 93 bl)\\n"))return 2;
        files[0].blocks=40960;reset();direntry(0,"VERY BIG FILE",0);
        if(strcmp(output,"VERY BIG FILE    SEQ 10,485,760 (40,960)\\n"))return 3;
        files[0].blocks=65535;reset();direntry(0,"MAXIMUM",0);
        if(strcmp(output,"MAXIMUM          SEQ 16,776,960 (65,535)\\n"))return 4;
        files[0].blocks=1000;reset();direntry(0,"FOUR DIGITS",0);
        if(strcmp(output,"FOUR DIGITS      SEQ    256,000 ( 1,000)\\n"))return 5;
        noseparators=1;reset();direntry(0,"FOUR DIGITS",0);
        if(strcmp(output,"FOUR DIGITS      SEQ     256000 (  1000)\\n"))return 6;
        noseparators=0;root=1;model=DRIVE_CMD_HD;files[0].type=CBM_T_DIR;
        reset();direntry(0,"DATA",1);
        if(strcmp(output,"DATA             <DIR>          <NATIVE>\\n"))return 7;
        parttype=2;reset();direntry(0,"LAST NINJA 2",1);
        if(strcmp(output,"LAST NINJA 2     <DIR>            <1541>\\n"))return 8;
        parttype=3;reset();direntry(0,"DATA",1);if(!strstr(output,"<1571>\\n"))return 9;
        parttype=4;reset();direntry(0,"DATA",1);if(!strstr(output,"<1581>\\n"))return 10;
        root=0;reset();direntry(0,"CHILD",0);
        if(strcmp(output,"CHILD            <DIR>\\n"))return 11;
        reset();dirfooter(3,4,41060,0);
        if(strcmp(output,"  3 File(s)    10,511,360 bytes\\n  4 Dir(s)      6,265,600 bytes free\\n"))return 12;
        model=DRIVE_1541;reset();dirfooter(3,0,41060,0);
        if(strcmp(output,"  3 File(s)    10,511,360 bytes\\n                6,265,600 bytes free\\n"))return 13;
        model=DRIVE_CMD_HD;reset();dirfooter(1000,1000,65535,0);
        if(strcmp(output,"1000 File(s)    16,776,960 bytes\\n1000 Dir(s)      6,265,600 bytes free\\n"))return 14;
        parttype=1;
    }
    return 0;
}
`);
require('./simulator')('build/test-dir-layout.c');
console.log('PASS exact DIR sample, 40-column rows, partition types, large blocks, aligned footers and four-digit counts');
