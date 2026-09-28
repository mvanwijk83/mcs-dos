// Exercise the production M-R decoder against the bundled stock drive ROMs.
require('./setup');
const fs=require('fs'),path=require('path'),{functions}=require('./source');
const cases=[
 ['dos1541-325302-01+901229-05.bin',1,1],['dos1541ii-251968-03.bin',4,1],
 ['dos1570-315090-01.bin',5,1],['dos1571-310654-05.bin',2,2],
 ['dos1571cr-318047-01.bin',2,2],['dos1581-318045-02.bin',3,3],
 ['dos1551-318008-01.bin',0,0],['dos1540-325302+3-01.bin',0,0]
];
const rows=cases.map(([file,model,family])=>{
 const b=fs.readFileSync(path.join(process.env.VICE_HOME,'DRIVES',file)),base=65536-b.length;
 const bytes=[0xe5c4,0xe5c5,0xe5c6,0xe5c7,0xa6e7,0xa6e8,0xa6e9,0xa6ea,0xff33].map(a=>a<base?255:b[a-base]);
 return '{'+[...bytes,model,family].join(',')+'}';
});
const harness=`
#include <string.h>
#define POKE(a,b) ((void)0)
static const unsigned char fixtures[][11]={${rows.join(',')}};
static unsigned char current,offset,errors,bad,fail;
static unsigned char statuschannel(unsigned char dev){return 15;}
static void error(const char *s){++errors;}
static int channel_write(int f,const unsigned char *p,int n){
 if(n!=6||memcmp(p,"m-r",3))bad=1;
 if(p[3]==0xc4&&p[4]==0xe5&&p[5]==4)offset=0;
 else if(p[3]==0xe7&&p[4]==0xa6&&p[5]==4)offset=4;
 else if(p[3]==0x33&&p[4]==0xff&&p[5]==1)offset=8;
 else bad=1;
 return n;
}
static int channel_read(int f,unsigned char *p,int n){
 if(fail&&offset==8)return 0;
 memcpy(p,fixtures[current]+offset,n);return n;
}
${functions('drivemodel','drivetype')}
int main(void){
 for(current=0;current<8;++current){
  errors=0;if(drivemodel(8,0)!=fixtures[current][9]||errors)return 1;
  if(drivetype(8,1)!=fixtures[current][10])return 2;
  if(errors!=(fixtures[current][9]==0))return 3;
 }
 current=1;fail=1;if(drivetype(8,0)!=1)return 4;
 return bad?5:0;
}`;
fs.writeFileSync('build/test-drive-models.c',harness);
require('./simulator')('build/test-drive-models.c');
console.log('PASS stock ROM model signatures, geometry families, unsupported ROMs and subtype-read failure');
