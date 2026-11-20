// Original UCI target IDENTIFY, including busy/error/timeout ownership rules.
require('./setup');
const fs=require('fs'),{functions}=require('./source');
const identity=[...Buffer.from('SOFTWARE IEC TARGET V1.0')].join(',');
fs.writeFileSync('build/test-softiec-target.c',`
#define CLOCKS_PER_SEC 60
typedef unsigned long clock_t;
static unsigned int ultimatebase=0xde1c,ticks;
static unsigned char pending,mode,at,status,acked,aborted,request[2],sent;
static const unsigned char identity[]={${identity}};
static unsigned char peek(unsigned int address){
    if(address==ultimatebase+1)return 0xc9;
    if(address==ultimatebase){
        if(!pending)return mode==1?1:0;
        if(mode==3)return 0;
        return 0x20 | (mode!=2&&at<24?128:0) | (status<(mode==4||mode==7?1:5)?64:0);
    }
    if(address==ultimatebase+2){unsigned char c=identity[at++];return mode==5?'?':c;}
    if(address==ultimatebase+3){static const unsigned char ok[]={48,48,44,79,75};if(mode==6&&status==1){++status;return 53;}return mode==4?(++status,5):mode==7?(++status,0):ok[status++];}
    return 0;
}
static void poke(unsigned int address,unsigned char value){
    if(address==ultimatebase+1&&sent<2)request[sent++]=value;
    if(address==ultimatebase){if(value==1)pending=1;else if(value==2){++acked;pending=0;}else if(value==4){++aborted;pending=0;}}
}
#define PEEK(a) peek(a)
#define POKE(a,b) poke(a,b)
static clock_t clock(void){return ticks++;}
${functions('softiec_target')}
static void reset(unsigned char m){ultimatebase+=16;mode=m;pending=at=status=acked=aborted=sent=ticks=0;}
int main(void){
    reset(0);if(!softiec_target()||!acked||aborted||sent!=2||request[0]!=5||request[1]!=1)return 1;
    sent=0;if(!softiec_target()||sent)return 2;
    reset(1);if(softiec_target()||sent||aborted)return 3;
    reset(2);if(softiec_target()||aborted!=1)return 4;
    reset(3);if(softiec_target()||aborted!=1||ticks>30)return 5;
    reset(4);if(softiec_target()||aborted!=1)return 6;
    reset(5);if(softiec_target()||aborted!=1)return 7;
    reset(6);if(softiec_target()||aborted!=1)return 8;
    reset(7);if(!softiec_target()||acked!=1||status!=1)return 9;
    return 0;
}
`);
require('./simulator')('build/test-softiec-target.c');
console.log('PASS original SoftIEC target IDENTIFY, no 3.15 commands, successful probe reuse, busy preservation and owned timeout/error cleanup');
