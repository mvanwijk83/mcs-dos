// Assemble the launch trampoline and translate the shared assembly services.
// Never read or rewrite the shell C source.
const fs = require('fs');
const {tool} = require('./toolchain');
const out = 'build/oscar64';
fs.mkdirSync(out, {recursive:true});
let c = '/* Generated C64 assembly services. Do not edit. */\n';
function asm(s) {
  return s.replace(/;[^\r\n]*/g, '').replace(/@/g, 'local_')
    .replace(/\$([0-9a-f]+)/gi, '0x$1');
}
let reu = fs.readFileSync('src/reu.s','utf8').split('_reu_size:')[1];
reu = reu.replace('beq :+', 'beq present55').replace('\n:', '\npresent55:')
         .replace('beq :+', 'beq presentaa').replace('\n:', '\npresentaa:');
c += '\n#pragma optimize(noasm)\nstatic char saved[10], original[256], value;\nstatic unsigned int size;\n';
c += '__asm reu_probe {\n' + asm(reu) + '\n}\n';
c += 'unsigned int reu_size(void) { return __asm { jsr reu_probe\n sta accu\n stx accu+1\n }; }\n';
// Expand assembly repetitions and scoped labels for Oscar64's inline assembler.
let charset=fs.readFileSync('src/charset.s','utf8').split('_charset_prepare:')[1];
charset=charset.replace(/\.repeat (\d+), page\s*([\s\S]*?)\.endrepeat/g,(_,n,body)=>
 Array.from({length:Number(n)},(_,i)=>body.replaceAll('page',String(i))
  .replace(/\$([0-9a-f]+)\+(\d+)\*\$100/gi,(_,base,page)=>'$'+(parseInt(base,16)+Number(page)*256).toString(16))
  .replace(/^:\s*$/m,'local_page'+i+':').replace('bne :-','bne local_page'+i)).join('\n'));
c += '__asm charset_nmi { rti }\n';
const pieces=('prepare:\n'+charset).split(/_charset_/);
for(const piece of pieces){
 const split=piece.indexOf(':'),name=piece.slice(0,split),body=piece.slice(split+1);
 c += '__asm cs_'+name+' {\n'+asm(body.replaceAll('ram_nmi','charset_nmi'))+'\n}\n';
 c += 'void charset_'+name+'(void) { __asm { jsr cs_'+name+' } }\n';
}
const {execFileSync}=require('child_process');
execFileSync(tool('oscar64', 'oscar64'), ['-n', '-O0', '-rt=', '-tf=bin',
  '-o='+out+'/launch.bin', 'src/launch.c'], {stdio:'inherit'});
// The separate address table exposes assembler labels without parsing listings.
const image=fs.readFileSync(out+'/launch.bin');
const base=0x0334, table=0x0400-base;
if(image.length!==table+16) throw Error('Invalid launch address table');
const end=image.readUInt16LE(table);
if(end<=base || end>=0x03e0) throw Error('Loader overlaps filename');
const bytes=image.subarray(0,end-base);
const labels=Object.fromEntries(['len','dev','absolute','secondary','addresslo','addresshi','jump']
  .map((name,i)=>[name,image.readUInt16LE(table+2+i*2)]));
for(const [name,address] of Object.entries(labels)) {
  const opcode={len:0xa9,dev:0xa2,absolute:0xa9,secondary:0xa0,addresslo:0xa2,addresshi:0xa0,jump:0x4c}[name];
  if(address<base || address+(name==='jump'?2:1)>=end || bytes[address-base]!==opcode)
    throw Error('Invalid loader patch: '+name);
}
fs.writeFileSync(out+'/loader.bin',bytes);
c += 'static const unsigned char loader_bytes[]={'+[...bytes].join(',')+'};\n';
c += '__asm display_reset { jsr cs_default\n lda #0\n sta 0x0291\n lda 0xd015\n and #0xfe\n sta 0xd015\n lda #0x8e\n jsr 0xffd2\n lda #0x93\n jsr 0xffd2\n rts\n}\n';
c += 'void launch(void) { __asm { jsr display_reset\n sei }\n memcpy((void*)0x0334,loader_bytes,sizeof(loader_bytes));\n memcpy((void*)0x03e0,launchname,17);\n';
for(const [label,value] of Object.entries({len:'launchlength',dev:'launchdevice',absolute:'launchabsolute',secondary:'launchabsolute^1',addresslo:'launchaddress',addresshi:'launchaddress>>8',jump:'launchaddress'}))
  c += `POKE(${labels[label]+1},${value});\n`;
c += `POKE(${labels.jump+2},launchaddress>>8);\n __asm { jmp 0x0334 } }\n`;
// Return through main and CRT: its normal epilogue also restores BASIC's
// temporary-string pointer ($16), which Oscar64's exit(0) skips.
c += 'void basic_exit(void) { __asm { jsr 0xffcc\n jsr 0xffe7\n jsr display_reset\n lda #0x37\n sta 1 } }\n';
fs.writeFileSync(out+'/hardware.h',c);
