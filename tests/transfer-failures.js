// A disappearing source must fail COPY and preserve MOVE's original file.
require('./setup');
const fs = require('fs');
const {functions} = require('./source');
const code = `
#include <stdio.h>
#include <string.h>
#include "../src/sysout.h"
#define CBM_T_SEQ 16
#define CBM_T_PRG 17
#define CBM_T_USR 18
#define CBM_T_REL 19
typedef struct Path {unsigned char dev;char name[17],dir[128];} Path;
static Path p1={8,"source",""},p2={9,"target",""};
static struct Entry {unsigned char type;} files[1]={{CBM_T_SEQ}};
static char io[256],diskcmd[64],statusbuf[64];
static unsigned char cachevalid,fail,selections,reads,deleted,aborts,closes,written,host,rawcalls,readfail;
static int sameplace(const Path *a,const Path *b){return a->dev==b->dev&&!strcmp(a->dir,b->dir);}
static int host_device(unsigned char d){return host&&d!=0;}
static int findfile(const Path *p){return 0;}
static int deletable(const Path *p){return 1;}
static int preparewrite(const Path *p){return 1;}
static int copyrel(void){return 0;}
static int switchedcopy(unsigned char t){++rawcalls;return 0;}
static int command(unsigned char d,const char *s){return 1;}
static int openreadtype(const Path *p,unsigned char n,unsigned char t){return 1;}
static int openwrite(const Path *p,unsigned char t){return 1;}
static int location_select(unsigned char d,const char *s){
    return !(d==8 && ++selections==2 && fail);
}
static int readio(unsigned char n,void *b,unsigned int size){return ++reads==1?3:readfail?-1:0;}
static int channel_write(unsigned char n,const void *b,unsigned int size){written+=size;return size;}
static void channel_close(unsigned char n){++closes;}
static void channel_abort(unsigned char n){++aborts;}
static int diskstatus(unsigned char d,unsigned char r){return 0;}
static int stop(void){return 0;}
static int scratch(const Path *p){++deleted;return 1;}
static void uppername(const char *s,char *d){strcpy(d,s);}
static void outs(const char *s){}
static void say(const char *s){}
static void error(const char *s){}
static void newline(void){}
${functions('copyfile')}
int main(void){
    if(!copyfile(1)||deleted!=1||aborts||closes!=2||written!=3)return 1;
    fail=1;selections=reads=deleted=aborts=closes=written=0;
    if(copyfile(1)||deleted||aborts!=1||closes!=2||written!=3)return 2;
    p2.dev=0;selections=reads=deleted=aborts=closes=written=0;
    if(copyfile(1)||deleted||aborts!=1||closes!=2||written!=3)return 3;
    host=1;fail=0;p2.dev=8;strcpy(p1.dir,"source");strcpy(p2.dir,"target");
    selections=reads=deleted=aborts=closes=written=0;
    if(!copyfile(0)||rawcalls||selections!=2||deleted||aborts||closes!=2||written!=3)return 4;
    readfail=1;selections=reads=deleted=aborts=closes=written=0;
    if(copyfile(1)||rawcalls||deleted||aborts!=1||closes!=2||written!=3)return 5;
    return 0;
}
`;
fs.writeFileSync('build/test-transfer-failures.c', code);
require('./simulator')('build/test-transfer-failures.c');
console.log('PASS source loss, MOVE preservation, output cleanup and host copies without raw sectors or per-chunk directory switches');
