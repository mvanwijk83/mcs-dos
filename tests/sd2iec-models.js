// Provisional SD2IEC support: real detector/dispatch, synthetic IEC responses.
require('./setup');
const fs = require('fs'), {functions} = require('./source');
const harness = `
static unsigned int ultimatebase;
#define PEEK(a) 0
#define POKE(a,b) ((void)0)
static const char *reply;
static unsigned char available=1, shortwrite, queries, errors, cmdcalls, cbmcalls, bad;
static int readlimit=63;
static unsigned char statuschannel(unsigned char dev) {return available?15:0;}
static unsigned int channel_write(unsigned char lfn,const char *p,unsigned int n) {
    ++queries;if(lfn!=15 || n!=2 || memcmp(p,"x?",2))bad=1;
    return shortwrite?1:n;
}
static int channel_read(unsigned char lfn,char *p,unsigned int n) {
    int size=strlen(reply);if(size>readlimit)size=readlimit;
    if(n!=63 || lfn!=15)bad=1;memcpy(p,reply,size);return size;
}
static void error(const char *s) {++errors;}
static unsigned char cmd_model(unsigned char dev) {++cmdcalls;return 0;}
static unsigned char cbm_model(unsigned char dev) {++cbmcalls;return DRIVE_1541;}
static unsigned char cbm_geometry(unsigned char m) {return m;}
static void cmd_geometry(unsigned char d,unsigned char r,unsigned char *g) {*g=1;}
static unsigned char cbm_mode(unsigned char d,unsigned char m,unsigned char s) {return 1;}
${functions('sd_model','drivemodel','drivetype','drivemode')}
int main(void) {
    const char *accepted[]={"09,sd2iec v1.0.0,00,00", "09,SD2IEC V1.0,00,00", "73,uiec v0.10,00,00"};
    const char *rejected[]={"00,sd2iec v1,00,00", "73,CBM DOS V2.6 1541,00,00", "31,SYNTAX ERROR,00,00", "73,SD2IECFAKE V1,00,00", "73,SD2IEC", "73,UIEC", ""};
    unsigned char i;
    for(i=0;i<3;++i) {
        reply=accepted[i];queries=cmdcalls=cbmcalls=errors=0;
        if(drivemodel(8,0)!=DRIVE_SD2IEC || queries!=1 || cmdcalls || cbmcalls || errors || bad)return 1;
        if(drivetype(8,0) || errors)return 2;
        if(drivetype(8,1) || errors!=1)return 3;
        errors=0;if(drivemode(8,1) || errors!=1)return 4;
    }
    for(i=0;i<7;++i) {
        reply=rejected[i];cmdcalls=cbmcalls=errors=0;
        if(drivemodel(8,0)!=DRIVE_1541 || cmdcalls!=1 || cbmcalls!=1 || errors || bad)return 5;
    }
    reply=accepted[0];shortwrite=1;if(sd_model(8))return 6;
    shortwrite=0;readlimit=6;if(sd_model(8))return 7;
    readlimit=63;available=0;queries=0;if(sd_model(8) || queries)return 8;
    return 0;
}
`;
fs.writeFileSync('build/test-sd2iec-models.c',harness);
require('./simulator')('build/test-sd2iec-models.c');
require('child_process').execFileSync(require('./setup').tool('oscar64','oscar64'),
    ['-n','-Os','-Oo','-psci','-e','-o=build/test-sd2iec-petscii.prg','build/test-sd2iec-models-oscar.c'],
    {stdio:'inherit',windowsHide:true,timeout:120000});
console.log('PASS SD2IEC/uIEC X? identification before ROM probes, false/short replies, missing channels and raw-operation rejection');
