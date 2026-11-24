// Exercise the shared row formatter with real locale formatting on the 6502.
require('./setup');
const fs = require('fs');
const {functions} = require('./source');
fs.writeFileSync('build/test-compact-directory.c', `
#include <stdio.h>
#include <string.h>
#include <stdarg.h>
#include "../src/datetime.h"
#define CBM_T_DEL 0
#define CBM_T_OTHER 4
#define CBM_T_SEQ 16
#define CBM_T_PRG 17
#define CBM_T_USR 18
#define CBM_T_REL 19
#define CBM_T_DIR 20
#define CBM_T_CBM 21
LocaleFormat locale={1,'.',',','-',':',0};
unsigned char dir_dates=2,redirected,ox,outputcol;
static unsigned int used;
static char output[160];
static void newline(void){output[used++]='\\n';output[used]=0;ox=outputcol=0;}
static void print(const char *fmt,...){
    char text[160],*p=text;va_list a;va_start(a,fmt);vsnprintf(text,sizeof(text),fmt,a);va_end(a);
    while(*p){output[used++]=*p++;output[used]=0;if(redirected)outputcol=1;else if(++ox==40)newline();}
}
static const char *imageformat(unsigned char k){return "DNP";}
${functions('typename','two','date_format','time_format','compact_size','timestamp_entry','timestamp_print')}
static void row(const char *name,unsigned char type,unsigned char kind,unsigned long bytes,unsigned char known,DateTime *dt){
    used=ox=outputcol=0;output[0]=0;
    timestamp_entry(name,type,kind,bytes,known);timestamp_print(dt);
    if(redirected?outputcol:ox)newline();
}
int main(void){
    DateTime dt={2026,11,24,1,41,0};char amount[6],date[11];unsigned char pass,order;
    for(pass=0;pass<2;++pass){
        redirected=pass;locale.order=1;locale.hours=0;locale.datesep='-';dir_dates=2;
        row("GAMES",CBM_T_DIR,0,0,1,&dt);
        if(strcmp(output,"${'GAMES'.padEnd(17)}<DIR>   24-11-26 01:41a\\n"))return 1;
        dt.day=23;dt.hour=12;dt.minute=34;
        row("FILE",CBM_T_PRG,0,16384,1,&dt);
        if(strcmp(output,"${'FILE'.padEnd(17)}P 16384 23-11-26 12:34p\\n"))return 2;
        dt.year=1980;dt.month=dt.day=1;dt.hour=12;dt.minute=1;
        row("MY16CHARFILENAME",CBM_T_SEQ,0,174080,1,&dt);
        if(strcmp(output,"MY16CHARFILENAME S  170K 01-01-80 12:01p\\n"))return 3;
        dt.year=2023;dt.month=12;dt.hour=1;dt.minute=45;
        row("CMDDISK.DNP",CBM_T_PRG,4,16777216UL,1,&dt);
        if(strcmp(output,"${'CMDDISK.DNP'.padEnd(17)}I   16M 01-12-23 01:45a\\n"))return 4;
        dt.year=2026;dt.month=11;dt.day=24;dt.hour=13;dt.minute=41;locale.hours=1;
        for(order=0;order<3;++order){
            locale.order=order;locale.datesep='.';
            row("FILE",CBM_T_PRG,0,1,1,&dt);
            if(strlen(output)!=41||output[40]!='\\n')return 5;
            if(strncmp(output+25,order==0?"11.24.26":order==1?"24.11.26":"26.11.24",8))return 6;
            if(strcmp(output+34," 13:41\\n"))return 7;
            date_format(&dt,date);if(strlen(date)!=10||!strstr(date,"2026"))return 8;
        }
        dir_dates=1;locale.order=1;locale.datesep='-';locale.hours=0;
        row("GAMES",CBM_T_DIR,0,0,1,&dt);
        if(strcmp(output,"${'GAMES'.padEnd(17)}<DIR> 24-11-2026 01:41p\\n"))return 9;
        dir_dates=2;dt.year=0;
        row("FILE",CBM_T_PRG,0,16384,1,&dt);
        if(strcmp(output,"${'FILE'.padEnd(17)}P 16384\\n"))return 10;
        row("UNKNOWN",CBM_T_PRG,0,4294967295UL,2,&dt);
        if(strcmp(output,"${'UNKNOWN'.padEnd(17)}P   ???\\n"))return 11;
        dt.year=2026;dt.month=11;dt.day=24;dt.hour=1;dt.minute=41;
    }
    compact_size(0,1,amount);if(strcmp(amount,"0"))return 12;
    compact_size(99999UL,1,amount);if(strcmp(amount,"99999"))return 13;
    compact_size(100000UL,1,amount);if(strcmp(amount,"98K"))return 14;
    compact_size(10239487UL,1,amount);if(strcmp(amount,"9999K"))return 15;
    compact_size(10239488UL,1,amount);if(strcmp(amount,"10M"))return 16;
    compact_size(4294967295UL,1,amount);if(strcmp(amount,"4096M"))return 17;
    return 0;
}
`);
require('./simulator')('build/test-compact-directory.c', {regional:true,mount:true});
console.log('PASS compact 40-column rows, locale order/year truncation, full timestamps, missing stamps and binary size boundaries');
