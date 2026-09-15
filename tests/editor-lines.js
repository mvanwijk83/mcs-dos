// Exercise the production row-insertion branch without patching a VICE ROM.
const {tool}=require('./setup');
const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync('src/mcsdos.c','utf8').replace(/\r\n/g,'\n');
const start=source.indexOf('} else if (c == 0) {'),end=source.indexOf('} else if (c == CH_DEL)',start);
assert(start>=0&&end>start,'editor row-insertion branch must exist');
const branch=source.slice(start+'} else if (c == 0) {'.length,end);
const code=`#include <string.h>
static char editbuf[960],before[960];
static unsigned char x,y,r,renders;
static unsigned int idx;
static void renderedit(void){++renders;}
static void insert(void){${branch}}
static int row(int n,char value){int i;for(i=0;i<40;i++)if(editbuf[n*40+i]!=value)return 0;return 1;}
int main(void){
 memset(editbuf,' ',sizeof(editbuf));
 memset(editbuf,'A',40);memset(editbuf+40,'B',40);memset(editbuf+80,'C',40);
 y=1;x=23;insert();
 if(x||renders!=1||!row(0,'A')||!row(1,' ')||!row(2,'B')||!row(3,'C'))return 1;
 y=0;x=7;insert();
 if(x||renders!=2||!row(0,' ')||!row(1,'A')||!row(2,' ')||!row(3,'B')||!row(4,'C'))return 2;
 y=23;x=39;insert();if(x||renders!=3||!row(23,' '))return 3;
 editbuf[959]='Z';memcpy(before,editbuf,sizeof(editbuf));
 y=0;x=11;insert();if(memcmp(before,editbuf,sizeof(editbuf))||x!=11||renders!=3)return 4;
 y=23;insert();if(memcmp(before,editbuf,sizeof(editbuf))||x!=11||renders!=3)return 5;
 return 0;
}`;
fs.writeFileSync('build/test-editor-lines.c',code);
require('./simulator')('build/test-editor-lines.c');

console.log('PASS editor insertion at top/middle/bottom, cursor reset and refusal to lose bottom-row text');
