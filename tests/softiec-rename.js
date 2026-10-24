// Original DOS target replies, native filename resolution and context recovery.
require('./setup');
const fs=require('fs'), {functions}=require('./source');
fs.writeFileSync('build/test-softiec-rename.c', `
#include <stdio.h>
#include <string.h>
#define CLOCKS_PER_SEC 60
typedef unsigned long clock_t;
typedef struct Path {unsigned char dev;char name[17],dir[128];} Path;
typedef struct HostRecord {char name[17];unsigned long bytes,ordinal;unsigned char type,known,kind;} HostRecord;
#define CBM_T_DIR 20
static Path p1={11,"VERY LONG SOURCE","USB1\\\\VERY LONG PARENT"},p2={11,"NEW",""};
static unsigned int ultimatebase=0xde1c,ticks;
static unsigned char io[256],aborted;
static unsigned char softiec_files,softiec_drive_id;
static unsigned char list_tried,list_saved,list_valid;
static unsigned long softiec_file_size;
static unsigned char softiec_file_kind,statcalls;
static char workspace[960],statusbuf[64],last[64];
static unsigned char request[600],reply[600],statuses[64];
static unsigned int sent,bytes,at,statbytes,statat;
static unsigned char pending,more,listing,index,cwd,mode,timeout,inject,renamed,renames,restores,errors,aborts,writes;
static unsigned char mountedid,mountcalls,ejectcalls;
static unsigned char getpaths,diropens,cancel;
static HostRecord batch[2];
static char native_names[512];
static char mountedname[128];
static char path[600],from[256],to[32];
static void error(const char *s){++errors;strcpy(last,s);}
static unsigned char stop(void){if(cancel&&softiec_files&&cwd==2){aborted=1;return 1;}return 0;}
static clock_t clock(void){return ticks++;}
static unsigned char count(void){return cwd==0?2:cwd==1?1:cwd==2?(mode==3?3:2):0;}
static void status(const char *s){strcpy((char *)statuses,s);statbytes=strlen(s);statat=0;}
static void item(void){
    const char *name;unsigned char attr=16;
    if(cwd==0)name=index?"SD":"USB1";
    else if(cwd==1)name="Very Long Parent Directory";
    else if(!index){name=mode==15?"dual sid test.d64":mode>=9?"Very Long Image Disk File.d64":"note.seq";attr=0;}
    else if(mode==7)name="Different folder";
    else name=index==1?"Very Long Source Folder":"Very Long Source Other";
    reply[0]=attr;strcpy((char *)reply+1,name);bytes=1+strlen(name);at=0;
    if(mode==16&&cwd==2&&!index){memset(reply+1,'x',251);memcpy(reply+252,".d64",4);bytes=256;reply[256]=0;}
    if((mode==12||mode==15)&&cwd==2&&!index){unsigned int j;for(j=1;j<bytes;++j){
        if(reply[j]>=193&&reply[j]<=218)reply[j]-=128;
        else if(reply[j]>=65&&reply[j]<=90)reply[j]+=32;
    }}
    more=index+1<count();status(more?"":"00,OK");
}
static void execute(void){
    char *a=(char *)request+2,*b=a+strlen(a)+1;
    bytes=at=more=listing=0;pending=1;status("00,OK");
    switch(request[1]){
    case 0x12: ++getpaths;strcpy((char *)reply,path);bytes=strlen(path);break;
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
        ++diropens;
        if(mode==4&&!inject){inject=timeout=1;break;}
        if(!count())status("01,DIRECTORY EMPTY");break;
    case 0x14: index=0;listing=1;item();break;
    case 0x0a:
        ++renames;strcpy(from,a);strcpy(to,b);
        if(mode==2)status("INVALID NAME");else renamed=1;
        break;
    case 0x23:
        ++mountcalls;mountedid=request[2];strcpy(mountedname,(char *)request+3);
        if(mode==10)status("89,NOT A DISK IMAGE");
        break;
    case 0x24: ++ejectcalls;mountedid=request[2];if(sent!=3)status("99,BAD LENGTH");break;
    case 0x08:
        ++statcalls;
        if(mode==13){status("88,FILE NOT FOUND");break;}
        memset(reply,0,12);reply[0]=0;reply[1]=0;reply[2]=120;bytes=12;
        reply[8]=68;reply[9]=78;reply[10]=80;
        if(mode==15){reply[1]=171;reply[2]=2;reply[9]=54;reply[10]=52;}
        break;
    case 0x29:
        reply[0]=2;reply[1]=0;reply[2]=8;reply[3]=mode==11?0:1;
        reply[4]=2;reply[5]=9;reply[6]=1;bytes=7;break;
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
${functions('imagekind','softiec_wait','softiec_reply','softiec_dos','softiec_hex','softiec_matches','softiec_resolve','softiec_prefix','softiec_native','softiec_rename','softiec_file','softiec_mount','softiec_metadata','softiec_list_begin','softiec_list','ultimate_drive')}
static void reset(unsigned char m){
    mode=m;sent=pending=more=listing=cwd=timeout=inject=renamed=renames=restores=errors=aborts=writes=aborted=0;ticks=0;
    strcpy(path,"/SD/Original/");last[0]=0;
    softiec_files=softiec_drive_id=mountedid=mountcalls=ejectcalls=statcalls=0;mountedname[0]=0;
    list_tried=list_saved=list_valid=getpaths=diropens=cancel=0;
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
    reset(9);strcpy(p1.name,"VERY LONG IMAGE");
    if(!softiec_mount(&p1,8,0)||mountcalls!=1||mountedid!=8||strcmp(mountedname,"Very Long Image Disk File.d64")||strcmp(path,"/SD/Original/"))return 13;
    if(softiec_mount(&p1,0,2)!=1||mountcalls!=1||strcmp(path,"/SD/Original/"))return 14;
    if(!softiec_mount(0,8,1)||ejectcalls!=1||mountedid!=8)return 15;
    reset(10);if(softiec_mount(&p1,8,0)||mountcalls!=1||strcmp(path,"/SD/Original/"))return 16;
    reset(9);if(!ultimate_drive(8)||!ultimate_drive(9)||ultimate_drive(10))return 17;
    reset(11);if(ultimate_drive(8)||!ultimate_drive(9))return 18;
    reset(12);if(softiec_mount(&p1,0,2)!=1)return 19;
    reset(12);if(softiec_metadata(&p1,p1.name)!=3||softiec_file_kind!=4||softiec_file_size!=7864320UL||statcalls!=1||mountcalls||strcmp(path,"/SD/Original/"))return 20;
    reset(13);if(softiec_metadata(&p1,p1.name)!=1||softiec_file_kind!=1||softiec_file_size||strcmp(path,"/SD/Original/"))return 21;
    softiec_files=1;
    if(!softiec_matches((const unsigned char *)"huge.seq",8,"HUGE"))return 22;
    softiec_files=0;if(softiec_matches((const unsigned char *)"huge.seq",8,"HUGE"))return 23;
    reset(15);strcpy(p1.name,"DUAL SID TEST.D6");
    if(softiec_metadata(&p1,p1.name)!=3||softiec_file_kind!=1||softiec_file_size!=174848UL)return 24;
    reset(15);memset(batch,0,sizeof(batch));
    strcpy(batch[0].name,"DUAL SID TEST.D6");batch[0].type=16;batch[0].bytes=175006UL;
    batch[1]=batch[0];batch[1].known=2;batch[1].bytes=0;
    if(!softiec_list(&p1,batch,2,native_names)||getpaths!=1||diropens!=3||statcalls!=1||restores)return 25;
    if(batch[0].kind!=1||batch[0].known||batch[0].bytes!=175006UL||batch[1].known!=1||batch[1].bytes!=174848UL)return 26;
    batch[1].known=2;
    if(!softiec_list(&p1,batch+1,1,native_names)||getpaths!=1||diropens!=4||statcalls!=2||restores)return 27;
    if(!softiec_list(0,0,0,0)||restores!=1||strcmp(path,"/SD/Original/")||list_tried)return 28;
    reset(15);batch[0].known=2;cancel=1;
    if(softiec_list(&p1,batch,1,native_names)||!aborted||aborts!=1||batch[0].known!=2)return 29;
    if(!softiec_list(0,0,0,0)||restores!=1||strcmp(path,"/SD/Original/"))return 30;
    reset(4);batch[0].known=2;
    if(!softiec_list(&p1,batch,1,native_names)||list_valid||aborts!=1)return 31;
    if(!softiec_list(0,0,0,0)||restores!=1||strcmp(path,"/SD/Original/"))return 32;
    reset(8);batch[0].known=2;
    if(!softiec_list(&p1,batch,1,native_names)||!list_saved)return 33;
    if(softiec_list(0,0,0,0)||errors!=1||strcmp(last,SYSOUT_ULTIMATE_DOS_RESTORE_FAILED)||list_tried)return 34;
    reset(16);strcpy(batch[0].name,"XXXXXXXXXXXXXXXX");batch[0].known=2;
    if(!softiec_list(&p1,batch,1,native_names)||batch[0].known!=1||batch[0].kind!=1||strlen(native_names)!=255||statcalls!=1)return 35;
    if(!softiec_list(0,0,0,0)||strcmp(path,"/SD/Original/"))return 36;
    return 0;
}
`);
require('./simulator')('build/test-softiec-rename.c',{mount:true});
console.log('PASS original UCI rename/mount/unmount packets, long/escaped names, ambiguity, drive IDs, busy/timeout/errors and DOS context restoration');
