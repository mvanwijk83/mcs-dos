// Build the SEQ help resource in exactly the shell's command-ID order.
const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync('src/core.c','utf8');
const commands=[...source.match(/const char \*\s*const commands\[\]\s*=\s*\{([\s\S]*?)\};/)[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);
const help=JSON.parse(fs.readFileSync('src/command-help.json','utf8'));
assert.deepEqual(Object.keys(help).sort(),[...commands].sort(),'Each shell command needs exactly one help topic');
assert(commands.length<256);
const petscii=s=>Buffer.from([...s].map(c=>{
 const n=c.charCodeAt(0);assert(n===10 || n>=32&&n<=126,'Help must contain printable ASCII or newlines');
 return n===124?0xdd:n===92?0xa0:n>=97&&n<=122?n-32:n>=65&&n<=90?n+128:n;
}));
const parts=[Buffer.from([77,67,72,1,commands.length])];
for(const name of commands){assert.equal(typeof help[name],'string');assert(help[name].length);parts.push(petscii(help[name]),Buffer.from([0]));}
fs.writeFileSync('build/COMMANDS.HLP',Buffer.concat(parts));
// Internal cartridge resource: offsets select a topic without scanning others.
fs.mkdirSync('build/easyflash',{recursive:true});
const texts=commands.map(name=>Buffer.concat([petscii(help[name]),Buffer.from([0])]));
const offsets=Buffer.alloc((commands.length+1)*2);let offset=offsets.length;
texts.forEach((text,i)=>{offsets.writeUInt16LE(offset,i*2);offset+=text.length;});
offsets.writeUInt16LE(offset,commands.length*2);
assert(offset<=8192,'Help resource exceeds bank 10 ROML');
fs.writeFileSync('build/easyflash/help.bin',Buffer.concat([offsets,...texts]));
fs.writeFileSync('build/easyflash/helpmeta.h','#define HELP_TOPICS '+commands.length+'\n');
