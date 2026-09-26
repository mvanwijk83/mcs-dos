require('./setup');
const fs=require('fs'),{crc}=require('./easyflash-image');
const source=fs.readFileSync('src/easyflash/journal.h','utf8');
const implementation=source.slice(source.indexOf('static const unsigned int crc_table'),source.indexOf('static unsigned char get'));
const fixtures=[Buffer.from('123456789'),Buffer.from(Array.from({length:256},(_,i)=>i)),Buffer.alloc(1024,255),fs.readFileSync('build/MANUAL.TXT')];
let declarations='',checks='';
fixtures.forEach((b,i)=>{declarations+='static const unsigned char data'+i+'[]={'+[...b].join(',')+'};\n';checks+='c=65535;for(i=0;i<sizeof(data'+i+');++i)c=crcbyte(c,data'+i+'[i]);if(c!='+crc(b)+')return '+(i+1)+';\n';});
fs.writeFileSync('build/test-journal-crc.c',implementation+declarations+'int main(void){unsigned int c,i;'+checks+'return 0;}');
require('./simulator')('build/test-journal-crc.c');console.log('PASS production CRC against independent reference vectors');
