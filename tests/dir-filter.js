require('./setup');
const fs = require('fs');
const {functions} = require('./source');
const harness = `
#include <stdio.h>
#include <string.h>
#include <ctype.h>
#define CBM_T_DEL 0
#define CBM_T_SEQ 16
#define CBM_T_PRG 17
#define CBM_T_USR 18
#define CBM_T_REL 19
#define SYSOUT_INVALID_SWITCH "invalid"
#define SYSOUT_DIR_HEADER "header"
#define SYSOUT_DIR_WIDE_ENTRY "%s"
#define SYSOUT_DIR_ENTRY "%s"
#define SYSOUT_DIR_BLOCKS "%s"
#define SYSOUT_DIR_TOTAL "total"
#define SYSOUT_DIR_BLOCKS_LINE "%s"
#define SYSOUT_DIR_FREE "free"
struct Entry {char name[17]; unsigned char type; unsigned int blocks;};
struct Path {unsigned char dev; char name[17];};
static struct Entry files[5] = {{"del",CBM_T_DEL,1},{"seq",CBM_T_SEQ,2},{"prg",CBM_T_PRG,3},{"usr",CBM_T_USR,4},{"rel",CBM_T_REL,5}};
static struct Path p1;
static unsigned char drive, envready, pagelines, redirected, outputcol, ox, aborted;
static unsigned int count=5, freeblocks, workspace[5];
static int argc, errors, seen, selected;
static const char *args[5];
static char *envget(const char *s) {return 0;}
static int path(const char *s, struct Path *p) {strcpy(p->name,s);return 1;}
static int directory(unsigned char d) {return 1;}
static void error(const char *s) {++errors;}
static void volumeheader(unsigned char d) {}
static const char *drivename(unsigned char d) {return "0";}
static void print(const char *fmt, ...) {}
static void say(const char *s) {++seen; selected |= 1 << (s[0]=='d'?0:s[0]=='s'?1:s[0]=='p'?2:s[0]=='u'?3:4);}
static int match(const char *pattern,const char *name) {return !strcmp(pattern,"*") || !strcmp(pattern,name);}
static void uppername(const char *s,char *d) {strcpy(d,s);}
static const char *typename(unsigned char t) {return "";}
static const char *allocated(unsigned int n) {return "";}
static const char *decimal(unsigned int n) {return "";}
static int page(void) {return 1;}
static void newline(void) {}
${functions('diroption','dirdefaults','dircompare','dircmd')}
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
    return 0;
}
`;
fs.writeFileSync('build/test-dir-filter.c', harness);
require('./simulator')('build/test-dir-filter.c');
console.log('PASS DIR five file types, lowercase, sorting, wildcard intersection and invalid switches');
