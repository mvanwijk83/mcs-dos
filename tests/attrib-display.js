// Display lock bits from one directory transfer, with no raw-sector lookups.
require('./setup');
const fs=require('fs'),{functions,constant}=require('./source');
fs.writeFileSync('build/test-attrib-display.c',`
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#define MAXFILES ${constant('MAXFILES')}
#define CBM_T_DEL 0
#define CBM_T_SEQ 16
#define CBM_T_PRG 17
#define CBM_T_USR 18
#define CBM_T_REL 19
#define CBM_T_DIR 20
#define CBM_T_CBM 21
typedef struct Path {unsigned char dev;char name[17],dir[128];} Path;
static Path p1;
static struct Entry {char name[17];unsigned char type;} files[MAXFILES];
static unsigned int count,available,lists,selects,rawfinds,opens,writes,closes,printed,locked;
static unsigned char argc,aborted,cachevalid,host,device=9,entryoffset,entrytrack=18,entrysector=1;
static unsigned char listok,selectok,pathok,rawok,writeok,initial,lastwritten,stopafter;
static unsigned int stopcalls;
static unsigned char io[256];
static const char *args[5],*lastError;
static unsigned int errors,cartcalls;
static unsigned char seen[MAXFILES];
static unsigned char eligible(unsigned int i){return i!=4&&i!=5&&i!=6;}
static unsigned char host_device(unsigned char d){return host;}
static unsigned char path(const char *s,Path *p){p->dev=device;p->dir[0]=0;strcpy(p->name,s);return pathok;}
static unsigned char location_file(unsigned char d,const char *p){++selects;return selectok;}
static unsigned char directory(unsigned char d){
    unsigned int i;++lists;count=available;cachevalid=1;
    for(i=0;i<count;++i){
        sprintf(files[i].name,"F%03u",i);
        files[i].type=i==4?CBM_T_DIR:i==5?CBM_T_DEL:i==6?CBM_T_CBM:CBM_T_SEQ+(i&3);
        if(i&1)directory_locks[i>>3]&=~(1<<(i&7));
        else directory_locks[i>>3]|=1<<(i&7);
    }
    return listok;
}
static unsigned char location_list(unsigned char d,const char *p){return directory(d);}
static unsigned char fileentry(const Path *p){++rawfinds;io[2]=initial;return rawok;}
static unsigned char rawopen(unsigned char d){++opens;return 1;}
static __noinline unsigned char blockio(unsigned char d,unsigned char t,unsigned char s,unsigned char w){++writes;lastwritten=io[2];return writeok&&w;}
static void channel_close(unsigned char d){++closes;}
static unsigned char cart_attribute(const char *s,unsigned char m){++cartcalls;return 1;}
static unsigned char diskstatus(unsigned char d,unsigned char r){return 0;}
static void uppername(const char *s,char *d){strcpy(d,s);}
static void error(const char *s){++errors;lastError=s;}
static unsigned char stop(void){++stopcalls;if(stopafter&&stopcalls>=stopafter)aborted=1;return aborted;}
static void print(const char *fmt,...){
    va_list ap;int flag;const char *name;unsigned int i;
    va_start(ap,fmt);flag=va_arg(ap,int);name=va_arg(ap,const char *);va_end(ap);
    ++printed;if(flag=='L')++locked;i=atoi(name+1);if(i<MAXFILES)++seen[i];
    /* An output flush can invalidate selection without replacing the cache. */
    cachevalid=0;io[2]=0;
}
${functions('match','attribcmd')}
static void reset(void){
    argc=1;args[0]="attrib";args[1]="*";
    count=lists=selects=rawfinds=opens=writes=closes=printed=locked=errors=stopcalls=cartcalls=0;
    aborted=host=stopafter=cachevalid=0;device=9;available=MAXFILES;
    listok=selectok=pathok=rawok=writeok=1;initial=0xa2;lastwritten=0;lastError=0;
    memset(seen,0,sizeof(seen));
}
int main(void){
    unsigned int i,expected=0,expectedlocks=0;
    for(i=0;i<MAXFILES;++i)if(eligible(i)){++expected;if(!(i&1))++expectedlocks;}
    reset();attribcmd();
    if(errors||printed!=expected||locked!=expectedlocks||lists!=1||rawfinds||opens||writes)return 1;
    for(i=0;i<MAXFILES;++i)if(seen[i]!=(eligible(i)?1:0))return 2;
    reset();argc=2;args[1]="F29*";attribcmd();
    if(errors||printed!=6||locked!=3||lists!=1||rawfinds||writes)return 3;
    reset();argc=2;args[1]="MISSING";attribcmd();
    if(errors!=1||strcmp(lastError,SYSOUT_FILE_NOT_FOUND)||printed||lists!=1||rawfinds)return 4;
    reset();stopafter=3;attribcmd();if(errors||printed!=3||!aborted||lists!=1||rawfinds)return 5;
    reset();listok=0;attribcmd();if(printed||rawfinds||writes||lists!=1)return 6;
    reset();selectok=0;attribcmd();if(printed||rawfinds||writes||lists)return 7;
    reset();host=1;attribcmd();if(errors!=1||lists||rawfinds||writes)return 8;
    reset();argc=3;args[1]="+L";args[2]="F000";available=1;attribcmd();
    if(errors||printed||rawfinds!=1||opens!=1||writes!=1||closes!=1||lastwritten!=0xe2||cachevalid)return 9;
    reset();argc=3;args[1]="-L";args[2]="F000";available=1;initial=0xe2;attribcmd();
    if(errors||rawfinds!=1||writes!=1||lastwritten!=0xa2)return 10;
    reset();argc=3;args[1]="+L";args[2]="F000";available=1;rawok=0;attribcmd();
    if(rawfinds!=1||writes||opens)return 11;
    reset();device=0;available=4;attribcmd();if(errors||printed!=4||cartcalls!=4||rawfinds||writes)return 12;
    return 0;
}
`);
require('./simulator')('build/test-attrib-display.c');
console.log('PASS ATTRIB one directory transfer, cached locks beyond 255 entries, patterns, cancellation, errors and unchanged lock mutations');
