// Execute production mount state and command handlers against protocol boundaries.
require('./setup');
const fs=require('fs'),{functions}=require('./source');
fs.writeFileSync('build/test-mount-lifecycle.c',`
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <stdarg.h>
#define CBM_T_DIR 20
#define CBM_T_CBM 21
#define CBM_T_SEQ 16
struct DirectoryEntry {char name[17];unsigned int size;unsigned char type,access,remainder;};
#define PATHSIZE 128
#define MOUNT_COUNT 3
#define MOUNT_RECORD_SIZE 149
#define MOUNT_STATE_SIZE 575
typedef struct Path {unsigned char dev;char name[17],dir[128];} Path;
typedef struct MountRecord {unsigned char dev,source,model,type;char dir[128],name[17];} MountRecord;
static MountRecord mounts[3];
static unsigned char mount_bypass,sd_ready,drive=9,argc,optionalheader,answer=1,prompts,closed,commands,failnew;
static char mount_hostdir[128],working[24][128],output[1024],last[40],selected[128];
static const char *args[4];
static unsigned char redirected;
static Path outputpath,p1;
#define mount_confirm() yesno(SYSOUT_REPLACE_MOUNT)
static unsigned char image_entry(unsigned char dev,const char *name,unsigned char directory);
static unsigned char ultimate,ultcalls,ultdev,ulteject,readat;
static unsigned char drivemodel(unsigned char d,unsigned char r){return d==9?DRIVE_SD2IEC:d==11?DRIVE_SOFTIEC:DRIVE_1541;}
static unsigned char location_index(unsigned char d){return d?d-7:0;}
static unsigned char ultimate_drive(unsigned char d){return ultimate&&d==8;}
static unsigned char softiec_mount(const Path *p,unsigned char d,unsigned char u){++ultcalls;ultdev=d;ulteject=u;return 1;}
static void error(const char *s){if(!optionalheader){strcat(output,s);strcat(output,"\\n");}}
static void print(const char *fmt,...){char text[256];va_list a;va_start(a,fmt);vsnprintf(text,sizeof(text),fmt,a);va_end(a);strcat(output,text);}
static const char *drivename(unsigned char d){return d==8?"8":d==9?"9":"0";}
static const char *typename(unsigned char t){return t==CBM_T_DIR?"DIR":"SEQ";}
static void uppername(const char *s,char *d){while(*s)*d++=toupper(*s++);*d=0;}
static unsigned char yesno(const char *s){++prompts;return answer;}
static void channel_close(unsigned char n){++closed;}
static void channel_buffer(unsigned char n,unsigned char active){}
static unsigned char command(unsigned char d,const char *s){++commands;strcpy(last,s);if(failnew&&!strcmp(s,"cd:BAD.D64")){failnew=0;return 0;}return 1;}
static unsigned char host_select(unsigned char d,const char *s,unsigned char m){if(!mount_bypass)return 0;strcpy(selected,s);return 1;}
static void nav_invalidate(void){sd_ready=0;}
static unsigned char directory_open(unsigned char f,unsigned char d){readat=0;return 0;}
static unsigned char directory_read(unsigned char f,struct DirectoryEntry *e){
    memset(e,0,sizeof(*e));if(!readat++){strcpy(e->name,"DISK");return 0;}
    if(readat==2){strcpy(e->name,"DOCS");e->type=CBM_T_DIR;return 0;}
    if(readat==3){strcpy(e->name,"INNER.D64");e->type=CBM_T_SEQ;return 0;}
    if(readat==4){strcpy(e->name,"GAME.D64");e->type=CBM_T_SEQ;return 0;}
    if(readat==5){strcpy(e->name,"NEXT.D81");e->type=CBM_T_SEQ;return 0;}
    if(readat==6){strcpy(e->name,"BAD.D64");e->type=CBM_T_SEQ;return 0;}return 2;
}
static unsigned char path(const char *text,Path *p){
    char full[128],*slash;const char *q=text;p->dev=drive;
    if(text[0]>='0'&&text[0]<='9'&&strchr(text,':')){p->dev=atoi(text);q=strchr(text,':')+1;}
    if(*q==0x5c){full[0]=0;++q;}else strcpy(full,working[location_index(p->dev)]);
    if(*q){if(*full)strcat(full,"\\\\");strcat(full,q);}
    slash=strrchr(full,0x5c);p->name[0]=0;
    if(!*q)strcpy(p->dir,full);
    else {strcpy(p->name,slash?slash+1:full);if(slash)*slash=0;else full[0]=0;strcpy(p->dir,full);}
    return 1;
}
${functions('imagekind','imageformat','imagetype','mount_active','mount_geometry','mount_invalidate','mount_reset','close_media','sd_leave','sd_insert','image_entry','mount_select','mount_guard','target_device','mountcmd','mount_restore')}
static void invoke(const char *name){argc=2;args[1]=name;output[0]=0;mountcmd(0);}
int main(void){
    const char native_image[]={68,117,97,108,32,83,73,68,32,84,101,115,116,46,100,54,52,0};
    if(imagekind(native_image)!=1)return 20;
    Path p;unsigned char n;
    if(sizeof(MountRecord)!=149||sizeof(mounts)+sizeof(mount_hostdir)!=575)return 1;
    if(imagekind("a.d64")!=1||imagekind("a.DNP")!=4||imagekind("a.DHD")!=7||imagekind("a.d64x"))return 2;
    if(strcmp(imagetype("a.D64",CBM_T_SEQ),"D64")||strcmp(imagetype("a.D64",CBM_T_DIR),"DIR"))return 3;
    strcpy(working[2],"@1\\\\GAMES");invoke("GAME.D64");
    if(mounts[0].dev!=9||strcmp(mounts[0].dir,"@1\\\\GAMES")||strcmp(mount_hostdir,"@1\\\\GAMES")||working[2][0]||mount_geometry(9)!=1||!strstr(output,"GAME.D64 mounted to drive 9"))return 4;
    if(!mount_select(9,"")||strcmp(selected,"@1\\\\GAMES"))return 5;
    if(!mount_select(9,"DOCS"))return 6;
    if(mount_select(9,"INNER.D64"))return 7;
    strcpy(working[2],"DOCS");answer=0;n=commands;invoke("NEXT.D81");
    if(commands!=n||strcmp(working[2],"DOCS")||strcmp(mounts[0].name,"GAME.D64"))return 8;
    answer=1;invoke("NEXT.D81");
    if(mount_geometry(9)!=3||strcmp(mounts[0].dir,"@1\\\\GAMES")||working[2][0])return 9;
    failnew=1;invoke("BAD.D64");
    if(strcmp(mounts[0].name,"NEXT.D81")||!strstr(output,"Cannot mount BAD.D64"))return 10;
    p.dev=9;strcpy(p.dir,"@1\\\\GAMES");strcpy(p.name,"NEXT.D81");
    if(!mount_guard(&p))return 11;
    argc=1;mountcmd(1);
    if(mount_active(9)||strcmp(working[2],"@1\\\\GAMES"))return 12;
    ultimate=1;drive=0;argc=3;args[1]="11:\\\\USB1\\\\FUN.D64";args[2]="8:";mountcmd(0);
    if(mounts[1].dev!=8||strcmp(mounts[1].dir,"USB1")||ultdev!=8||ulteject)return 13;
    p.dev=11;strcpy(p.dir,"USB1");strcpy(p.name,"FUN.D64");if(mount_guard(&p))return 17;
    mounts[1].name[0]=0;strcpy(mounts[1].name,"FUN.D64");mount_restore();
    if(ultcalls!=2)return 14;
    argc=2;args[1]="8:";mountcmd(1);if(mounts[1].dev||!ulteject)return 15;
    mounts[1].dev=8;ultimate=0;n=ultcalls;mount_restore();
    if(mounts[1].dev||ultcalls!=n)return 19;
    mount_reset();if(mount_active(9)||mounts[1].dev||mount_hostdir[0])return 16;
    drive=9;argc=1;n=commands;mountcmd(1);
    if(commands<n+2)return 18;
    return 0;
}
`);
require('./simulator')('build/test-mount-lifecycle.c',{mount:true});
console.log('PASS mount roots, replacement confirmation and rollback, source context, nested-image rejection, geometry, protection and Ultimate dispatch');
