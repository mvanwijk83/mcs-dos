require('./setup');
const fs=require('fs'),{functions}=require('./source');
const source=fs.readFileSync('src/storage-cmd.c','utf8');
const rowFormat=source.match(/print\("(%c %-3u[^"\n]+)"/)[1];
fs.writeFileSync('build/test-cmd-free.c',`
#include <string.h>
struct DirectoryEntry { unsigned int size; };
static unsigned int entries, reads, blocks=664;
static unsigned char badopen, badheader, badline, closed, noseparators;
static int channel_open(unsigned char lfn,unsigned char dev,unsigned char sa,const char *name){
 if(lfn!=2||dev!=8||sa||strcmp(name,"$254:!!"))return 1;return badopen;
}
static int channel_read(unsigned char lfn,void *buf,unsigned int n){return badheader?0:n;}
static void channel_close(unsigned char lfn){if(lfn==2)++closed;}
static unsigned char directory_read(unsigned char lfn,struct DirectoryEntry *ent){
 ++reads;if(reads==1)return 0;if(badline)return 1;
 if(entries){--entries;return 0;}ent->size=blocks;return 2;
}
${functions('cmd_free','decimal')}
static void reset(void){reads=closed=badopen=badheader=badline=0;entries=0;}
int main(void){
 unsigned long bytes=99;char row[80];
 reset();if(!cmd_free(8,254,&bytes)||bytes!=169984UL||closed!=1)return 1;
 reset();blocks=0;if(!cmd_free(8,254,&bytes)||bytes)return 2;
 reset();blocks=65535;if(!cmd_free(8,254,&bytes)||bytes!=16776960UL)return 3;
 reset();entries=300;if(!cmd_free(8,254,&bytes)||reads!=302||closed!=1)return 4;
 reset();badopen=1;bytes=99;if(cmd_free(8,254,&bytes)||closed!=1||bytes!=99)return 5;
 reset();badheader=1;if(cmd_free(8,254,&bytes)||closed!=1)return 6;
 reset();badline=1;if(cmd_free(8,254,&bytes)||closed!=1)return 7;
 snprintf(row,sizeof(row),"${rowFormat}",'*',254,"ABCDEFGHIJKLMNOP","CMD",decimal(16777216UL));
 if(strlen(row)!=40||row[39]!='\\n')return 8;
 if(strcmp(row,"* 254 ABCDEFGHIJKLMNOP CMD   16,777,216\\n"))return 9;
 snprintf(row,sizeof(row),"${rowFormat}",' ',1,"A","1541",decimal(0));
 if(strlen(row)!=40||row[38]!='0')return 10;
 return 0;
}
`);
require('./simulator')('build/test-cmd-free.c');
console.log('PASS filtered DOS free counts, 32-bit byte conversion, error cleanup and maximum-width single-line rows');
