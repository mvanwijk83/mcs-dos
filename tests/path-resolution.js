// Actual normalization and CMD canonicalization, independent of IEC transport.
require('./setup');
const fs = require('fs');
const {functions} = require('./source');
const paths = [
    ['file', 8, 'base', 'file'],
    ['sub\\file', 8, 'base\\sub', 'file'],
    ['\\sub\\file', 8, 'sub', 'file'],
    ['..\\file', 8, '', 'file'],
    ['.\\file', 8, 'base', 'file'],
    ['sub\\..\\file', 8, 'base', 'file'],
    ['A:', 8, 'base', ''],
    ['A:\\', 8, '', ''],
    ['9:\\work\\docs\\file', 9, '@13\\docs', 'file'],
    ['B:\\@13\\docs\\file', 9, '@13\\docs', 'file'],
    ['0:file', 0, '', 'file']
];
let checks = '';
paths.forEach(([input, dev, dir, name], i) => {
    checks += `if(!path(${JSON.stringify(input)},&p)||p.dev!=${dev}||strcmp(p.dir,${JSON.stringify(dir)})||strcmp(p.name,${JSON.stringify(name)}))return ${i + 1};\n`;
});
const code = `
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include "../src/storage.h"
#define PATHSIZE 128
#define host_partfind(d,n,p) 0
typedef struct Path {unsigned char dev;char name[17];char dir[128];} Path;
static unsigned char drive=8, errors, hostpaths;
static char working[24][128], component[17];
static void error(const char *s) {++errors;}
static unsigned char modelof(unsigned char d) {return hostpaths?DRIVE_SOFTIEC:d==9?DRIVE_CMD_HD:DRIVE_1581;}
unsigned char location_index(unsigned char d) {return d?d-7:0;}
unsigned char partition_lookup(unsigned char d,const char *s,PartitionInfo *p) {
    if(strcmp(s,"work")&&strcmp(s,"@13"))return 0;
    p->number=13;p->type=1;return 1;
}
${functions('appendpart', 'canonical', 'path', 'path_join', 'sameplace').replaceAll('static static ', 'static ')}
int main(void) {
    Path p, other;
    char text[128];unsigned char i;
    strcpy(working[1],"base");
    ${checks}
    if(path("abcdefghijklmnopqrstuvwxyz",&p)||path("file,name",&p)||path("31:file",&p))return 30;
    if(path("sub*\\\\file",&p))return 31;
    working[1][0]=0;
    text[0]=0;
    for(i=0;i<7;++i){if(i)strcat(text,"\\\\");strcat(text,"abcdefghijklmnop");}
    strcat(text,"\\\\1234567");
    if(!path(text,&p))return 32;
    strcat(text,"8");
    if(path(text,&p))return 33;
    if(!path("9:\\\\work\\\\docs\\\\file",&p)||!path("9:\\\\@13\\\\docs\\\\file",&other)||!sameplace(&p,&other))return 34;
    hostpaths=1;
    if(path("bad/name",&p)||path("bad/name\\\\file",&p)||!path("good\\\\file",&p))return 35;
    return 0;
}
`;
fs.writeFileSync('build/test-path-resolution.c', code);
require('./simulator')('build/test-path-resolution.c');
console.log('PASS DOS path normalization, device working directories, CMD aliases and 127-character limits');
