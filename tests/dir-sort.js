const {tool} = require('./setup');
const fs=require('fs'),{execFileSync}=require('child_process'),assert=require('assert/strict');
const s=fs.readFileSync('src/mcsdos.c','utf8').replace(/\r\n/g, '\n');
const options=s.slice(s.indexOf('static unsigned char diroption('),s.indexOf('/* A 12-character stem'));
const edit=s.slice(s.indexOf('static void editnumber('),s.indexOf('static unsigned char yesno('));
const compare=s.slice(s.indexOf('static int dircompare('),s.indexOf('static void dircmd('));
const sort=s.slice(s.indexOf("for (i = 0; i < count; ++i)\n        order[i] = i;"),s.indexOf("pagelines = 5;",s.indexOf('static void dircmd(')));
const fixtures=[['zboot',3,99],['beta',1,3],['alpha',1,3],['delta',0,65535],['gamma',2,0],['epsilon',4,256]];
let checks='',n=0;
for(const mode of ['N','T','S'])for(const reverse of [false,true])for(const first of [false,true]){
 const sw='/O'+(reverse?'-':'')+mode+(first?'F':'');
 const indices=fixtures.map((_,i)=>i);const head=first?indices.shift():null;
 indices.sort((a,b)=>{let r=mode==='T'?fixtures[a][1]-fixtures[b][1]:mode==='S'?fixtures[a][2]-fixtures[b][2]:0;return (r||fixtures[a][0].localeCompare(fixtures[b][0]))*(reverse?-1:1)});if(first)indices.unshift(head);
 checks+=`flags=0;if(!dirdefaults("/B${sw}/L/W",&flags))return ${++n};sort=flags&4;${sort}\n`;
 for(let i=0;i<indices.length;i++)checks+=`if(order[${i}]!=${indices[i]})return ${++n};\n`;
}
for(const sw of ['/OX','/O-','/O-NFF','/ONX','/OSN','/O--S'])checks+=`flags=0;if(diroption("${sw}",&flags))return ${++n};\n`;
checks+='flags=0;if(!diroption("/O",&flags)||flags!=4)return 120; if(!dirdefaults("/O-SF/ON",&flags)||flags!=4)return 121;';
checks+='for(i=1;i<=40;++i){editnumber(0,i);if(cells[0]!=176+i/10 || cells[1]!=176+i%10)return 122;}';
const code=`#include <string.h>\n#include <ctype.h>\n#define stricmp strcasecmp\nstruct Entry {char *name;unsigned char type;unsigned int blocks;};\nstatic struct Entry files[]={${fixtures.map(f=>`{"${f[0]}",${f[1]},${f[2]}}`).join(',')}};\nstatic char *typename(unsigned char t){static char *names[]={"DEL","PRG","REL","SEQ","USR"};return names[t];}\nstatic unsigned char cells[2];\n#define POKE(a,v) cells[a]=(v)\n${edit}\n${options}\n${compare}\nint main(void){unsigned int i,j,tmp,order[6],count=6;unsigned char flags,sort;${checks}return 0;}\n`;
fs.writeFileSync('build/test-dir-sort.c',code);execFileSync(tool('cc65', 'cl65'),['-t','sim6502','-O','-o','build/test-dir-sort','build/test-dir-sort.c'],{stdio:'pipe'});execFileSync(tool('cc65', 'sim65'),['build/test-dir-sort'],{stdio:'inherit'});
console.log('PASS all 12 sort modes, type/size ties, unsigned sizes, first entry, DIRCMD, invalid options');
