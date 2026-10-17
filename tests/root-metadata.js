// Root label/ID lookup must not navigate or replace the current listing cache.
require('./setup');
const fs=require('fs'),{functions}=require('./source');
fs.writeFileSync('build/test-root-metadata.c',`
#include <string.h>
#include <stdarg.h>
#include <ctype.h>
static unsigned char model=DRIVE_1581,kind=4,io[256],idoff=22,ox,optionalheader;
static unsigned char opened,closed,trackread,sectorread,bams,ready=1;
#define PATHSIZE 128
static char cachedir[128]="A\\\\B";
static unsigned char header=40,selections;
static unsigned char location_header(void){return header;}
static unsigned char location_select(unsigned char d,const char *p){++selections;return 1;}
static char volume[17]="CHILD",diskid[3],output[512];
static unsigned int used;
static unsigned char drivemodel(unsigned char d,unsigned char r){return model;}
static unsigned char location_kind(void){return kind;}
static unsigned char rawopen(unsigned char d){++opened;return ready;}
static void channel_close(unsigned char l){++closed;}
static unsigned char blockio(unsigned char d,unsigned char t,unsigned char s,unsigned char w){
    trackread=t;sectorread=s;memset(io,160,256);io[2]=kind==1?0x48:0x44;
    memcpy(io+4,"ROOT",4);io[22]='r';io[23]='1';return 1;
}
static unsigned char bam(unsigned char d){++bams;return 0;}
static void uppername(const char *s,char *d){while(*s)*d++=toupper(*s++);*d=0;}
static const char *drivename(unsigned char d){return "8";}
static void outs(const char *s){strcat(output,s);used=strlen(output);ox=1;}
static void newline(void){outs("\\n");ox=0;}
static void print(const char *fmt,...){char text[128];va_list a;va_start(a,fmt);vsnprintf(text,sizeof(text),fmt,a);va_end(a);outs(text);}
${functions('rootmetadata','partitionheader','volumeheader')}
int main(void){
    volumeheader(8);
    if(trackread!=40||sectorread||closed!=1||bams||strcmp(volume,"CHILD")||!strstr(output,"ROOT")||!strstr(output,"R1"))return 1;
    header=1;output[0]=0;volumeheader(8);header=40;
    if(selections!=2||!strstr(output,"ROOT")||strcmp(cachedir,"A\\\\B"))return 8;
    model=DRIVE_CMD_FD;kind=1;output[0]=0;volumeheader(8);partitionheader(8);
    if(trackread!=1||sectorread!=1||bams||strcmp(volume,"CHILD")||!strstr(output,"ROOT")||!strstr(output,"Partition type is NATIVE"))return 2;
    kind=2;output[0]=0;partitionheader(8);if(!strstr(output,"1541"))return 3;
    kind=3;output[0]=0;partitionheader(8);if(!strstr(output,"1571"))return 4;
    kind=4;output[0]=0;partitionheader(8);if(!strstr(output,"1581"))return 5;
    kind=0;output[0]=0;partitionheader(8);if(output[0]||rootmetadata(8,volume,diskid)!=3)return 6;
    model=DRIVE_1581;kind=4;ready=0;output[0]=0;volumeheader(8);
    if(bams||strstr(output,"Disk ID")||optionalheader)return 7;
    return 0;
}
`);
require('./simulator')('build/test-root-metadata.c');
console.log('PASS root label/ID without navigation, CMD partition types, virtual root and unreadable metadata');
