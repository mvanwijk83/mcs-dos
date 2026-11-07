require('./setup');
const fs=require('fs'),{functions}=require('./source');
const src=fs.readFileSync('src/nativedir.c','utf8');
fs.writeFileSync('build/test-native-options.c',`
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "../src/storage.h"
#include "../src/host.h"
#pragma heapsize(0)
#define CBM_T_DIR 20
#define CBM_T_SEQ 16
#define CBM_T_PRG 17
#define CBM_T_REL 19
#define CBM_T_USR 18
typedef struct Path {unsigned char dev;char name[17],dir[128];} Path;
typedef struct Entry {char name[17];unsigned int blocks;unsigned char type;} Entry;
struct DirectoryEntry {char name[17];unsigned int size;unsigned char type,access,remainder;};
static Entry files[296];
#define directory_entries files
${src.slice(src.indexOf('#define NATIVE_TOP'),src.indexOf('static unsigned char native_fold'))}
typedef struct Item {char name[256];unsigned long size;unsigned char attr,folder;} Item;
static Item current;
static unsigned int entries,readat,iecat,stats,scans,reads,headers,footerFiles,footerDirs,used;
static unsigned long footerBytes;
static unsigned char footerSummary,aborted,redirected,ox,outputcol,pagelines,cachevalid,active,abortcalls,errors,cancel,failread,mode;
static int cwd;
static char pwd[128],workspace[960],io[256],statusbuf[64],output[9000];
static Path p1={11,"*","USB1"},p2;
static unsigned int ultimatebase=0xde1c;
static unsigned char softiec_files;
static unsigned char peek(unsigned int p){return p==ultimatebase+1?0xc9:0;}
static void poke(unsigned int p,unsigned char v){if(p==ultimatebase&&v==4){++abortcalls;active=0;}}
#define PEEK(p) peek(p)
#define POKE(p,v) poke(p,v)
static unsigned char stop(void){if(cancel&&used>90)aborted=1;return aborted;}
static unsigned char page(void){++pagelines;return !aborted;}
static void outc(unsigned char c){
    if(c>=193&&c<=218)c-=128;else if(c>=65&&c<=90)c+=32;
    output[used++]=c;output[used]=0;ox=(ox+1)%40;outputcol=1;
}
static void newline(void){output[used++]=10;output[used]=0;ox=outputcol=0;}
static void outs(const char *s){while(*s)outc(*s++);}
static void error(const char *s){++errors;}
static void uppername(const char *s,char *d){strcpy(d,s);}
static const char *drivename(unsigned char d){return "11";}
static const char *typename(unsigned char t){return t==20?"DIR":t==17?"PRG":t==19?"REL":t==18?"USR":"SEQ";}
static void print(const char *s,...){if(!strcmp(s,SYSOUT_DIR_HEADER))++headers;}
static void host_volume(const Path *p){}
static unsigned char location_root(unsigned char d,const char *p){return !*p;}
static void host_footer(unsigned int f,unsigned int d,unsigned long b,unsigned char s){footerFiles=f;footerDirs=d;footerBytes=b;footerSummary=s;}
static void channel_close(unsigned char f){}
static void item(unsigned int i){
    memset(&current,0,sizeof(current));snprintf(current.name,256,"Very long common prefix %03u.%s",entries-1-i,i%3?"D64":"PRG");current.size=((entries-1-i)*37)%101+1;
    if(mode==2||mode==5){
        if(i==0){strcpy(current.name,"Long Native Folder Name");current.attr=16;}
        if(i==1)strcpy(current.name,"Root.D64");
        if(i==2){strcpy(current.name,"Nested");current.folder=1;current.attr=16;}
        if(i==3){strcpy(current.name,"Child.D64");current.folder=1;}
        if(i==4){strcpy(current.name,"Deep.D64");current.folder=2;}
    }
    if(mode==5&&i==3)strcpy(current.name,"Child.PRG");
    if(mode==3&&i==17)strcpy(current.name,"LAST-NINJA-3.D64");
}
static unsigned char host_open(const Path *p,HostCursor *c,unsigned char f,unsigned char h){iecat=0;return 1;}
static unsigned char host_next(HostCursor *c,struct DirectoryEntry *e){
    while(iecat<entries){item(iecat);if(!current.folder)break;++iecat;}
    if(iecat==entries)return 2;
    memset(e,0,sizeof(*e));strncpy(e->name,current.name,16);
    e->type=current.attr?20:strstr(current.name,".PRG")?17:16;
    e->size=(current.size+253)/254;e->remainder=2+current.size%254;++iecat;return 0;
}
static unsigned char softiec_list(const Path *p,HostRecord *r,unsigned char n,char *names){return 1;}
static unsigned char item_reply(unsigned int *length,unsigned char *more){
    unsigned int next;
    while(readat<entries){item(readat);if(current.folder==cwd)break;++readat;}
    if(readat==entries){*length=0;*more=active=0;return 1;}
    io[0]=current.attr;strcpy(io+1,current.name);*length=1+strlen(current.name);++readat;
    next=readat;while(next<entries){item(next);if(current.folder==cwd)break;++next;}
    *more=active=next<entries;return 1;
}
static unsigned char softiec_dos(unsigned char cmd,const char *a,const char *b,unsigned char *data,unsigned int cap,unsigned int *length,unsigned char *more){
    unsigned int i;*length=0;*more=0;strcpy(statusbuf,"00,OK");
    if(cmd==0x12){strcpy((char *)data,pwd);*length=strlen(pwd);return 1;}
    if(cmd==0x11){
        if(a[0]=='/'){strcpy(pwd,a);cwd=!strcmp(a,"/ROOT")?0:!strcmp(a,"/ROOT/Long Native Folder Name")?1:-1;}
        else if(!strcmp(a,"ROOT")){strcpy(pwd,"/ROOT");cwd=0;}
        else if(!strcmp(a,"Long Native Folder Name")){strcpy(pwd,"/ROOT/Long Native Folder Name");cwd=1;}
        else if(!strcmp(a,"Nested")){strcpy(pwd,"/ROOT/Long Native Folder Name/Nested");cwd=2;}
        else return 0;
        return 1;
    }
    if(cmd==0x13){if(active)return 0;++scans;return 1;}
    if(cmd==0x14){readat=0;return item_reply(length,more);}
    if(cmd==0x08){
        if(active)return 0;++stats;
        for(i=0;i<entries;++i){item(i);if(current.folder==cwd&&!strcmp(current.name,a)){
            if(mode==4&&strstr(a,"007"))return 0;
            memset(data,0,12);data[0]=current.size;data[1]=current.size>>8;data[2]=current.size>>16;data[3]=current.size>>24;
            data[11]=current.attr;*length=12;return 1;
        }}
    }
    return 0;
}
static unsigned char softiec_reply(unsigned char *data,unsigned int cap,unsigned int *length,unsigned char *more){
    ++reads;if(failread&&reads==10){active=0;return 0;}return item_reply(length,more);
}
static unsigned char softiec_resolve(const char *s){strcpy(workspace+512,"ROOT");return 1;}
${functions('imagekind','imageformat','native_fold','native_compare_text','native_name_order','native_match','native_type','native_cached','native_stat','native_compare','native_swap','native_keep','native_selected','native_start','native_row','native_write','native_line','native_emit','native_scan','native_flat','native_summary','native_stream','native_begin','native_tree','native_dir')}
static void setup(unsigned int count,unsigned char m,const char *pattern){
    entries=count;mode=m;
    strcpy(p1.dir,"USB1");strcpy(p1.name,"*");strcpy(p2.dir,pattern);strcpy(pwd,"/Original");cwd=-1;
    stats=scans=reads=headers=footerFiles=footerDirs=used=0;footerBytes=0;
    footerSummary=aborted=redirected=ox=outputcol=pagelines=active=abortcalls=errors=cancel=failread=0;output[0]=0;
}
static unsigned char ordered(unsigned char size,unsigned char reverse){
    char *line=output,*end;unsigned long old=0,value;unsigned int n=0;char *p;
    while(line){end=strchr(line,10);if(end)*end=0;p=strstr(line,"prefix ");if(p){value=strtoul(p+7,0,10);if(size==1)value=(value*37)%101+1;else if(size==2)value=strstr(line,".PRG")?1:0;
        if(n&&(reverse?value>old:value<old))return 0;old=value;++n;}line=end?end+1:(char *)0;}
    return n>0;
}
int main(void){
    setup(30,0,"*");native_dir(0,255,0);if(errors||headers!=1||footerFiles!=30||footerDirs!=2||stats||strcmp(pwd,"/Original"))return 1;
    setup(40,0,"*");native_dir(4,255,0);if(errors||footerFiles!=40||stats!=40||!ordered(0,0))return 2;
    setup(40,0,"*");native_dir(4|64,255,0);if(errors||!ordered(0,1))return 3;
    setup(40,0,"*");native_dir(4|32,255,0);if(errors||stats!=40||!ordered(1,0))return 4;
    setup(40,0,"*");native_dir(4|32|64,255,0);if(errors||!ordered(1,1))return 5;
    setup(300,0,"*.D64");native_dir(4,255,0);if(errors||footerFiles!=200||footerDirs||!ordered(0,0))return 6;
    setup(30,0,"*.D64");native_dir(2,255,0);if(errors||footerFiles!=20||strstr(output,".PRG")||!strstr(output,".d64"))return 7;
    setup(30,0,"*");native_dir(4,17,0);if(errors||footerFiles!=10||footerDirs||strstr(output,".D64"))return 8;
    setup(30,3,"LAST-NINJA-3.D64");native_dir(0,255,0);if(errors||footerFiles!=1||stats!=1)return 9;
    setup(30,0,"*");native_dir(4|128,255,0);if(errors||!strstr(output,"prefix  29.PRG\\nVery long common prefix   0"))return 10;
    setup(5,2,"*.D64");native_dir(0,255,1);if(errors||headers||footerFiles||!strstr(output,"11:\\\\ROOT\\\\ROOT.D64")||!strstr(output,"LONG NATIVE FOLDER NAME\\\\NESTED\\\\DEEP.D64")||strcmp(pwd,"/Original"))return 11;
    setup(300,0,"*");cancel=1;native_dir(0,255,0);if(!aborted||!abortcalls||strcmp(pwd,"/Original"))return 12;
    setup(30,0,"*.D64");failread=1;native_dir(4,255,0);if(!errors||strcmp(pwd,"/Original"))return 13;
    setup(40,0,"*");native_dir(4|16,255,0);if(errors||!ordered(2,0))return 14;
    setup(40,0,"*");native_dir(4|16|64,255,0);if(errors||!ordered(2,1))return 15;
    setup(5,5,"*");native_dir(2,17,1);if(errors||stats||!strstr(output,"long native folder name\\\\child.prg")||strstr(output,".D64"))return 16;
    setup(270,0,"*.D64");native_dir(4|32,255,0);if(errors||footerFiles!=180||!ordered(1,0))return 17;
    puts("PASS native DIR names, filtering, all sort directions, overflow, lowercase, type selection, recursion, fast path and cleanup");return 0;
}
`);
require('./simulator')('build/test-native-options.c',{mount:true});
