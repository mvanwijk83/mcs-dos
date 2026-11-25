// Exercise production command handlers with observable prompts and filesystem stand-ins.
require('./setup');
const fs = require('fs');
const {functions} = require('./source');
fs.writeFileSync('build/test-prompt-defaults.c', `
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CBM_T_DIR 20
#define CBM_T_CBM 21
#define CBM_T_PRG 17
#define CBM_T_SEQ 16
#define CBM_T_USR 18
#define CBM_T_REL 19
#define FS_HOST 5
#define DEVICE_CON 1
#define DEVICE_PRN 2
typedef struct { unsigned char dev; char name[17], dir[128]; } Path;
static Path p1, p2, navpath;
static struct { char name[17]; unsigned char type; } files[1];
static unsigned char envready = 1, copysuppress, aborted, cachevalid, cachedev, drive;
static unsigned char filesystem = FS_HOST, physicaldev;
static unsigned int count;
static int argc, errors, prompts, mutations, mode;
static char *args[8], *copyenv, *delenv;
static char argstore[8][17];
static char cachedir[128], working[1][128], full[128], diskcmd[160];
static char *envget(const char *name) { return !strcmp(name,"COPYCMD") ? copyenv : delenv; }
static void error(const char *s) { ++errors; }
static void say(const char *s) {}
#define print(...) ((void)0)
static int yesno(const char *s) { ++prompts; return 0; }
static int path(const char *s, Path *p) { p->dev=8; p->dir[0]=0; strcpy(p->name,s); return 1; }
static int findfile(const Path *p) { files[0].type=mode==3 ? CBM_T_DIR : CBM_T_PRG; return 0; }
static int copyfile(unsigned char moving) { if(copysuppress || yesno("overwrite")) ++mutations; return 1; }
static int scratch(const Path *p) { ++mutations; return 1; }
static int deletable(const Path *p) { return 1; }
static void uppername(const char *s,char *d) { strcpy(d,s); }
static int appendpart(char *s,const char *p) { strcpy(s,p); return 1; }
static void host_remove(const Path *p,unsigned char r) { ++mutations; }
#define reserved_device(s) 0
#define copy_console(s) ((void)0)
#define typecmd(n) ((void)0)
#define concatcmd() ((void)0)
#define renamecmd() ((void)0)
#define path_directory(p) ((void)0)
#define host_device(d) 0
#define host_wildcopy() ((void)0)
#define host_delete(s) ((void)0)
#define sameplace(a,b) 0
#define location_list(d,p) 1
#define location_file(d,p) 1
#define location_index(d) 0
#define stop() 0
#define match(p,n) 1
#define select_ok(d,p) 1
#define displaypath(d,p,o) ((void)0)
#define drivename(d) "8:"
#define path_join(p) 1
#define make1581(p,s) ((void)0)
#define command(d,s) 1
#define removenative(p) ((void)0)
${functions('copycmd', 'delcmd', 'navcmd')}
/* A declined prompt must prevent every mutation; suppression must reach the backend. */
static int check(int commandmode, const char *first, const char *second, int expected)
{
    int a;
    mode=commandmode; errors=prompts=mutations=0;
    for(a=0;a<8;++a) args[a]=argstore[a];
    argc=0; strcpy(args[argc++],"command"); strcpy(args[argc++],"source");
    if(commandmode<2) strcpy(args[argc++],"destination");
    if(commandmode==3) strcpy(args[argc++],"/S");
    if(first) strcpy(args[argc++],first);
    if(second) strcpy(args[argc++],second);
    if(commandmode<2) copycmd(commandmode);
    else if(commandmode==2) delcmd();
    else navcmd(2);
    return !errors && prompts==!expected && mutations==expected;
}
static char values[][12]={"","","/P","/p","/P "," /P","/P /X","/-P","anything"};
int main(void)
{
    int cmd, i;
    for(cmd=0;cmd<4;++cmd) {
        for(i=0;i<9;++i) {
            copyenv=cmd<2 ? (i ? values[i] : (char *)0) : values[2];
            delenv=cmd<2 ? values[2] : (i ? values[i] : (char *)0);
            if(!check(cmd,0,0,i==2 || i==3)) return 1;
            if(!check(cmd,"/-p",0,0)) return 2;
            if(!check(cmd,"/p",0,1)) return 3;
            if(!check(cmd,"/P","/-P",0)) return 4;
            if(!check(cmd,"/-P","/P",1)) return 5;
        }
        copyenv=delenv=values[2]; envready=0;
        if(!check(cmd,0,0,0)) return 6;
        envready=1;
        if(!check(cmd,0,0,1)) return 7;
        copyenv=delenv=(char *)0;
        if(!check(cmd,0,0,0)) return 8;
    }
    return 0;
}
`);
require('./simulator')('build/test-prompt-defaults.c');
console.log('PASS COPY/MOVE/DEL/RD environment defaults, exact values, switch overrides and reset');
