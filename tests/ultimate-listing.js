// Optimized backend with generated directories and explicit cursor lifetimes.
require('./setup');
const fs=require('fs'),{functions}=require('./source');
fs.writeFileSync('build/test-ultimate-listing.c',`
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "../src/storage.h"
#include "../src/host.h"
#define CBM_T_DIR 20
#define CBM_T_CBM 21
#define CBM_T_SEQ 16
#define CBM_T_PRG 17
#define MAXFILES 296
typedef struct Path {unsigned char dev;char name[17],dir[128];} Path;
typedef struct Entry {char name[17];unsigned int blocks;unsigned char type;} Entry;
struct DirectoryEntry {char name[17];unsigned int size;unsigned char type,access,remainder;};
static Entry directory_entries[MAXFILES];
static Path p1={11,"*","USB1"};
static unsigned char redirected,cachevalid,aborted,pagelines,active,mode,failread;
static unsigned int entries=1001,at,opens,rows,closecalls,ends,scans,stats,cancelrow,files,dirs;
static unsigned long sum,seenbytes[1100];
static unsigned int seen[1100];
static unsigned char seentypes[1100],summary;
static char io[256];
${fs.readFileSync('src/ultdir.c','utf8').slice(fs.readFileSync('src/ultdir.c','utf8').indexOf('#define ULT_CHUNK'),fs.readFileSync('src/ultdir.c','utf8').indexOf('static void ultimate_record'))}
static unsigned char location_root(unsigned char d,const char *p){return !*p;}
static const char *drivename(unsigned char d){return "11";}
static const char *typename(unsigned char t){return t==CBM_T_DIR?"DIR":t==CBM_T_PRG?"PRG":"SEQ";}
static void host_volume(const Path *p){}
static void uppername(const char *s,char *d){strcpy(d,s);}
static void print(const char *s,...){}
static void say(const char *s){}
static void newline(void){}
static unsigned char stop(void){return aborted;}
static unsigned char page(void){if(cancelrow&&rows>=cancelrow)aborted=1;return !aborted;}
static void channel_close(unsigned char f){if(f==4){active=0;++closecalls;}}
static unsigned char host_open(const Path *p,HostCursor *c,unsigned char f,unsigned char hidden){++opens;at=0;active=1;c->done=0;return 1;}
static unsigned char host_next(HostCursor *c,struct DirectoryEntry *e){
    unsigned int n;
    if(!active)return 1;
    if(failread&&at==7){active=0;return 1;}
    if(at==entries){active=0;return 2;}
    n=entries-1-at++;memset(e,0,sizeof(*e));e->type=CBM_T_SEQ;e->size=n%5+1;e->remainder=1;
    if(mode==1){strcpy(e->name,"DUP");e->size=at;}
    else if(mode==2){snprintf(e->name,17,"F%4u LONG NAMES",n);if(n%4==0)e->size=9999;}
    else{snprintf(e->name,17,"F%4u",n);if(mode==3&&n%2)e->type=CBM_T_PRG;}
    return 0;
}
static unsigned char softiec_list(const Path *p,HostRecord *r,unsigned char n,char *names){
    unsigned char i,needed=0;
    if(!p){++ends;return 1;}
    if(n>12)return 0;
    for(i=0;i<n;++i)if(r[i].known==2||strlen(r[i].name)==16){
        needed=1;r[i].kind=1;
        if(r[i].known==2){++stats;r[i].bytes=10000UL+atoi(r[i].name+1);r[i].known=1;}
    }
    if(needed)++scans;return 1;
}
static void host_row(const struct DirectoryEntry *e,unsigned char model,unsigned char flags,unsigned char parts,unsigned char *col,const HostInfo *info){
    if(redirected&&active){aborted=1;return;}
    if(e->name[0]=='.')return;
    seen[rows]=mode==1?rows:atoi(e->name+1);seenbytes[rows]=info->bytes;seentypes[rows++]=e->type;
}
static void host_footer(unsigned int f,unsigned int d,unsigned long total,unsigned char s){files=f;dirs=d;sum=total;summary=s;}
${functions('imagekind','imageformat','match','ultimate_record','ultimate_compare','ultimate_swap','ultimate_down','ultimate_keep','ultimate_sort','ultimate_enrich','ultimate_emit','ultimate_unsorted','ultimate_ordered','ultimate_dir')}
static void reset(void){opens=rows=closecalls=ends=scans=stats=files=dirs=0;sum=0;aborted=active=0;cachevalid=1;}
int main(void){
    unsigned int i;
    reset();if(!ultimate_dir(0,255,0)||rows!=1001||opens!=1||ends!=1||files!=1001||dirs!=2||cachevalid)return 1;
    reset();if(!ultimate_dir(4,255,0)||rows!=1001||opens!=12)return 2;
    for(i=0;i<rows;++i)if(seen[i]!=i)return 3;
    reset();if(!ultimate_dir(4|64,255,0))return 4;
    for(i=0;i<rows;++i)if(seen[i]!=1000-i)return 5;
    reset();if(!ultimate_dir(4|128,255,0)||seen[0]!=1000)return 6;
    for(i=1;i<rows;++i)if(seen[i]!=i-1)return 7;
    reset();if(!ultimate_dir(4|32,255,0))return 8;
    for(i=1;i<rows;++i)if(seenbytes[i]<seenbytes[i-1])return 9;
    mode=3;reset();if(!ultimate_dir(4|16,255,0))return 10;
    for(i=1;i<rows;++i)if(seentypes[i]>seentypes[i-1])return 11;
    mode=0;redirected=1;reset();if(!ultimate_dir(0,255,0)||aborted||rows!=1001||opens!=12)return 12;
    reset();if(!ultimate_dir(4,255,0)||aborted||rows!=1001)return 13;
    redirected=0;mode=1;entries=4;reset();if(!ultimate_dir(4,255,0)||rows!=4)return 14;
    for(i=0;i<4;++i)if(seenbytes[i]!=(i+1)*254UL)return 15;
    mode=2;entries=30;reset();if(!ultimate_dir(0,255,0)||rows!=30||scans!=3||stats!=8)return 16;
    reset();if(!ultimate_dir(4|32,255,0)||rows!=30||scans!=3||stats!=8)return 17;
    for(i=1;i<rows;++i)if(seenbytes[i]<seenbytes[i-1])return 18;
    mode=0;entries=1001;cancelrow=9;reset();if(ultimate_dir(0,255,0)||ends!=1||active||cachevalid)return 19;
    cancelrow=0;failread=1;reset();if(ultimate_dir(0,255,0)||ends!=1||active)return 20;
    failread=0;reset();if(!ultimate_dir(1,255,0)||scans||rows!=1001)return 21;
    puts("PASS Ultimate batch ownership, 1001 entries, all sort keys/directions, duplicate aliases, redirection, selective metadata and cleanup");return 0;
}
`);
require('./simulator')('build/test-ultimate-listing.c',{mount:true});
