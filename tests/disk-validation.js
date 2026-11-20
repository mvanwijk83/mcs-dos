// Actual traversal: V for each formatted 1581 partition, once per native tree.
require('./setup');
const fs=require('fs'),{functions}=require('./source');
fs.writeFileSync('build/test-disk-validation.c',`
#include <string.h>
#include <stdio.h>
#include "../src/storage.h"
#define CBM_T_DIR 20
typedef struct Path{unsigned char dev;char name[17],dir[128];}Path;
static Path p2;
static struct {char name[17];unsigned char type;unsigned int blocks;}files[4];
static unsigned int count;
static unsigned char io[256],entryoffset,workspace[960],model=DRIVE_1581,selected;
#define editbuf workspace
static unsigned char visits[8],failed,stopped,closed,rawtrack;
static unsigned char drivemodel(unsigned char d,unsigned char r){return model;}
static unsigned char stop(void){return stopped;}
static unsigned char location_kind(void){return selected==4?1:selected==5?2:4;}
static unsigned char location_select(unsigned char d,const char *p){
 if(!strcmp(p,"@4"))selected=4;else if(!strcmp(p,"@5"))selected=5;
 else if(!strcmp(p,"@3"))selected=0;else if(strstr(p,"A\\\\B"))selected=2;
 else if(strstr(p,"A"))selected=1;else selected=0;return 1;
}
static unsigned char command(unsigned char d,const char *s){
 if(strcmp(s,"v0"))return 0;++visits[selected];return !failed;
}
static void child(unsigned char n,const char *name){strcpy(files[n].name,name);files[n].type=CBM_T_DIR;}
static unsigned char location_list(unsigned char d,const char *p){
 count=0;if(!selected){child(0,"A");child(1,"RAW");count=2;}
 else if(selected==1){child(0,"B");count=1;}return 1;
}
static unsigned char fileentry(const Path *p){io[3]=!strcmp(p->name,"RAW")?9:1;io[4]=0;entryoffset=0;return 1;}
static unsigned char rawopen(unsigned char d){return 1;}
static unsigned char blockio(unsigned char d,unsigned char t,unsigned char s,unsigned char w){
 rawtrack=t;memset(io,0,256);io[2]=t==9?0:0x44;io[0]=t;io[1]=3;return 1;
}
static void channel_close(unsigned char l){++closed;}
static unsigned char path_join(Path *p){
 if(p->dir[0])strcat(p->dir,"\\\\");strcat(p->dir,p->name);p->name[0]=0;return 1;
}
static unsigned char partition_root(unsigned char d){count=3;files[0].blocks=3;files[1].blocks=4;files[2].blocks=5;return 1;}
static unsigned char partition_info(unsigned char d,unsigned char n,PartitionInfo *p){p->number=n;p->type=n==3?4:n==4?1:2;return 1;}
${functions('formattedchild','validatetree','validate_disk')}
int main(void){
 if(!validate_disk(8)||visits[0]!=1||visits[1]!=1||visits[2]!=1||rawtrack!=9)return 1;
 memset(visits,0,sizeof(visits));model=DRIVE_CMD_HD;
 if(!validate_disk(9)||visits[0]!=1||visits[1]!=1||visits[2]!=1||visits[4]!=1||visits[5]!=1)return 2;
 failed=1;if(validate_disk(9))return 3;
 failed=0;stopped=1;if(validate_disk(9))return 4;
 return 0;
}
`);
require('./simulator')('build/test-disk-validation.c');
console.log('PASS disk-wide VALIDATE traversal, native partition scope, raw reservation skipping, failure and STOP');
