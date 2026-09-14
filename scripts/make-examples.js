const fs=require('fs');
const petscii=require('./petscii');
const version=fs.readFileSync('src/mcsdos.c','utf8').match(/^#define VERSION "([^"]+)"/m)[1];
fs.writeFileSync('build/README',petscii(fs.readFileSync('examples/README.txt','utf8').replaceAll('@VERSION@',version)));
// Ship the 40-column documents as PETSCII sequential files.
for(const name of ['MANUAL.TXT','LICENSE.TXT']) fs.writeFileSync('build/'+name,petscii(fs.readFileSync(name.toLowerCase(),'utf8')));
// 10 PRINT "HELLO FROM BASIC!":20 END (tokenized BASIC V2).
const text=Buffer.from('HELLO FROM BASIC!');
const body=Buffer.concat([Buffer.from([10,0,0x99,0x20,0x22]),text,Buffer.from([0x22,0])]);
const next=0x0801+2+body.length;
const program=Buffer.concat([Buffer.from([1,8,next&255,next>>8]),body,Buffer.from([next+6&255,(next+6)>>8,20,0,0x80,0,0,0])]);
fs.writeFileSync('build/DEMO.prg',program);
