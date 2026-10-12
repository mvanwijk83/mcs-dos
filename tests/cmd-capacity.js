require('./setup');
const fs=require('fs'),{functions}=require('./source');
const source=fs.readFileSync('src/storage-cmd.c','utf8');
if(source.includes('cmd_free') || source.includes('$%u:'))throw Error('Listing must not open filesystem directories');
const rowFormat=source.match(/print\("(%c %-3u[^"\n]+)"/)[1];
fs.writeFileSync('build/test-cmd-capacity.c',`
#include <string.h>
static unsigned char noseparators;
${functions('decimal')}
int main(void){
 char row[80];
 snprintf(row,sizeof(row),"${rowFormat}",'*',254,"ABCDEFGHIJKLMNOP","CMD",decimal(16777216UL));
 if(strlen(row)!=40||row[39]!='\\n')return 8;
 if(strcmp(row,"* 254 ABCDEFGHIJKLMNOP CMD   16,777,216\\n"))return 9;
 snprintf(row,sizeof(row),"${rowFormat}",' ',1,"A","1541",decimal(0));
 if(strlen(row)!=40||row[38]!='0')return 10;
 return 0;
}
`);
require('./simulator')('build/test-cmd-capacity.c');
console.log('PASS maximum-width capacity rows and metadata-only listing');
