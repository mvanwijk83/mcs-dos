// Exercise actual directory loading/lookup at both former integer limits.
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const source=fs.readFileSync('src/mcsdos.c','utf8');
assert(source.includes('#define MAXFILES 296'));
const code=source.slice(source.indexOf("static unsigned char directory(unsigned char dev)\n{"),source.indexOf('static unsigned char match('));
const harness=`
#include <stdio.h>
#include <string.h>
#define MAXFILES 296
typedef struct { unsigned char dev; char name[17]; } Path;
struct DirectoryEntry { char name[17]; unsigned int size; unsigned char type; };
static struct { char name[17]; unsigned int blocks; unsigned char type; } files[MAXFILES];
static unsigned int count,freeblocks,available,cursor;
static unsigned char cachevalid,cachedev,errors,closed,failmode;
static char volume[17];
static void error(const char *s) { ++errors; }
static unsigned char drivetype(unsigned char d,unsigned char report) { return 2; }
static unsigned char command(unsigned char d,const char *s) { return !failmode; }
static unsigned char directory_open(unsigned char f,unsigned char d) { cursor=0;return 0; }
static void krnio_close(unsigned char f) { ++closed; }
static unsigned char directory_read(unsigned char f,struct DirectoryEntry *e) {
 if(!cursor++) { strcpy(e->name,"test");return 0; }
 if(cursor-2==available) { e->size=111;return 2; }
 sprintf(e->name,"f%03u",cursor-2);e->size=1;e->type=16;return 0;
}
${code}
int main(void) {
 Path p;unsigned int n;
 p.dev=8;
 for(n=144;n<=296;n+=(n==144?112:40)) {
  available=n;closed=errors=0;
  if(!directory(8)||count!=n||!cachevalid||closed!=1||errors||freeblocks!=111)return 1;
  sprintf(p.name,"f%03u",n-1);if(findfile(&p)!=n-1)return 2;
 }
 available=297;closed=errors=0;
 if(directory(8)||cachevalid||closed!=1||errors!=1)return 3;
 cachevalid=1;count=123;failmode=1;
 if(directory(8)||cachevalid||count)return 4;
 return 0;
}
`;
fs.writeFileSync('build/test-cache-capacity.c',harness);
execFileSync('tools/cc65/bin/cl65.exe',['-t','sim6502','-O','-o','build/test-cache-capacity','build/test-cache-capacity.c'],{stdio:'pipe'});
execFileSync('tools/cc65/bin/sim65.exe',['build/test-cache-capacity'],{stdio:'pipe'});
console.log('PASS 144/256/296 entries, last-entry lookup, oversized directory refusal, failed-mode cache invalidation');
