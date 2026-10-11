// CMD partition directories end with two zero bytes, without a free-block line.
require('./setup');
const fs = require('fs'), {functions} = require('./source');
fs.writeFileSync('build/test-cmd-part-directory.c', `
#include <string.h>
static const unsigned char stream[] = {
    1,8,1,0,'"','A','"',0,
    1,8,13,0,'"','B','"',0,
    0,0
};
static unsigned int cursor, length=sizeof(stream);
static int channel_read(unsigned char lfn, void *data, unsigned int n)
{
    if(lfn!=2 || cursor+n>length)return 0;
    memcpy(data,stream+cursor,n);cursor+=n;return n;
}
${functions('cmd_nextpartition')}
int main(void)
{
    unsigned int number;
    if(cmd_nextpartition(&number) || number!=1)return 1;
    if(cmd_nextpartition(&number) || number!=13)return 2;
    if(cmd_nextpartition(&number)!=2 || cursor!=sizeof(stream))return 3;
    cursor=0;length=1;if(cmd_nextpartition(&number)!=1)return 4;
    cursor=0;length=3;if(cmd_nextpartition(&number)!=1)return 5;
    cursor=0;length=7;if(cmd_nextpartition(&number)!=1)return 6;
    cursor=16;length=17;if(cmd_nextpartition(&number)!=1)return 7;
    return 0;
}
`);
require('./simulator')('build/test-cmd-part-directory.c');
console.log('PASS CMD partition numbers, two-byte end marker and truncated directory rejection');
