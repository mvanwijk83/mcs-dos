// Only SoftIEC directories use UCI; files, SD2IEC and CMD retain their paths.
require('./setup');
const fs=require('fs'),{functions}=require('./source');
fs.writeFileSync('build/test-rename-dispatch.c',`
#include <string.h>
#include "../src/storage.h"
#define CBM_T_SEQ 16
#define CBM_T_DIR 20
#define CBM_T_CBM 21
typedef struct Path {unsigned char dev;char name[17],dir[128];} Path;
typedef struct Entry {char name[17];unsigned int blocks;unsigned char type;} Entry;
static Path p1,p2;static Entry files[1];
static unsigned char argc=3,cachevalid,model,kind,allowed,exists,errors,uci;
static char args[3][17]={"REN","OLD","NEW"},diskcmd[160],sent[200];
static unsigned char path(const char *s,Path *p){p->dev=11;strcpy(p->dir,"USB1");strcpy(p->name,s);return 1;}
static unsigned char sameplace(const Path *a,const Path *b){return a->dev==b->dev&&!strcmp(a->dir,b->dir);}
static int findfile(const Path *p){return !strcmp(p->name,"OLD")?0:exists?0:-1;}
static unsigned char location_kind(void){return kind;}
static unsigned char drivemodel(unsigned char d,unsigned char r){return model;}
static unsigned char preparewrite(const Path *p){return 1;}
static unsigned char location_file(unsigned char d,const char *p){return allowed;}
static void error(const char *s){++errors;}
static void say(const char *s){++errors;}
static void softiec_rename(void){++uci;}
static unsigned char command(unsigned char d,const char *s){strcat(sent,s);strcat(sent,";");return 1;}
${functions('renamecmd')}
static void reset(unsigned char m,unsigned char t,unsigned char k){model=m;files[0].type=t;kind=k;allowed=1;exists=errors=uci=0;sent[0]=0;}
int main(void){
    reset(DRIVE_SOFTIEC,CBM_T_DIR,5);renamecmd();if(uci!=1||sent[0]||errors)return 1;
    reset(DRIVE_SOFTIEC,CBM_T_SEQ,5);renamecmd();if(uci||strcmp(sent,"r0:NEW=OLD;")||errors)return 2;
    reset(DRIVE_SD2IEC,CBM_T_DIR,5);renamecmd();if(uci||strcmp(sent,"r0:NEW=OLD;")||errors)return 3;
    reset(DRIVE_CMD_FD,CBM_T_DIR,1);renamecmd();if(uci||strcmp(sent,"r0:NEW=OLD;r-h/NEW/:NEW;")||errors)return 4;
    reset(DRIVE_SOFTIEC,CBM_T_DIR,5);allowed=0;renamecmd();if(uci||sent[0])return 5;
    reset(DRIVE_SOFTIEC,CBM_T_DIR,5);exists=1;renamecmd();if(uci||sent[0]||errors!=1)return 6;
    return 0;
}
`);
require('./simulator')('build/test-rename-dispatch.c');
console.log('PASS rename dispatch isolates SoftIEC directories and retains existing-destination and root protections');
