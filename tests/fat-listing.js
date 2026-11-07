require('./setup');
const fs=require('fs'),{functions}=require('./source');
const src=fs.readFileSync('src/fatdir.c','utf8');
fs.writeFileSync('build/test-fat-listing.c',`
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
${src.slice(src.indexOf('#define FAT_ROWS'),src.indexOf('static unsigned char fat_type'))}
typedef struct Item {char name[256];unsigned long size;unsigned char attr,folder;} Item;
static Item current;
static unsigned int entries,readat,iecat,stats,scans,reads,headers,footerFiles,footerDirs,used;
static unsigned long footerBytes;
static unsigned char footerSummary,aborted,redirected,ox,outputcol,pagelines,cachevalid,active,abortcalls,errors,cancel,failread,mode;
static int cwd;
static char pwd[128],workspace[960],io[256],statusbuf[64],output[4500];
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
static void say(const char *s){outs(s);newline();}
static void error(const char *s){++errors;}
static void uppername(const char *s,char *d){strcpy(d,s);}
static const char *drivename(unsigned char d){return "11";}
static const char *typename(unsigned char t){return t==20?"DIR":t==17?"PRG":t==19?"REL":t==18?"USR":"SEQ";}
static void print(const char *s,...){if(!strcmp(s,SYSOUT_DIR_HEADER))++headers;}
static void host_volume(const Path *p){}
static unsigned char location_root(unsigned char d,const char *p){return !*p;}
static void host_footer(unsigned int f,unsigned int d,unsigned long b,unsigned char s){footerFiles=f;footerDirs=d;footerBytes=b;footerSummary=s;}
static void channel_close(unsigned char f){}

static void item(unsigned int i)
{
    unsigned int id = entries - 1 - i, length, j;
    memset(&current, 0, sizeof(current));
    current.name[0] = 70;
    current.name[1] = 48 + id / 100;
    current.name[2] = 48 + id / 10 % 10;
    current.name[3] = 48 + id % 10;
    length = mode == 3 ? 20 + i * 73 % 232 : 4;
    for (j = 4; j < length; ++j) current.name[j] = 97 + i % 26;
    current.name[length] = 46;
    current.name[length + 1] = i % 3 ? 68 : 80;
    current.name[length + 2] = i % 3 ? 54 : 82;
    current.name[length + 3] = i % 3 ? 52 : 71;
    current.name[length + 4] = 0;
    current.size = (id * 37) % 101 + 1;
    if (mode == 1) {
        current.name[0] = 76;
        for (j = 1; j < 16; ++j) current.name[j] = 65;
        current.name[16] = 48 + id / 100;
        current.name[17] = 48 + id / 10 % 10;
        current.name[18] = 48 + id % 10;
        current.name[19] = 0;
    }
    if (mode == 2 && i % 7 == 0) current.attr = 16;
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
    io[0]=current.attr;*length=1+strlen(current.name);memcpy(io+1,current.name,*length-1);++readat;
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
            data[11]=current.attr;*length=12+strlen(current.name);
            if(*length>cap)return 0;
            memcpy(data+12,current.name,*length-12);return 1;
        }}
    }
    return 0;
}
static unsigned char softiec_reply(unsigned char *data,unsigned int cap,unsigned int *length,unsigned char *more){
    ++reads;if(failread&&reads==10){active=0;return 0;}return item_reply(length,more);
}
static unsigned char softiec_resolve(const char *s){strcpy(workspace+512,"ROOT");return 1;}

static unsigned int rows;
static unsigned long sizes[420];
static unsigned char kinds[420], types[420];
static char aliases[420][17];
static void host_row(const struct DirectoryEntry *entry, unsigned char model, unsigned char flags,
                     unsigned char partitions, unsigned char *col, const HostInfo *info)
{
    if (redirected && active) { ++errors; aborted = 1; }
    if (rows >= 420) { ++errors; aborted = 1; return; }
    strcpy(aliases[rows], entry->name);
    sizes[rows] = info->bytes; kinds[rows] = info->kind; types[rows++] = entry->type;
    outc('x'); newline();
}
${functions('imagekind','imageformat','match','softiec_hex','softiec_alias','fat_type','fat_fold','fat_compare_text','fat_match','fat_fullname','fat_compare','fat_swap','fat_down','fat_sort','fat_keep','fat_begin','fat_stat','fat_write_name','fat_emit','fat_selected','fat_collect','fat_listing','fat_dir')}
static void setup(unsigned int count, unsigned char m, const char *pattern)
{
    entries=count; mode=m; rows=0;
    strcpy(p1.dir,"USB1"); strcpy(p1.name,"*"); strcpy(p2.dir,pattern);
    strcpy(pwd,"/Original"); cwd=-1;
    stats=scans=reads=headers=footerFiles=footerDirs=used=0; footerBytes=0;
    footerSummary=aborted=redirected=ox=outputcol=pagelines=active=abortcalls=errors=cancel=failread=0;
    output[0]=0;
}
static unsigned int check_order(unsigned char reverse)
{
    unsigned int i;
    for(i=3;i<rows;++i)
        if(reverse ? strcmp(aliases[i-1],aliases[i])<0 : strcmp(aliases[i-1],aliases[i])>0) return 0;
    return 1;
}
static unsigned int finished(void)
{
    return !errors && !active && !strcmp(pwd,"/Original");
}
int main(void)
{
    unsigned int i; unsigned long total;
    static const char first38[]={70,48,51,56,46,68,54,52,0};
    static const char first01[]={70,48,48,49,46,68,54,52,0};
    setup(30,0,"*");
    if(!fat_dir(0,255,0)||!finished()||rows!=32||footerFiles!=30||stats!=30) return 1;
    setup(400,0,"*");
    if(!fat_dir(4,255,0)||!finished()||rows!=402||!check_order(0)||stats!=400) return 2;
    setup(400,0,"*");
    if(!fat_dir(4|64,255,0)||!finished()||!check_order(1)) return 3;
    setup(300,1,"*");
    if(!fat_dir(4,255,0)||!finished()||rows!=302||stats!=300) return 4;
    setup(150,3,"*");
    if(!fat_dir(4,255,0)||!finished()||rows!=152||!check_order(0)) return 5;
    for(i=2;i<rows;++i) {
        unsigned int id=atoi(aliases[i]+1);
        if(sizes[i]!=(id*37)%101+1) return 6;
    }
    setup(300,0,"*"); redirected=1;
    if(!fat_dir(1,255,0)||!finished()||stats||rows!=302) return 7;
    setup(300,0,"*");
    if(!fat_dir(1,255,0)||!finished()||stats||rows!=302||scans!=1) return 8;
    setup(30,0,"*"); strcpy(p1.name,"*.D64");
    if(!fat_dir(0,255,0)||!finished()||rows!=20||footerFiles!=20||stats!=20) return 9;
    setup(30,0,"*");
    if(!fat_dir(0,17,0)||!finished()||rows!=10||footerFiles!=10) return 10;
    setup(40,0,"*");
    if(!fat_dir(4|16,255,0)||!finished()) return 11;
    for(i=3;i<rows;++i) if(kinds[i-1]<kinds[i]) return 12;
    setup(40,0,"*");
    if(!fat_dir(4|128,255,0)||!finished()||fat_compare_text(aliases[2],"F039")) return 13;
    setup(40,0,"*.D64");
    if(!fat_dir(4,255,HOST_DIR_NATIVE)||!finished()||footerFiles!=26||stats!=26||strstr(output,".PRG")) return 14;
    setup(300,0,"*"); cancel=1;
    if(fat_dir(1,255,0)||!aborted||active||strcmp(pwd,"/Original")) return 15;
    setup(40,0,"*"); failread=1;
    if(fat_dir(4,255,0)||!errors||active||strcmp(pwd,"/Original")) return 16;
    setup(30,4,"*");
    if(!fat_dir(0,255,0)||!finished()||footerSummary!=2) return 17;
    setup(12,2,"*");
    if(!fat_dir(0,255,1)||!finished()||headers||stats||!strstr(output,"11:")) return 18;
    setup(100,1,"*");
    if(!fat_dir(4,255,HOST_DIR_NATIVE)||!finished()||footerFiles!=100||stats!=100) return 19;
    if(!strstr(output,"000")||!strstr(output,"099")||strstr(output,"000")>strstr(output,"001")) return 20;
    setup(40,0,"*.D64");
    if(!fat_dir(4|128,255,HOST_DIR_NATIVE)||!finished()||!strstr(output,first38)) return 21;
    if(strstr(output,first38)>strstr(output,first01)) return 22;
    setup(30,3,"*");
    if(!fat_dir(4,255,HOST_DIR_NATIVE)||!finished()||footerFiles!=30||stats!=30) return 23;
    setup(30,0,"*");
    if(!fat_dir(0,255,HOST_DIR_NATIVE)||!finished()||pagelines!=37) return 24;
    puts("PASS native alias/FAT listings, global sort, packed overflow, duplicate aliases, filters, redirection and cleanup");
    return 0;
}
`);
require('./simulator')('build/test-fat-listing.c',{mount:true});
require('./simulator')('build/test-fat-listing.c',{mount:true,petscii:true});
