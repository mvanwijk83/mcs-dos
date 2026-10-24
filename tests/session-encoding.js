// Exercise optimized production encoding with nonzero mount-state bytes.
require('./setup');
const fs=require('fs'),{functions}=require('./source');
fs.writeFileSync('build/test-session-encoding.c',`
#include <stdio.h>
#include <string.h>
#include "../src/session-format.h"
#include "../src/mount.h"
static unsigned char fg,bg,bd,drive,echoon,histcount,histnext,envready;
static unsigned int envused;
static char environment[512],history[10][128],rawhistory[10][16],prompttext[33],keybindings[256],working[24][128];
MountRecord mounts[MOUNT_COUNT];
char mount_hostdir[128];
static unsigned char font[2048],encoded[MOUNT_STATE_SIZE];
#define POKE(a,v) (font[(a)-0xe800]=(v))
${functions('statebyte','stateput')}
int main(void){
    unsigned int i;
    for(i=0;i<447;++i)((unsigned char*)mounts)[i]=(i*17+3)&255;
    for(i=0;i<128;++i)mount_hostdir[i]=(i*17+447*17+3)&255;
    for(i=0;i<MOUNT_STATE_SIZE;++i){
        encoded[i]=statebyte(SESSION_MOUNTS_OFFSET+i);
        if(encoded[i]!=(unsigned char)(i*17+3))return 1;
    }
    memset(mounts,0,sizeof(mounts));memset(mount_hostdir,0,128);
    for(i=0;i<MOUNT_STATE_SIZE;++i)stateput(SESSION_MOUNTS_OFFSET+i,encoded[i]);
    for(i=0;i<447;++i)if(((unsigned char*)mounts)[i]!=(unsigned char)(i*17+3))return 2;
    for(i=0;i<128;++i)if(((unsigned char*)mount_hostdir)[i]!=encoded[i+447])return 3;
    stateput(SESSION_FONT_OFFSET,91);stateput(SESSION_SIZE-1,37);
    if(font[0]!=91||font[2047]!=37)return 4;
    puts("PASS optimized session mount-record/host-path encoding, decoding and font boundaries");return 0;
}
`);
require('./simulator')('build/test-session-encoding.c',{mount:true});
