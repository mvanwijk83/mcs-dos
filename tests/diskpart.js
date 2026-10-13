require('./setup');
const fs=require('fs'), {functions}=require('./source');
const h=`
#include <stdlib.h>
#include <string.h>
typedef struct { unsigned char dev; char name[17]; } Path;
static Path p1;
static unsigned char drive=9, model=DRIVE_CMD_HD, selected, listcalls, errors, calls;
static unsigned char argc;
static const char *args[5];
static void error(const char *s) { ++errors; }
static void filename(const char *s,char *d) { strcpy(d,s); }
static void print(const char *s,...) {}
static unsigned char drivemodel(unsigned char dev,unsigned char report) { ++calls; return dev?model:0; }
static unsigned char cmd_select(unsigned char dev,unsigned char n) { selected=n;return 1; }
static void cmd_list(unsigned char dev) { ++listcalls; }
${functions('path','diskpartcmd')}
static void run(const char *a,const char *b,const char *c)
{
    args[1]=a;args[2]=b;args[3]=c;argc=1;if(a)++argc;if(b)++argc;if(c)++argc;
    errors=selected=listcalls=calls=0;diskpartcmd();
}
int main(void)
{
    run(0,0,0);if(errors||listcalls!=1||p1.dev!=9)return 1;
    run("12:",0,0);if(errors||listcalls!=1||p1.dev!=12)return 2;
    run("b:","13",0);if(errors||selected!=13||p1.dev!=9||drive!=9)return 3;
    run("254",0,0);if(errors||selected!=254)return 4;
    run("0",0,0);if(!errors||selected||calls)return 5;
    run("255",0,0);if(!errors||selected||calls)return 6;
    run("-1",0,0);if(!errors||selected||calls)return 7;
    run("1x",0,0);if(!errors||selected||calls)return 8;
    run("2","1",0);if(!errors||selected||calls)return 9;
    run("9:file",0,0);if(!errors||listcalls||calls)return 10;
    run("9:","10:",0);if(!errors||calls)return 11;
    model=DRIVE_CMD_FD;run("32",0,0);if(!errors||selected)return 12;
    run("31",0,0);if(errors||selected!=31)return 13;
    model=DRIVE_1541;run(0,0,0);if(!errors||listcalls||selected)return 14;
    run("4294967297",0,0);if(!errors||selected||calls)return 15;
    model=DRIVE_CMD_HD;run("13","12:",0);if(errors||selected!=13||p1.dev!=12)return 16;
    run("/list",0,0);if(!errors||calls)return 17;
    run("/select:1",0,0);if(!errors||calls)return 18;
    model=DRIVE_SD2IEC;run(0,0,0);if(!errors||listcalls||selected)return 19;
    return 0;
}
`;
fs.writeFileSync('build/test-diskpart.c',h);
require('./simulator')('build/test-diskpart.c');
console.log('PASS DISKPART defaults, drive order, selection bounds, unsupported models and invalid syntax');
