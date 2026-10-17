// Actual raw traversal: nested counts/free space and cleanup on invalid input.
require('./setup');
const fs = require('fs');
const {fn} = require('./source');
const code = `
#include <string.h>
typedef struct DiskWide1581 {unsigned int blocks,files,free,directories,directoryblocks;unsigned char id[2];} DiskWide1581;
static unsigned char io[256],workspace[960];
static char volume[17];
static unsigned char mode,closed,errors;
static unsigned char rawopen(unsigned char d){return 1;}
static void channel_close(unsigned char d){++closed;}
static void error(const char *s){++errors;}
static unsigned char stop(void){return mode==4;}
static void entry(unsigned char offset,unsigned char type,unsigned char track,unsigned int blocks){
    io[offset+2]=type;io[offset+3]=track;io[offset+30]=blocks;io[offset+31]=blocks>>8;
}
static unsigned char blockio(unsigned char d,unsigned char t,unsigned char s,unsigned char w){
    memset(io,0,256);
    if(s==0){io[0]=t;io[1]=3;io[2]=0x44;memset(io+4,160,16);memcpy(io+4,"ROOT",4);io[22]='B';io[23]='K';if(t==1&&mode==1)io[2]=0;}
    else if(s==1||s==2){
        if(t==1&&mode==3)return 0;
        io[2]=0x44;io[3]=0xbb;
        if(t==40){io[16+(s==1?3:0)*6]=s==1?10:20;if(s==1)io[16+39*6]=36;}
        else{io[16]=36;io[22]=10;io[28]=2;}
    }else if(s==3){
        if(t==40){entry(0,0x81,10,2);entry(32,0x85,1,120);entry(64,0x85,5,1);}
        else{entry(0,0x82,1,3);entry(32,0x84,2,5);if(mode==2)entry(64,0x85,1,120);if(mode==5){io[0]=t;io[1]=4;}}
    }else if(s==4&&mode==5){
        /* A second directory sector adds overhead, not another directory. */
    }else return 0;
    return 1;
}
${fn('diskwide1581').replaceAll('static static ', 'static ')}
int main(void){
    DiskWide1581 r;
    if(!diskwide1581(8,&r)||r.blocks!=10||r.files!=3||r.free!=78||r.directories!=1||r.directoryblocks!=4||closed!=1||errors)return 1;
    mode=1;closed=errors=0;
    if(!diskwide1581(8,&r)||r.blocks!=2||r.files!=1||r.free!=30||r.directories||r.directoryblocks||closed!=1||errors)return 2;
    mode=2;closed=errors=0;
    if(diskwide1581(8,&r)||closed!=1||errors!=1)return 3;
    mode=3;closed=errors=0;
    if(diskwide1581(8,&r)||closed!=1)return 4;
    mode=4;closed=errors=0;
    if(diskwide1581(8,&r)||closed!=1)return 5;
    mode=5;closed=errors=0;
    if(!diskwide1581(8,&r)||r.directories!=1||r.directoryblocks!=5||closed!=1||errors)return 6;
    return 0;
}
`;
fs.writeFileSync('build/test-chkdsk-stats.c', code);
require('./simulator')('build/test-chkdsk-stats.c');
console.log('PASS disk-wide files/free space, reserved CBM areas, cyclic extents, read failure and STOP cleanup');
