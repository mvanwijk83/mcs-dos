// Check resumable 1581 reads independently of drive channels and shared io.
require('./setup');
const fs = require('fs'), {functions} = require('./source');
const code = `
#include <string.h>
typedef struct RawReader {unsigned char track,sector,offset;unsigned int sectors;} RawReader;
static RawReader rawreaders[2];
static unsigned char rawresult[256],io[256],eof[16],rawreadmask,rawreading;
static unsigned char disk[3][256], expected[600], actual[600], fail;
static struct {unsigned char dev;char dir[128];} p1;
static unsigned char location_file(unsigned char d,const char *p) {return 1;}
static unsigned char rawopen(unsigned char d) {return 1;}
static void channel_close(unsigned char n) {}
static unsigned char blockio(unsigned char d,unsigned char t,unsigned char s,unsigned char w) {
    if(!rawreading || t!=1 || s>2 || (fail && s==1))return 0;
    memcpy(io,disk[s],256);eof[2]=1;return 1;
}
${functions('raw_reader_read', 'raw_reader_clone')}
int main(void) {
    unsigned int i,n,pos=0;int got;
    for(i=0;i<600;++i)expected[i]=(i*79+3)&255;
    for(i=0;i<3;++i){
        disk[i][0]=i==2?0:1;disk[i][1]=i==2?93:i+1;
        n=i==2?92:254;memcpy(disk[i]+2,expected+i*254,n);
    }
    rawreaders[0].track=1;raw_reader_clone();
    while((got=raw_reader_read(2,io,256))>0){memcpy(actual+pos,io,got);pos+=got;}
    if(got || pos!=600 || memcmp(actual,expected,600) || rawreading || eof[2])return 1;
    pos=0;
    while((got=raw_reader_read(3,io,13))>0){memcpy(actual+pos,io,got);pos+=got;}
    if(got || pos!=600 || memcmp(actual,expected,600))return 2;
    rawreaders[0].track=1;rawreaders[0].sector=0;rawreaders[0].offset=0;
    rawreaders[0].sectors=0;fail=1;memset(actual,0xaa,256);
    if(raw_reader_read(2,actual,256)!=-1 || actual[0]!=0xaa || rawreading || eof[2])return 3;
    return 0;
}
`;
fs.writeFileSync('build/test-raw-readers.c', code);
require('./simulator')('build/test-raw-readers.c');
console.log('PASS independent 1581 cursors, sector boundaries, io aliasing, short reads and failure cleanup');
