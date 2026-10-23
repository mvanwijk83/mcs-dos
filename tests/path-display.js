// Numeric CMD identities remain stable while presentation uses current names.
require('./setup');
const fs=require('fs'),{fn}=require('./source');
fs.writeFileSync('build/test-path-display.c',`
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include "../src/storage.h"
#define PATHSIZE 128
static unsigned char optionalheader,model=DRIVE_CMD_HD,readable=1,queries;
static const char *name="Native";
static unsigned char modelof(unsigned char dev){return model;}
unsigned char partition_info(unsigned char d,unsigned char n,PartitionInfo *p){
    ++queries;if(!optionalheader||n!=4)return 0;
    if(!readable)return 0;p->type=1;strcpy(p->name,name);return 1;
}
static void uppername(const char *s,char *d){while(*s)*d++=toupper(*s++);*d=0;}
${fn('displaypath')}
int main(void){
    char shown[128],stored[128]="@4\\\\mixed";
    displaypath(8,stored,shown);
    if(strcmp(shown,"NATIVE\\\\MIXED")||strcmp(stored,"@4\\\\mixed")||optionalheader)return 1;
    name="Renamed";displaypath(8,stored,shown);
    if(strcmp(shown,"RENAMED\\\\MIXED"))return 2;
    name="bad/name";displaypath(8,stored,shown);
    if(strcmp(shown,"@4\\\\MIXED"))return 3;
    name="";displaypath(8,stored,shown);
    if(strcmp(shown,"@4\\\\MIXED"))return 4;
    name="Native";readable=0;optionalheader=1;displaypath(8,stored,shown);
    if(strcmp(shown,"@4\\\\MIXED")||optionalheader!=1)return 5;
    readable=1;optionalheader=0;strcpy(shown,stored);displaypath(8,shown,shown);
    if(strcmp(shown,"NATIVE\\\\MIXED"))return 6;
    memset(stored,'x',127);stored[0]='@';stored[1]='4';stored[2]=0x5c;stored[127]=0;
    displaypath(8,stored,shown);if(strlen(shown)!=127||strncmp(shown,"@4",2))return 7;
    model=DRIVE_1581;queries=0;displaypath(8,"normal",shown);
    if(strcmp(shown,"NORMAL")||queries)return 8;
    displaypath(8,"",shown);if(*shown)return 9;
    return 0;
}
`);
require('./simulator')('build/test-path-display.c');
console.log('PASS CMD partition names, numeric fallback, bounded presentation and unchanged canonical paths');
