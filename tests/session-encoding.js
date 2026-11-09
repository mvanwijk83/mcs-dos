// Exercise optimized production session encoding at field boundaries.
require('./setup');
const fs=require('fs'),{constant,functions}=require('./source');
fs.writeFileSync('build/test-session-encoding.c',`
#include <stdio.h>
#include <string.h>
#include "../src/session-format.h"
#include "../src/mount.h"
static unsigned char fg,bg,bd,drive,echoon,histcount,histnext,envready;
static unsigned int envused;
static char environment[${constant('ENVSIZE')}],prompttext[33],keybindings[256],working[24][128];
static struct {char text[10][128];unsigned char raw[10][16];} history;
MountRecord mounts[MOUNT_COUNT];
char mount_hostdir[128];
static unsigned char font[2048],encoded[MOUNT_STATE_SIZE];
#define POKE(a,v) (font[(a)-0xe800]=(v))
${functions('statebyte','stateput')}
int main(void){
    unsigned int i;
    unsigned char low,high;
    envused=sizeof(environment);
    low=statebyte(7);high=statebyte(8);
    envused=0;stateput(7,low);stateput(8,high);
    if(envused!=sizeof(environment))return 5;
    stateput(SESSION_HISTORY_OFFSET-1,94);
    stateput(SESSION_HISTORY_OFFSET,47);
    stateput(SESSION_RAW_HISTORY_OFFSET,59);
    stateput(SESSION_PROMPT_OFFSET-1,63);
    stateput(SESSION_PROMPT_OFFSET,72);
    if(environment[sizeof(environment)-1]!=94||history.text[0][0]!=47||
        history.raw[0][0]!=59||history.raw[9][15]!=63||prompttext[0]!=72)return 6;
    if(statebyte(SESSION_HISTORY_OFFSET-1)!=94||statebyte(SESSION_PROMPT_OFFSET)!=72)return 7;
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
    puts("PASS session environment, history boundary, mount records, host path and font encoding");return 0;
}
`);
require('./simulator')('build/test-session-encoding.c',{mount:true});
