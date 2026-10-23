// Parse actual BASIC-directory bytes and exercise backend command sequences.
require('./setup');
const fs=require('fs'),{fn,functions}=require('./source');
function line(name,blocks,type='SEQ',remainder=1){return [remainder,1,blocks&255,blocks>>8,...Buffer.from('"'+name+'" '+type),0];}
const header=[1,4,...line('CARD',0,'')],end=[...line('',123,'').slice(0,4),...Buffer.from('BLOCKS FREE'),0,0,0];
const root=[...header,...line('CHILD',0,'DIR'),...line('FILE',2,'SEQ',48),...line('IMAGE.D81',3226,'PRG'),...end];
const child=[...header,...line('INNER',1,'SEQ',12),...end];
const parts=[...header,...line('CARD',1,'FAT'),...line('BAD/NAME',2,'FAT'),0,0];
const array=b=>'{'+b.join(',')+'}';
fs.writeFileSync('build/test-host-protocol.c',`
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include "../src/storage.h"
#define CBM_T_DEL 0
#define CBM_T_OTHER 4
#define CBM_T_SEQ 16
#define CBM_T_PRG 17
#define CBM_T_USR 18
#define CBM_T_REL 19
#define CBM_T_DIR 20
#define CBM_T_CBM 21
#define CBM_A_RO 1
#define CBM_A_RW 3
#define CART_CHANNEL_COUNT 6
static unsigned char cart_channels[6];
#define channel_buffer(f,a) ((void)0)
#define cart_directory(f,a,e) 1
typedef struct Path {unsigned char dev;char name[17],dir[128];} Path;
typedef struct Entry {char name[17];unsigned int blocks;unsigned char type;} Entry;
struct DirectoryEntry {char name[17];unsigned int size;unsigned char type,access,remainder;};
typedef struct HostCursor {unsigned char dev,lfn,model,partitions,done;} HostCursor;
static const unsigned char rootbytes[]=${array(root)},childbytes[]=${array(child)},partbytes[]=${array(parts)};
static const unsigned char *streams[7];
static unsigned int positions[7],lengths[7];
static unsigned char model=DRIVE_SD2IEC,physical,errors,commands,closed,cachevalid=1;
static unsigned int count;
static Entry files[1];
static char requests[200];
static unsigned char drivemodel(unsigned char d,unsigned char r){return model;}
static void error(const char *s){++errors;}
static unsigned char drivepresent(unsigned char d){return 1;}
static unsigned char command(unsigned char d,const char *s){
    ++commands;strcat(requests,s);strcat(requests,";");
    if(!strcmp(s,"cd:CHILD"))physical=1;
    else if(!strcmp(s,"cd//")||!strcmp(s,"cd:/")||!strcmp(s,"cp1"))physical=0;
    else return 0;
    return 1;
}
unsigned char partition_info(unsigned char d,unsigned char n,PartitionInfo *p){
    p->number=n;p->type=n==1?1:0;strcpy(p->name,"CARD");return p->type!=0;
}
static unsigned char channel_open(unsigned char f,unsigned char d,unsigned char s,const char *name){
    if(!strcmp(name,"$=p")){streams[f]=partbytes;lengths[f]=sizeof(partbytes);}
    else {streams[f]=physical?childbytes:rootbytes;lengths[f]=physical?sizeof(childbytes):sizeof(rootbytes);}
    positions[f]=0;return 0;
}
static int channel_read(unsigned char f,void *p,unsigned int n){
    unsigned int left=lengths[f]-positions[f];if(n>left)n=left;
    memcpy(p,streams[f]+positions[f],n);positions[f]+=n;return n;
}
static void channel_close(unsigned char f){++closed;}
static unsigned char host_select(unsigned char d,const char *p,unsigned char m);
unsigned char location_select(unsigned char d,const char *p){return host_select(d,p,model);}
/* Keep the scripted byte-transport boundary unoptimized in this fixture;
 * linked-cartridge tests exercise the optimized production reader. */
#pragma optimize(push, 0)
${fn('directory_read')}
#pragma optimize(pop)
${functions('host_partition','host_begin','host_partfind','host_isdir','host_select','host_open','host_next','host_find','host_complete')}
int main(void){
    Path p={8,"",""};HostCursor cursor;struct DirectoryEntry e;PartitionInfo info;unsigned int index=0;
    if(!host_open(&p,&cursor,4,0)||!cursor.partitions)return 1;
    if(host_next(&cursor,&e)||strcmp(e.name,"CARD")||e.size!=1)return 2;
    if(host_next(&cursor,&e)||strcmp(e.name,"@2")||e.size!=2)return 17;
    if(host_next(&cursor,&e)!=2||!cursor.done)return 3;
    requests[0]=0;commands=0;
    if(!host_select(8,"@1\\\\CHILD",model)||physical!=1||strcmp(requests,"cp1;cd//;cd:CHILD;"))return 4;
    requests[0]=0;
    if(host_select(8,"@1\\\\IMAGE.D81",model)||strstr(requests,"cd:IMAGE"))return 5;
    if(!host_partfind(8,"CARD",&info)||info.number!=1)return 6;
    if(host_partfind(8,"@0",&info)||host_partfind(8,"@256",&info))return 7;
    strcpy(p.dir,"@1");strcpy(p.name,"FILE");
    if(host_find(&p)!=0||cachevalid||count!=1||strcmp(files[0].name,"FILE"))return 8;
    if(!host_open(&p,&cursor,4,0))return 9;
    if(host_next(&cursor,&e)||e.type!=CBM_T_DIR)return 10;
    if(host_next(&cursor,&e)||e.remainder!=48||e.size!=2)return 11;
    channel_close(4);
    if(!host_complete(&p,"FI",&index)||strcmp(files[0].name,"FILE"))return 12;
    if(!host_complete(&p,"FI",&index)||strcmp(files[0].name,"FILE"))return 13;
    model=DRIVE_SOFTIEC;requests[0]=0;
    if(!host_select(9,"CHILD",model)||strcmp(requests,"cd:/;cd:CHILD;"))return 14;
    strcpy(p.dir,"");p.dev=9;
    if(!host_open(&p,&cursor,4,1)||cursor.partitions)return 15;
    if(host_next(&cursor,&e)||strcmp(e.name,"CHILD"))return 16;
    channel_close(4);
    return 0;
}
`);
require('./simulator')('build/test-host-protocol.c');
console.log('PASS streamed SD2IEC partitions, directory size remainder, uncached lookup/completion, legacy SoftIEC paths and image-entry rejection');
