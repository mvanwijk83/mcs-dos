// No cached entry array: generate a large directory and a mutable nested tree.
require('./setup');
const fs=require('fs'),{functions}=require('./source');
fs.writeFileSync('build/test-host-directories.c',`
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include <stdarg.h>
#include "../src/storage.h"
#define CBM_T_DIR 20
#define CBM_T_SEQ 16
#define CBM_T_PRG 17
#define CBM_A_RO 1
#define CBM_A_RW 3
typedef struct Path {unsigned char dev;char name[17],dir[128];} Path;
struct DirectoryEntry {char name[17];unsigned int size;unsigned char type,access,remainder;};
typedef struct HostCursor {unsigned char dev,lfn,model,partitions,done;} HostCursor;
static Path p1={8,"*","@1"};
static unsigned char mode,model=DRIVE_SD2IEC,hidden,redirected,outputcol,ox,pagelines,noseparators,errors;
static unsigned char present=63,folders[6];
static unsigned int indices[6],opens,rows,used;
static char output[4000],io[256];
static const char *names[]={"A","ROOT.TXT","NOTE","B","HIDDEN","INNER"};
static unsigned char parents[]={0,0,1,1,1,2};
static unsigned char types[]={CBM_T_DIR,CBM_T_SEQ,CBM_T_SEQ,CBM_T_DIR,CBM_T_SEQ,CBM_T_SEQ};
static void newline(void){output[used++]='\\n';output[used]=0;ox=outputcol=0;}
static void outs(const char *s){while(*s){
    if(used>3500){memmove(output,output+2500,used-2500);used-=2500;}
    if(*s=='\\n'){++s;newline();continue;}
    output[used++]=*s++;output[used]=0;if(redirected)outputcol=1;else if(++ox==40)newline();
}}
static void say(const char *s){outs(s);newline();}
static void print(const char *fmt,...){char text[300];va_list a;va_start(a,fmt);vsnprintf(text,sizeof(text),fmt,a);va_end(a);outs(text);if(!strcmp(fmt,SYSOUT_DIR_ENTRY))++rows;}
static void error(const char *s){++errors;}
static unsigned char location_root(unsigned char d,const char *p){return !*p;}
static const char *drivename(unsigned char d){return "8";}
static const char *typename(unsigned char t){return t==CBM_T_DIR?"<DIR>":"SEQ";}
static void uppername(const char *s,char *p){while(*s)*p++=toupper(*s++);*p=0;}
static unsigned char page(void){return 1;}
static unsigned char stop(void){return 0;}
static void channel_close(unsigned char f){}
static void host_volume(const Path *p){}
static unsigned char folder(const char *s){return strstr(s,"A\\\\B")?2:strstr(s,"\\\\A")?1:0;}
static unsigned char host_open(const Path *p,HostCursor *c,unsigned char lfn,unsigned char h){
    ++opens;c->lfn=lfn;c->dev=p->dev;c->model=model;c->partitions=c->done=0;indices[lfn]=0;folders[lfn]=folder(p->dir);hidden=h;return 1;
}
static unsigned char host_next(HostCursor *c,struct DirectoryEntry *e){
    unsigned int n=indices[c->lfn]++;
    e->type=CBM_T_SEQ;e->access=CBM_A_RW;e->remainder=4;e->size=1;
    if(!mode){if(n==1001)return 2;snprintf(e->name,17,"F%4u",n);return 0;}
    if(mode==2){if(n==3)return 2;strcpy(e->name,n==0?"B":n==1?"A":"C");e->size=n==0?3:n==1?1:2;e->remainder=2;return 0;}
    while(n<6 && (!(present&(1<<n))||parents[n]!=folders[c->lfn]||(!hidden&&n==4)))n=indices[c->lfn]++;
    if(n>=6)return 2;
    strcpy(e->name,names[n]);e->type=types[n];return 0;
}
static unsigned char path_join(Path *p){if(p->dir[0])strcat(p->dir,"\\\\");strcat(p->dir,p->name);p->name[0]=0;return 1;}
static unsigned char location_file(unsigned char d,const char *p){return 1;}
static unsigned char scratch(const Path *p){unsigned char i;for(i=0;i<6;++i)if(!strcmp(p->name,names[i]))present&=~(1<<i);return 1;}
static unsigned char command(unsigned char d,const char *s){unsigned char i;for(i=0;i<6;++i)if(!strcmp(s+3,names[i]))present&=~(1<<i);return 1;}
static int host_find(const Path *p){unsigned char i;for(i=0;i<6;++i)if(!strcmp(p->name,names[i])&&(present&(1<<i)))return 0;return -1;}
static void reset(void){used=ox=outputcol=rows=opens=errors=0;output[0]=0;}
${functions('match','decimal','host_bytes','host_number','host_row','host_compare','host_ordered','host_flat','host_dir','host_remove')}
int main(void){
    struct DirectoryEntry e;unsigned char known;Path p={8,"A","@1"};
    e.type=CBM_T_SEQ;e.size=2;e.remainder=48;
    if(host_bytes(&e,model,&known)!=300||known!=1)return 1;
    e.size=0;e.remainder=2;if(host_bytes(&e,model,&known)||known!=1)return 2;
    e.size=4;e.remainder=1;if(host_bytes(&e,model,&known)!=1016||known)return 3;
    e.size=9999;e.remainder=2;if(host_bytes(&e,DRIVE_SOFTIEC,&known)||known!=2)return 4;
    host_number(1016,0,output);if(strcmp(output,"1,016"))return 14;
    reset();if(!host_flat(0,255,0)||rows!=1001||opens!=1||!strstr(output,"1001 File(s)"))return 5;
    mode=2;reset();if(!host_flat(4,255,0)||!strstr(output,"A                SEQ"))return 6;
    if(strstr(output,"A                SEQ")>strstr(output,"B                SEQ")||strstr(output,"B                SEQ")>strstr(output,"C                SEQ"))return 7;
    reset();if(!host_flat(4|32|64,255,0))return 8;
    if(strstr(output,"B                SEQ")>strstr(output,"C                SEQ")||strstr(output,"C                SEQ")>strstr(output,"A                SEQ"))return 9;
    reset();if(!host_flat(4|128,255,0)||strstr(output,"B                SEQ")>strstr(output,"A                SEQ"))return 10;
    mode=1;reset();host_dir(0,255,1);
    if(!strstr(output,"8:\\\\@1\\\\ROOT.TXT")||!strstr(output,"8:\\\\@1\\\\A\\\\NOTE")||!strstr(output,"8:\\\\@1\\\\A\\\\B\\\\INNER"))return 11;
    reset();if(host_remove(&p,0)||errors!=1||present!=63)return 12;
    strcpy(p.dir,"@1");strcpy(p.name,"A");reset();
    if(!host_remove(&p,1)||present!=2||errors||!hidden)return 13;
    return 0;
}
`);
require('./simulator')('build/test-host-directories.c');
console.log('PASS 1001-entry uncached DIR, exact/estimated/clamped sizes, sorting, recursive paths and hidden-file recursive removal');
