// Exercise production expansion and prompt rendering on the 6502 simulator.
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const source=fs.readFileSync('src/mcsdos.c','utf8');
const expansion=source.slice(source.indexOf('static void showprompt('),source.indexOf('static unsigned char diroption('));
const harness=`
#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdarg.h>
#define VERSION "1.0"
static char prompttext[33],output[1024];
static unsigned char drive,aborted,dos;
static int used,helpid;
static void outc(unsigned char c) { output[used++]=c; output[used]=0; }
static void outs(const char *s) { while(*s) outc(*s++); }
static void print(const char *fmt,...) { char b[16];va_list a;va_start(a,fmt);vsprintf(b,fmt,a);va_end(a);outs(b); }
static const char *drivename(unsigned char d) { static char b[4];if(dos){b[0]='A'+d-8;b[1]=0;}else sprintf(b,"%u",d);return b; }
static void help(int id) { helpid=id; }
${expansion}

static int check(char *cmd,char *expected) { strcpy(prompttext,cmd);used=0;showprompt();return strcmp(output,expected); }
int main(void) {
 drive=8;
 if(check("$p$c$g","8:>"))return 1;
 if(check("$d$c$g $n $p $q$s$v$$","A:> 8 8 = 1.0$"))return 2;
 dos=1;drive=30;used=0;showprompt();if(strcmp(output,"W:> 30 W = 1.0$"))return 3;
 if(check("$D$C$G $N $P $Q$S$V$$","W:> 30 W = 1.0$"))return 4;
 if(check("$b$H$r","\\xdd\\xa0\\r"))return 5;
 if(check("$x$Z$ $/ $$$x $$d","$x$Z$ $/ $$x $d"))return 6;
 if(check("$p$c$g","W:>"))return 9;
 if(check("  ","  "))return 10;
 drive=0;if(check("$d$c$g$n",":>0"))return 11;
 return 0;
}
`;
fs.writeFileSync('build/test-prompt.c',harness);
execFileSync('tools/cc65/bin/cl65.exe',['-t','sim6502','-O','-o','build/test-prompt','build/test-prompt.c'],{stdio:'pipe'});
execFileSync('tools/cc65/bin/sim65.exe',['build/test-prompt'],{stdio:'pipe'});
const help=JSON.parse(fs.readFileSync('src/command-help.json'));
assert(!help.PROMPT && !help.COLOR);
console.log('PASS prompt codes, case, graphics bytes, dynamic drives, literals, defaults, removed command help and no-device rendering');
