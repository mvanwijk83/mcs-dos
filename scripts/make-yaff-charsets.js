// Convert vendored 8x8 YAFF sources to the shell's MCPI v1 patches.
// This intentionally supports their bitmap/label subset, not arbitrary YAFF.
const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const sources=[
 ['AMIGA','amiga-ks10-topaz-08.yaff','61b3fcbe1fdf99cacd2463d54f2b4d189370073e68da0d5bd61571cd83c4244d'],
 ['ATARIST','atari-st-8x8.yaff','a4f86d6d1178551d080c92caf6cedf3e01e39ad17761dab0653d8ea7c675fa83'],
 // Commodore sources use ROM screen indices, not ASCII/PETSCII byte values.
 // The PET mixed-case bank starts at $80 (no stored inverse bank).
 ['PET','pet.yaff','499be09a3802034a994c942e08f7f37ba15fe890b28cd7846b47d06ef0039d33',0x80,0x9c],
 ['ZXSPECTRUM','zx-spectrum.yaff','82c3a1671292ec677d73638a55c5c7c81cc493bf65d68d6b544907b0fb0d9b42']
];
const asciiMapping=new Map([[0,64],[27,91],[29,93],[96,92]]);
for(let i=1;i<=26;i++)asciiMapping.set(i,i+96);
for(let i=32;i<=63;i++)asciiMapping.set(i,i);
for(let i=65;i<=90;i++)asciiMapping.set(i,i);
for(const [name,file,hash,bank,backslash] of sources){
 const mapping=bank===undefined?asciiMapping:
  new Map([...asciiMapping.keys()].map(code=>[code,code===96?backslash:bank+code]));
 const raw=fs.readFileSync('assets/fonts/'+file),glyphs=new Map();
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),hash,file+' source changed');
 for(const block of raw.toString('utf8').split(/\r?\n\s*\r?\n/)){
  const labels=[...block.matchAll(/^0x([\da-f]+):\s*$/gim)].map(m=>parseInt(m[1],16));
  if(!labels.some(c=>[...mapping.values()].includes(c)))continue;
  const rows=[...block.matchAll(/^\s+([.@]+)\s*$/gm)].map(m=>m[1]);
  assert.equal(rows.length,8,file+' glyph '+labels[0]+' height');
  const bitmap=rows.map(row=>{
   assert.equal(row.length,8,file+' glyph width');
   return [...row].reduce((value,pixel)=>(value<<1)|(pixel==='@'?1:0),0);
  });
  for(const label of labels){assert(!glyphs.has(label),'duplicate glyph');glyphs.set(label,bitmap)}
 }
 const bytes=[77,67,80,73,1,mapping.size];let sum=0;
 for(const [screen,source] of [...mapping].sort((a,b)=>a[0]-b[0])){
  assert(glyphs.has(source),file+' missing glyph '+source);
  const record=[screen,...glyphs.get(source)];bytes.push(...record);
  sum=record.reduce((total,byte)=>total+byte,sum);
 }
 bytes.push(sum&255,(sum>>8)&255);
 fs.writeFileSync('build/'+name+'.CPI',Buffer.from(bytes));
 console.log(name+'.CPI: '+mapping.size+' glyphs, '+bytes.length+' bytes');
}
