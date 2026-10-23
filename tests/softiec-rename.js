// Original DOS target replies, native filename resolution and context recovery.
require('./setup');
const fs=require('fs'), {functions}=require('./source');
fs.writeFileSync('build/test-softiec-rename.c', `
#include <stdio.h>
#include <string.h>
#define CLOCKS_PER_SEC 60
typedef unsigned long clock_t;
typedef struct Path {unsigned char dev;char name[17],dir[128];} Path;
static Path p1={11,"VERY LONG SOURCE","USB1\\\\VERY LONG PARENT"},p2={11,"NEW",""};
static unsigned int ultimatebase=0xde1c,ticks;
static unsigned char io[256],aborted;
static char workspace[960],statusbuf[64],last[64];
static unsigned char request[600],reply[600],statuses[64];
static unsigned int sent,bytes,at,statbytes,statat;
static unsigned char pending,more,listing,index,cwd,mode,timeout,inject,renamed,renames,restores,errors,aborts,writes;
static char path[600],from[256],to[32];
static void error(const char *s){++errors;strcpy(last,s);}
static unsigned char stop(void){return 0;}
static clock_t clock(void){return ticks++;}
static unsigned char count(void){return cwd==0?2:cwd==1?1:cwd==2?(mode==3?3:2):0;}
static void status(const char *s){strcpy((char *)statuses,s);statbytes=strlen(s);statat=0;}
static void item(void){
    const char *name;unsigned char attr=16;
    if(cwd==0)name=index?"SD":"USB1";
    else if(cwd==1)name="Very Long Parent Directory";
    else if(!index){name="note.seq";attr=0;}
    else if(mode==7)name="Different folder";
    else name=index==1?"Very Long Source Folder":"Very Long Source Other";
    reply[0]=attr;strcpy((char *)reply+1,name);bytes=1+strlen(name);at=0;
    more=index+1<count();status(more?"":"00,OK");
}
static void execute(void){
    char *a=(char *)request+2,*b=a+strlen(a)+1;
    bytes=at=more=listing=0;pending=1;status("00,OK");
    switch(request[1]){
    case 0x12: strcpy((char *)reply,path);bytes=strlen(path);break;
    case 0x11:
        if(!strcmp(a,"/")){cwd=0;strcpy(path,"/");}
        else if(a[0]=='/'){
            ++restores;if(mode==8){status("83,NO SUCH DIRECTORY");break;}
            if(renamed&&strstr(a,"Very Long Source Folder")){status("83,NO SUCH DIRECTORY");break;}
            strcpy(path,a);cwd=3;
        }else if(cwd==0&&!strcmp(a,"USB1")){cwd=1;strcpy(path,"/USB1/");}
        else if(cwd==1&&!strcmp(a,"Very Long Parent Directory")){cwd=2;strcpy(path,"/USB1/Very Long Parent Directory/");}
        else status("83,NO SUCH DIRECTORY");
        break;
    case 0x13:
        if(mode==4&&!inject){inject=timeout=1;break;}
        if(!count())status("01,DIRECTORY EMPTY");break;
    case 0x14: index=0;listing=1;item();break;
    case 0x0a:
        ++renames;strcpy(from,a);strcpy(to,b);
        if(mode==2)status("INVALID NAME");else renamed=1;
        break;
    default: status("99,UNKNOWN COMMAND");
    }
}
static unsigned char peek(unsigned int p){
    if(p==ultimatebase+1)return 0xc9;
    if(p==ultimatebase){if(mode==5)return 1;if(timeout)return 1;return pending?0x20|(more?16:0)|(at<bytes?128:0)|(statat<statbytes?64:0):0;}
    if(p==ultimatebase+2)return reply[at++];
    if(p==ultimatebase+3)return statuses[statat++];
    return 0;
}
static void poke(unsigned int p,unsigned char v){
    ++writes;
    if(p==ultimatebase+1){request[sent++]=v;return;}
    if(p==ultimatebase){
        if(v==1)execute();
        else if(v==4){++aborts;timeout=pending=sent=0;}
        else if(v==2){if(more&&listing){++index;item();}else pending=sent=0;}
    }
}
#define PEEK(p) peek(p)
#define POKE(p,v) poke(p,v)
${functions('softiec_wait','softiec_reply','softiec_dos','softiec_hex','softiec_matches','softiec_resolve','softiec_prefix','softiec_native','softiec_rename')}
static void reset(unsigned char m){
    mode=m;sent=pending=more=listing=cwd=timeout=inject=renamed=renames=restores=errors=aborts=writes=aborted=0;ticks=0;
    strcpy(path,"/SD/Original/");last[0]=0;
}
int main(void){
    reset(0);softiec_rename();
    if(errors||!renamed||renames!=1||restores!=1||strcmp(path,"/SD/Original/")||strcmp(from,"Very Long Source Folder")||strcmp(to,"new"))return 1;
    reset(2);softiec_rename();if(errors!=1||renamed||renames!=1||restores!=1||strcmp(path,"/SD/Original/")||strcmp(last,"INVALID NAME"))return 2;
    reset(3);softiec_rename();if(errors!=1||renames||restores!=1||strcmp(last,SYSOUT_AMBIGUOUS_DIRECTORY))return 3;
    reset(4);softiec_rename();if(errors!=1||renames||restores!=1||aborts!=1||ticks>130)return 4;
    reset(5);softiec_rename();if(errors!=1||writes||renames||restores||aborts)return 5;
    reset(6);memset(path,'x',520);path[520]=0;softiec_rename();if(errors!=1||renames||restores||aborts!=1)return 6;
    reset(7);softiec_rename();if(errors!=1||renames||restores!=1||strcmp(last,SYSOUT_DIRECTORY_NOT_FOUND))return 7;
    reset(8);softiec_rename();if(errors!=1||!renamed||renames!=1||restores!=1||strcmp(last,SYSOUT_ULTIMATE_DOS_RESTORE_FAILED))return 8;
    reset(0);strcpy(path,"/USB1/Very Long Parent Directory/Very Long Source Folder/Inner/");softiec_rename();
    if(errors||!renamed||strcmp(path,"/USB1/Very Long Parent Directory/new/Inner/"))return 9;
    if(!softiec_matches((const unsigned char *)"hex{c1} name",12,"HEX\\xc1 NAME"))return 10;
    if(!softiec_matches((const unsigned char *)"Very Long Parent Directory",26,"VERY LONG PARENT"))return 11;
    softiec_native("HEX\\xc1 NAME",(char *)io);if(strcmp((char *)io,"hex{C1} name"))return 12;
    return 0;
}
`);
require('./simulator')('build/test-softiec-rename.c');
console.log('PASS original UCI DOS directory rename, long/escaped names, ambiguity, busy/timeout/error handling and restored/remapped DOS context');
