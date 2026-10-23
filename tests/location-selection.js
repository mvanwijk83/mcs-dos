require('./setup');
const fs = require('fs'), {fn} = require('./source');
const code = `
#include <string.h>
#include <stdlib.h>
#include "../src/storage.h"
#define PATHSIZE 128
#define FS_HOST 5
#define host_select(d,p,m) 0
static unsigned char physicaldev=255,filesystem,firsttrack,lasttrack,directorytrack,nextslot;
static unsigned char touched[24],selecteddev[2],selectedfs[2],selectedfirst[2],selectedlast[2],selectedheader[2],cachevalid;
static char physicaldir[128],selecteddir[2][128],component[17],statusbuf[64],diskcmd[160];
volatile unsigned char location_success;
static unsigned char model=3;
static const char *message;
static unsigned char modelof(unsigned char d) {return model;}
static unsigned char drivemodel(unsigned char d,unsigned char r) {return model;}
unsigned char location_index(unsigned char d) {return d?d-7:0;}
static unsigned char drivepresent(unsigned char d) {return 1;}
static unsigned char command(unsigned char d,const char *s) {strcpy(statusbuf,"02,SELECTED PARTITION,01,10");return 1;}
static void error(const char *s) {message=s;}
unsigned char partition_lookup(unsigned char d,const char *s,PartitionInfo *p) {return 0;}
unsigned char partition_info(unsigned char d,unsigned char n,PartitionInfo *p) {return 0;}
${fn('location_select').replaceAll('location_select','select_impl')}

#define chosen(d,p) (select_impl(d,p), location_success)
typedef struct Path {unsigned char dev;char name[17],dir[128];} Path;
#define location_select(d,p) chosen(d,p)
static unsigned char location_kind(void){return filesystem;}
${fn('disk_location')}
int main(void) {
    Path p={8,"",""};
    if(!chosen(8,""))return 1;
    if(!chosen(8,""))return 2;
    if(!chosen(8,"one"))return 3;
    if(!chosen(8,"one"))return 4;
    if(!chosen(8,"two"))return 5;
    if(directorytrack!=1||filesystem!=4)return 6;
    model=DRIVE_CMD_HD;message=0;
    if(disk_location(&p)||!message||strcmp(message,SYSOUT_SELECT_EMULATION_PARTITION))return 7;
    model=DRIVE_CMD_FD;message=0;
    if(disk_location(&p)||!message||strcmp(message,SYSOUT_SELECT_EMULATION_PARTITION))return 8;
    model=DRIVE_SOFTIEC;message=0;
    if(disk_location(&p)||!message||strcmp(message,SYSOUT_UNSUPPORTED_DRIVE_TYPE))return 9;
    model=DRIVE_1581;strcpy(p.dir,"one");message=0;
    if(disk_location(&p)||!message||strcmp(message,SYSOUT_UNSUPPORTED_DISK_FORMAT))return 10;
    model=DRIVE_1541;p.dir[0]=0;physicaldev=255;message=0;
    if(!disk_location(&p)||message)return 11;
    return 0;
}
`;
fs.writeFileSync('build/test-location-selection.c', code);
require('./simulator')('build/test-location-selection.c');
console.log('PASS physical selection cache, 1581 header context and disk-command root/type diagnostics');
