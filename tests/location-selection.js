require('./setup');
const fs = require('fs'), {fn} = require('./source');
const code = `
#include <string.h>
#include <stdlib.h>
#include "../src/storage.h"
#define PATHSIZE 128
static unsigned char physicaldev=255,filesystem,firsttrack,lasttrack,directorytrack,nextslot;
static unsigned char touched[24],selecteddev[2],selectedfs[2],selectedfirst[2],selectedlast[2],selectedheader[2],cachevalid;
static char physicaldir[128],selecteddir[2][128],component[17],statusbuf[64],diskcmd[160];
volatile unsigned char location_success;
static unsigned char modelof(unsigned char d) {return 3;}
unsigned char location_index(unsigned char d) {return d?d-7:0;}
static unsigned char drivepresent(unsigned char d) {return 1;}
static unsigned char command(unsigned char d,const char *s) {strcpy(statusbuf,"02,SELECTED PARTITION,01,10");return 1;}
static void error(const char *s) {}
unsigned char partition_lookup(unsigned char d,const char *s,PartitionInfo *p) {return 0;}
unsigned char partition_info(unsigned char d,unsigned char n,PartitionInfo *p) {return 0;}
${fn('location_select').replaceAll('location_select','select_impl')}

#define chosen(d,p) (select_impl(d,p), location_success)
int main(void) {
    if(!chosen(8,""))return 1;
    if(!chosen(8,""))return 2;
    if(!chosen(8,"one"))return 3;
    if(!chosen(8,"one"))return 4;
    if(!chosen(8,"two"))return 5;
    if(directorytrack!=1||filesystem!=4)return 6;
    return 0;
}
`;
fs.writeFileSync('build/test-location-selection.c', code);
require('./simulator')('build/test-location-selection.c');
console.log('PASS physical selection cache, repeated selection and 1581 header context');
