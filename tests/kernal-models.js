// Production probe against stock ROMs and small, documented replacement fields.
const {tool}=require('./setup');
const fs=require('fs'),path=require('path'),{functions}=require('./source');
const vice=process.env.VICE_HOME||path.dirname(path.dirname(tool('vice','x64sc')));
const spans=[[0xe47c,15],[0xe49b,15],[0xfc00,8],[0xe4ee,1]];
const stocks=fs.readdirSync(path.join(vice,'C64')).filter(f=>/^kernal.*\.bin$/.test(f));
const fields=stocks.map(f=>{
 const bytes=fs.readFileSync(path.join(vice,'C64',f));
 return '{'+spans.flatMap(([at,n])=>[...bytes.subarray(at-0xe000,at-0xe000+n)]).join(',')+'}';
});
const probe=functions('romtext','kernalname');
const harness=`
#include <string.h>
static unsigned char rom[8192];
#define PEEK(a) rom[(a)-0xe000]
${probe}
static const unsigned char stock[][39]={${fields.join(',')}};
static const unsigned char dolphin[]={0xa2,2,0x20,0x13,0xee,0xa5,0x90,0xd0};
static unsigned char check(const char *expected) {
 const char *actual=kernalname();
 return expected ? !actual || strcmp(actual,expected) : actual != 0;
}
int main(void) {
 unsigned char i;
 for(i=0;i<sizeof(stock)/sizeof(stock[0]);++i) {
  memset(rom,0,sizeof(rom));
  memcpy(rom+0x47c,stock[i],15);memcpy(rom+0x49b,stock[i]+15,15);
  memcpy(rom+0x1c00,stock[i]+30,8);rom[0x4ee]=stock[i][38];
  if(check(0))return 1;
 }
 memset(rom,0,sizeof(rom));
 memcpy(rom+0x47c,"JIFFYDOS V6.01 ",15);rom[0x1c00]=0xa3;rom[0x4ee]=0x44;
 if(check("JiffyDOS 6.01"))return 2;
 rom[0x489]='9';if(check("JiffyDOS"))return 3;
 memset(rom+0x47c,0,15);if(check("JiffyDOS"))return 4;
 rom[0x4ee]=0x52;if(check(0))return 5; /* PiffyDOS marker is not JiffyDOS. */
 memset(rom,0,sizeof(rom));
 memcpy(rom+0x1c00,dolphin,8);memcpy(rom+0x49b,"DOLPHINDOS 2.0 ",15);
 if(check("DolphinDOS 2.0"))return 6;
 rom[0x4a6]='9';if(check("DolphinDOS"))return 7;
 memcpy(rom+0x49b,"SILVER DREAM !",14);if(check("DolphinDOS"))return 8;
 rom[0x1c04]^=1;if(check(0))return 9; /* Near-match is insufficient. */
 memset(rom,0,sizeof(rom));
 memcpy(rom+0x49b,"DOLPHINDOS ?.??",14);if(check("DolphinDOS"))return 10;
 return 0;
}
`;
fs.writeFileSync('build/test-kernal-models.c',harness);
require('./simulator')('build/test-kernal-models.c');
console.log('PASS stock KERNALs, JiffyDOS 6.01, DolphinDOS 2.0, unknown versions, customized banners and near-match rejection');
