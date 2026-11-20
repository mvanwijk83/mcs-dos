// Exercise binary CMD responses and dispatch with production function bodies.
require('./setup');
const fs = require('fs'), {functions} = require('./source');
const harness = `
#include <string.h>
#include <stdlib.h>
#include "../src/storage.h"
static unsigned char cachevalid, errors, active=1, type=2, requested, bad, shortread, selectfail;
static unsigned char physical=DRIVE_CMD_HD, writes, cbmcalls;
static unsigned char wrongnumber, badtrailer, ignoreselect;
static unsigned int ultimatebase;
static unsigned char softiec_target(void){return 1;}
#define PEEK(a) ((unsigned char)((a)==ultimatebase+1?0xc9:11))
static char diskcmd[160], sent[16];
static unsigned char signature[2]={'h','d'};
static unsigned char statuschannel(unsigned char dev) { return 15; }
static unsigned char sd_model(unsigned char dev) { return 0; }
#define POKE(a,b) ((void)0)
static void error(const char *s) { ++errors; }
static int channel_write(unsigned char lfn, const void *data, unsigned int n)
{
    const unsigned char *p=data;
    ++writes;
    if (n==7 && !memcmp(p,"m-r",3) && p[3]==0xa4 && p[4]==0xfe && p[5]==2 && p[6]==13) {
        requested=254; return n;
    }
    if (n!=5 || memcmp(p,"g-p",3) || p[4]!=13) { bad=1; return 0; }
    requested=p[3];
    return n;
}
static int channel_read(unsigned char lfn, void *data, unsigned int n)
{
    unsigned char *p=data;
    if(requested==254) { memcpy(p,signature,2); return 2; }
    memset(p,0,n);
    p[0]=type; p[2]=requested==255?active:requested;
    if(wrongnumber)++p[2];
    memset(p+3,160,16); memcpy(p+3,"TEST",4);
    p[8]=13; /* embedded CR must not terminate a binary response */
    p[28]=13; p[29]=0; p[30]=badtrailer?0:13;
    return shortread?30:n;
}
static unsigned char command(unsigned char dev,const char *s)
{
    strcpy(sent,s); if(selectfail)return 0;
    if(!ignoreselect)active=atoi(s+2); return 1;
}
${functions('cmd_model', 'cmd_partition', 'cmd_geometry', 'cmd_select')}
static unsigned char cbm_model(unsigned char dev) { ++cbmcalls; return physical<6?physical:0; }
${functions('cbm_geometry', 'cbm_mode', 'drivemodel', 'drivetype', 'drivemode')}
int main(void)
{
    PartitionInfo info;
    if(cmd_model(12)!=DRIVE_CMD_HD)return 1;
    signature[0]='f'; if(cmd_model(12)!=DRIVE_CMD_FD)return 2;
    signature[0]='x'; if(cmd_model(12))return 3;
    signature[0]='h';
    if(!cmd_partition(12,13,&info) || info.number!=13 || info.bytes!=1703936UL || bad)return 4;
    shortread=1; errors=0;
    if(cmd_partition(12,1,&info) || errors!=1)return 5;
    shortread=0; errors=0;
    for(type=2;type<=4;type++)if(drivetype(12,1)!=type-1)return 6;
    type=1; if(drivetype(12,1) || errors!=1)return 7;
    type=5; errors=0; if(drivetype(12,1) || errors!=1)return 8;
    type=2;cachevalid=1;
    if(!cmd_select(12,13) || active!=13 || cachevalid || strcmp(sent,"cp13"))return 9;
    type=0; cachevalid=1; sent[0]=0;
    if(cmd_select(12,2) || sent[0] || cachevalid || active!=13)return 10;
    type=2; selectfail=1;
    if(cmd_select(12,2) || active!=13)return 11;
    selectfail=0; sent[0]=0;
    if(!drivemode(12,1) || sent[0])return 12;
    signature[0]=0;physical=DRIVE_1571;
    if(!drivemode(8,0) || strcmp(sent,"u0>m0"))return 13;
    writes=cbmcalls=errors=0;
    if(drivemodel(14,0)!=DRIVE_1571 || !writes || cbmcalls!=1 || errors)return 14;
    if(drivetype(0,1) || errors!=1)return 15;
    errors=0;wrongnumber=1;
    if(cmd_partition(12,13,&info) || errors!=1)return 17;
    wrongnumber=0;badtrailer=1;errors=0;
    if(cmd_partition(12,13,&info) || errors!=1)return 18;
    badtrailer=0;ignoreselect=1;active=13;errors=0;cachevalid=1;
    if(cmd_select(12,2) || errors!=1 || cachevalid || active!=13)return 19;
    ultimatebase=0xde1c;writes=cbmcalls=errors=0;
    if(drivemodel(11,0)!=DRIVE_SOFTIEC || writes || cbmcalls || errors)return 20;
    if(drivetype(11,0) || errors)return 21;
    if(drivetype(11,1) || errors!=1 || writes)return 22;
    ultimatebase=0xdf1c;errors=0;
    if(drivemodel(11,0)!=DRIVE_SOFTIEC || writes || cbmcalls || errors)return 23;
    ultimatebase=0;errors=0;
    if(drivemodel(11,0)!=DRIVE_1571 || !writes || !cbmcalls || errors)return 24;
    return bad?16:0;
}
`;
// Extracted definitions are static; the production header's private prototypes
// are unnecessary in this isolated harness.
const defs = fs.readFileSync('src/storage.h','utf8');
fs.writeFileSync('build/test-cmd-storage.c', harness.replace('#include "../src/storage.h"',
    defs.slice(defs.indexOf('typedef struct'),defs.indexOf('/* Public services'))));
require('./simulator')('build/test-cmd-storage.c');
console.log('PASS CMD signatures, binary G-P including CR/NUL, geometry, selection, cache and physical mode dispatch');
