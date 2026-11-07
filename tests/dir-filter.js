require('./setup');
const fs = require('fs');
const {functions} = require('./source');
const harness = `
#include <stdio.h>
#include <string.h>
#include "../tests/location-fixture.h"
#undef host_device
#undef host_dir
#define host_device(d) (model>=DRIVE_SOFTIEC)
#define HOST_DIR_NATIVE 2
#include <ctype.h>
#define CBM_T_DEL 0
#define CBM_T_SEQ 16
#define CBM_T_PRG 17
#define CBM_T_USR 18
#define CBM_T_REL 19
#undef imagekind
#define imagekind(n) (strstr(n,".D64") != 0)
#define SYSOUT_INVALID_SWITCH "invalid"
#define SYSOUT_DIR_HEADER "header"
#define SYSOUT_DIR_WIDE_ENTRY "%s"
#define SYSOUT_DIR_ENTRY "entry%s"
#define SYSOUT_DIR_BLOCKS "blocks%s"
#define SYSOUT_DIR_TOTAL "total"
#define SYSOUT_DIR_FREE "free"
typedef struct Entry {char name[17]; unsigned char type; unsigned int blocks;} Entry;
typedef struct PartitionInfo {unsigned char type;} PartitionInfo;
static unsigned char partition_info(unsigned char d,unsigned char n,PartitionInfo *p){return 0;}
struct Path {unsigned char dev; char name[17]; char dir[128];};
static struct Entry files[6] = {{"del",CBM_T_DEL,1},{"seq",CBM_T_SEQ,2},{"prg",CBM_T_PRG,3},{"usr",CBM_T_USR,4},{"rel",CBM_T_REL,5}};
static struct Path p1,p2;
static unsigned char drive, envready, pagelines, redirected, outputcol, ox, aborted;
static unsigned int count=5, freeblocks, workspace[6];
static int argc, errors, seen, selected;
static unsigned char model, entries, blockreports, freereports;
static unsigned char nativecalls,lastflags,lastfilter,lastmode;
static void host_dir(unsigned char f,unsigned char t,unsigned char r){if(r&HOST_DIR_NATIVE)++nativecalls;lastflags=f;lastfilter=t;lastmode=r;}
static const char *args[5];
static const char *defaults;
static char *envget(const char *s) {return (char *)defaults;}
static char io[256];
static int path(const char *s, struct Path *p) {strcpy(p->name,s);return 1;}
static int directory(unsigned char d) {return 1;}
static unsigned char drivemodel(unsigned char d,unsigned char r) {return model;}
static void error(const char *s) {++errors;}
static void volumeheader(unsigned char d) {}
static const char *drivename(unsigned char d) {return "0";}
static void print(const char *fmt, ...) {
    ox=outputcol=1;
    if(!strcmp(fmt,SYSOUT_DIR_ENTRY))++entries;
    if(!strcmp(fmt,SYSOUT_DIR_BLOCKS))++blockreports;
    if(!strcmp(fmt,SYSOUT_DIR_FREE))++freereports;
}
static void say(const char *s) {++seen; selected |= 1 << (s[0]=='d'?0:s[0]=='s'?1:s[0]=='p'?2:s[0]=='u'?3:4);}
static int match(const char *pattern,const char *name) {return !strcmp(pattern,"*") || !strcmp(pattern,name);}
static void uppername(const char *s,char *d) {strcpy(d,s);}
static const char *typename(unsigned char t) {return "";}
static const char *allocated(unsigned int n) {return "";}
static const char *decimal(unsigned int n) {return "";}
static int page(void) {return 1;}
static void outs(const char *s) {ox=outputcol=1;}
static void newline(void) {ox=outputcol=0;}
${functions('diroption','dirdefaults','dircompare','direntry','dirfooter','dirpath','dircmd')}
int main(void) {
    int i;
    static const char *types[5]={"/TD","/TS","/TP","/TU","/TR"};
    args[1]="/B";
    argc=3;
    for(i=0;i<5;++i) {
        errors=seen=selected=0;
        args[2]=types[i];
        dircmd();
        if(errors || seen!=1 || selected!=(1<<i)) return i+1;
    }
    args[2]="/ts";args[3]="/ON";argc=4;
    errors=seen=selected=0;dircmd();
    if(errors || seen!=1 || selected!=2) return 6;
    args[3]="prg";errors=seen=selected=0;dircmd();
    if(errors || seen) return 7;
    args[2]="/TX";argc=3;errors=seen=0;dircmd();
    if(errors!=1 || seen) return 8;
    args[2]="/TPX";errors=seen=0;dircmd();
    if(errors!=1 || seen) return 9;
    argc=2;errors=seen=0;dircmd();
    if(errors || seen!=5) return 10;
    argc=1;model=DRIVE_SD2IEC;p1.name[0]=0;entries=blockreports=freereports=0;
    dircmd();if(entries || blockreports || freereports)return 11; /* Host listings use their own backend. */
    model=DRIVE_1541;entries=blockreports=freereports=0;
    dircmd();if(entries!=5 || blockreports!=5 || freereports!=1)return 12;
    model=DRIVE_SOFTIEC;argc=2;args[1]="/N";errors=nativecalls=0;dircmd();
    if(errors||nativecalls!=1)return 13;
    argc=3;args[2]="/B";dircmd();if(errors!=1||nativecalls!=1)return 14;
    argc=2;model=DRIVE_SD2IEC;dircmd();if(errors!=1||nativecalls!=1)return 15;
    model=DRIVE_1541;args[2]="/B";argc=3;seen=0;dircmd();if(errors!=1||seen!=5)return 16;
    model=DRIVE_SOFTIEC;argc=3;args[2]="/L";dircmd();if(lastflags!=2||nativecalls!=2)return 17;
    argc=4;args[2]="/OS";args[3]="/S";dircmd();if(lastflags!=36||lastmode!=3)return 18;
    args[2]="/TP";args[3]="*.D64";dircmd();if(lastfilter!=CBM_T_PRG||strcmp(p2.dir,"*.D64"))return 19;
    argc=1;envready=1;defaults="/N /ON";dircmd();if(lastflags!=4||lastmode!=2)return 20;
    argc=2;args[1]="/L";dircmd();if(lastflags!=2||lastmode!=2)return 21;
    model=DRIVE_SD2IEC;argc=1;dircmd();if(lastflags!=4||lastmode!=0)return 22;
    model=DRIVE_1541;envready=0;argc=3;args[1]="/B";
    count=6;strcpy(files[5].name,"folder");files[5].type=CBM_T_DIR;
    directory_locks[0]=(1<<2)|(1<<4);
    args[2]="/AD";errors=seen=0;dircmd();if(errors||seen!=1)return 23;
    args[2]="/A-D";errors=seen=0;dircmd();if(errors||seen!=5)return 24;
    args[2]="/al";errors=seen=0;dircmd();if(errors||seen!=2)return 25;
    args[2]="/a-l";errors=seen=0;dircmd();if(errors||seen!=4)return 26;
    args[2]="/A";errors=seen=0;dircmd();if(errors||seen!=6)return 27;
    args[2]="/A-";errors=seen=0;dircmd();if(errors!=1||seen)return 28;
    args[2]="/ADX";errors=seen=0;dircmd();if(errors!=1||seen)return 29;
    strcpy(files[2].name,"GAME.D64");strcpy(files[4].name,"DATA.D64");
    strcpy(files[5].name,"DIR.D64");
    args[2]="/TI";errors=seen=0;dircmd();if(errors||seen!=2)return 30;
    args[3]="/AL";argc=4;errors=seen=0;dircmd();if(errors||seen!=2)return 31;
    args[2]="/A-L";args[3]="/TI";errors=seen=0;dircmd();if(errors||seen)return 32;
    args[2]="/TI";args[3]="/AD";errors=seen=0;dircmd();if(errors||seen)return 33;
    args[2]="/AL";args[3]="/TP";errors=seen=0;dircmd();if(errors||seen!=1)return 34;
    args[2]="/TP";args[3]="/AL";errors=seen=0;dircmd();if(errors||seen!=1)return 35;
    args[2]="/OF";argc=3;errors=seen=0;dircmd();if(errors!=1||seen)return 36;
    return 0;
}
`;
fs.writeFileSync('build/test-dir-filter.c', harness);
require('./simulator')('build/test-dir-filter.c');
console.log('PASS DIR five file types, lowercase, sorting, wildcard intersection and invalid switches');
