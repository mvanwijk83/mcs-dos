const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const source=fs.readFileSync('src/mcsdos.c','utf8');
const start=source.indexOf('                /* A full-width row already');
const end=source.indexOf("} else if (!c)\n                ++current;",start);
const display=source.slice(start,end);
const help=JSON.parse(fs.readFileSync('src/command-help.json')).DIR;
const fixtures=[help,'x'.repeat(40)+'\nnext','x'.repeat(40)+'\n\nnext','x'.repeat(80)+'\nnext','short\n\nnext'];
let checks='';for(const text of fixtures)for(const redirected of [0,1]){
 const expected=redirected?text:text.split('\n').map(line=>line.match(/.{1,40}/g)?.join('\n')||'').join('\n');
 checks+=`reset(${redirected});show(${JSON.stringify(text)});if(strcmp(output,${JSON.stringify(expected)}))return ${checks.length%100+1};\n`;
}
const harness=`#include <string.h>\nstatic char output[2000];static unsigned char redirected,ox;static unsigned int used;
static void outc(unsigned char c){output[used++]=c;if(c==10||c==13)ox=0;else if(!redirected && ++ox==40){output[used++]=10;ox=0;}output[used]=0;}
static int page(void){return 1;}static void krnio_close(int n){}
static void reset(int r){redirected=r;ox=used=0;output[0]=0;}
static int show(char *s){unsigned char wrapped=0,c;while((c=*s++)){${display}}return 1;}
int main(void){${checks}return 0;}`;
fs.writeFileSync('build/test-help-wrap.c',harness);
execFileSync('tools/cc65/bin/cl65.exe',['-t','sim6502','-O','-o','build/test-help-wrap','build/test-help-wrap.c'],{stdio:'pipe'});
execFileSync('tools/cc65/bin/sim65.exe',['build/test-help-wrap'],{stdio:'inherit'});
console.log('PASS exact DIR help rows, 40/80-column wraps, intentional blank lines and byte-exact redirected help');
