// FAT names are ASCII bytes even when the cartridge is compiled for PETSCII.
require('./setup');
const fs=require('fs'),{functions}=require('./source'),simulate=require('./simulator');
const extensions=['d64','d71','d81','dnp','g64','g71','dhd','d41'];
const fixtures=extensions.flatMap((ext,i)=>[ext,ext.toUpperCase(),ext[0].toUpperCase()+ext.slice(1)]
    .map(s=>({name:'Very long image.'+s,kind:i+1})));
fixtures.push(...['image.d6','image.d640','image.seq','image.tap','image.d_4','image']
    .map(name=>({name,kind:0})));
const bytes=s=>[...Buffer.from(s,'ascii'),0].join(',');
fs.writeFileSync('build/test-image-names.c',`
#include <stdio.h>
#include <string.h>
static unsigned char softiec_files=1;
${functions('imagekind','imageformat','softiec_hex','softiec_matches')}
${fixtures.map((f,i)=>`static const char native${i}[]={${bytes(f.name)}};`).join('\n')}
static const char dual[]={${bytes('dual sid test.d64')}};
int main(void){
    if(!softiec_matches((const unsigned char *)dual,strlen(dual),"DUAL SID TEST.D6"))return 1;
    if(imagekind(dual)!=1)return 2;
    ${fixtures.map((f,i)=>`if(imagekind(native${i})!=${f.kind})return ${i+3};`).join('\n')}
    if(imagekind("IMAGE.D64")!=1||imagekind("image.dnp")!=4)return 40;
    puts("PASS ASCII native and PETSCII shell image extensions");return 0;
}
`);
simulate('build/test-image-names.c',{mount:true});
simulate('build/test-image-names.c',{mount:true,petscii:true});
