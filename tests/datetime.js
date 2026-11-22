// Execute production calendar, locale reader and staged clock command logic on 6502.
require('./setup');
const fs = require('fs'), assert = require('assert/strict');
const {functions} = require('./source');
const simulate = require('./simulator');
const extract = (...names) => functions(...names).replace(/^static /gm, '').replace(/\bstatic static /g, 'static ');
const base = `
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../src/datetime.h"
LocaleFormat locale={2,0,'.','-',':',1};
char locale_code[7]="INT";
unsigned char dir_dates,clockkind,clockdevice;
${extract('ascii_upper','leap','datetime_valid','digits','date_parse','time_parse','two','date_format','time_format','cmd_datetime','date_weekday')}
`;
fs.writeFileSync('build/test-datetime.c', base + `
int main(void) {
    DateTime d={2000,1,1,0,0,0}; char text[16];
    if(!date_parse("2000-02-29",&d)||date_parse("1900-02-29",&d))return 1;
    if(date_parse("2100-02-29",&d)||date_parse("2026-04-31",&d))return 2;
    if(date_parse("2026-00-01",&d)||date_parse("2026-01-00",&d))return 3;
    if(date_parse("2156-01-01",&d)||date_parse("2026-1-01",&d))return 4;
    if(!date_parse("2026-11-21",&d)||date_weekday(&d)!=6)return 5;
    date_format(&d,text);if(strcmp(text,"2026-11-21"))return 6;
    locale.order=0;locale.datesep='/';date_format(&d,text);
    if(strcmp(text,"11/21/2026")||!date_parse(text,&d))return 7;
    locale.order=1;locale.datesep='.';date_format(&d,text);
    if(strcmp(text,"21.11.2026")||!date_parse(text,&d))return 8;
    if(!time_parse("23:59:59",&d)||d.second!=59||time_parse("24:00",&d))return 9;
    if(!time_parse("00:00",&d)||d.second||time_parse("00:60",&d))return 10;
    locale.hours=0;
    if(!time_parse("12:00a",&d)||d.hour||!time_parse("12:00p",&d)||d.hour!=12)return 11;
    if(!time_parse("03:18:27p",&d)||d.hour!=15||d.second!=27)return 12;
    time_format(&d,text);if(strcmp(text,"03:18p"))return 13;
    if(time_parse("00:00a",&d)||time_parse("13:00p",&d)||time_parse("03:18",&d))return 14;
    locale.hours=1;locale.timesep='.';
    if(!time_parse("15.18",&d)||d.hour!=15||d.second||time_parse("15:18",&d))return 15;
    if(!cmd_datetime("01/01/80 12:00:00 AM",&d,1)||d.year!=1980||d.hour)return 16;
    if(!cmd_datetime("12/31/79 11:59:59 PM",&d,1)||d.year!=2079||d.hour!=23)return 17;
    if(!cmd_datetime("11/21/26 03.18 PM",&d,0)||d.hour!=15)return 18;
    if(cmd_datetime("02/29/26 03.18 PM",&d,0))return 19;
    if(!cmd_datetime("11/21/26   00.18 AM",&d,0)||d.hour||d.minute!=18)return 20;
    return 0;
}
`);
simulate('build/test-datetime.c', {regional: true});
fs.writeFileSync('build/test-locale-file.c', base + `
typedef struct Path {unsigned char dev;char name[17],dir[128];} Path;
static unsigned char data[64],missing,failed;static unsigned int at,length;
static unsigned char path(const char *s,Path *p){p->dev=8;strcpy(p->name,"country.sys");p->dir[0]=0;return 1;}
static void filename(const char *s,char *out){strcpy(out,s);}
static unsigned char location_file(unsigned char d,const char *p){return 1;}
static unsigned char diskstatus(unsigned char d,unsigned char report){return 0;}
static unsigned char channel_open(unsigned char f,unsigned char d,unsigned char sa,const char *s){at=0;return missing;}
static void channel_close(unsigned char f){}
static int channel_read(unsigned char f,void *p,unsigned int n){if(failed)return -1;if(at+n>length)n=length-at;memcpy(p,data+at,n);at+=n;return n;}
${extract('international_locale','locale_id','locale_load')}
int main(void){
    static const unsigned char good[]={77,67,78,1,13,0,2,0,78,76,0,0,0,0,0,1,46,44,45,58,1,78,76,0,0,0,0,0,0,44,46,47,58,0};
    memcpy(data,good,sizeof(good));length=sizeof(good);
    if(locale_load("nl",0)||locale.order!=1||locale.thousands!='.'||locale.hours!=1)return 1;
    if(locale_load("ZZ",0)!=3||locale.order!=2||locale.thousands)return 2;
    data[20]=3;if(locale_load("NL",0)!=2||locale.order!=2)return 3;
    data[20]=1;length=20;if(locale_load("NL",0)!=2)return 4;
    length=sizeof(good);missing=1;if(locale_load("NL",0)!=1)return 5;
    missing=0;failed=1;if(locale_load("NL",0)!=2)return 6;
    failed=0;data[3]=99;if(locale_load("NL",0)!=2)return 7;
    data[3]=1;if(locale_load("CA-FR",0)!=3)return 8;
    data[6]=3;memset(data+34,0,13);memcpy(data+34,"INT",3);
    data[41]=2;data[43]='.';data[44]='-';data[45]=':';data[46]=1;length=47;
    if(locale_load("INT",0)||locale.order!=2||locale.thousands||locale.hours!=1)return 9;
    if(locale_load("int",0)||stricmp(locale_code,"INT"))return 10;
    if(locale_load("ISO",0)!=3||stricmp(locale_code,"INT"))return 11;
    return 0;
}
`);
simulate('build/test-locale-file.c', {regional: true});
fs.writeFileSync('build/test-clock-command.c', base + `
#define RTC_NONE 0
#define RTC_OK 1
#define RTC_UNSET 2
#define RTC_ERROR 3
#define RTC_DENIED 4
#define RTC_ULTIMATE 255
typedef struct Path {unsigned char dev;char name[17],dir[128];} Path;
static unsigned char pendingparts,pendingdevice,state=RTC_UNSET,reads,writes,cancel,writeResult=RTC_OK;
static unsigned char selected_device=8,prompted;
static DateTime pending,devicevalue={2026,11,21,15,18,42};
static char message[128],transcript[512];static const char *typed="";
static unsigned char path(const char *s,Path *p){p->dev=atoi(s);p->name[0]=0;return 1;}
static unsigned char clock_read(unsigned char d,DateTime *v){++reads;*v=devicevalue;return state;}
static unsigned char clock_select(unsigned char e,unsigned char *d,DateTime *v){if(!e)*d=selected_device;else if(*d==11)*d=RTC_ULTIMATE;return clock_read(*d,v);}
static unsigned char drivemodel(unsigned char d,unsigned char report){return d==9?DRIVE_CMD_HD:DRIVE_SD2IEC;}
static unsigned char clock_write(unsigned char d,const DateTime *v){++writes;if(writeResult==RTC_OK)devicevalue=*v;return writeResult;}
static void record(const char *s){if(strlen(transcript)+strlen(s)>=sizeof(transcript))transcript[0]=0;strcat(transcript,s);}
static void error(const char *s){strcpy(message,s);record(s);}
static void say(const char *s){strcpy(message,s);record(s);}
static void print(const char *s,...){va_list ap;va_start(ap,s);vsnprintf(message,sizeof(message),s,ap);va_end(ap);record(message);}
static void newline(void){}
static unsigned char input(char *s,unsigned int n,unsigned char mode){++prompted;strcpy(s,typed);return !cancel;}
${extract('clock_error','clock_device','clockcmd')}
int main(void){
    clockcmd(0,"2026-11-21");if(writes||pendingparts!=1||!strstr(message,"TIME"))return 1;
    clockcmd(1,"/T");if(writes||strcmp(message,"Clock device not set"))return 2;
    clockcmd(1,"15:18:27");if(writes!=1||pendingparts||devicevalue.second!=27)return 3;
    state=RTC_OK;clockcmd(0,"2028-02-29");if(writes!=2||devicevalue.hour!=15||devicevalue.second!=27)return 4;
    clockcmd(1,"01:02");if(writes!=3||devicevalue.year!=2028||devicevalue.day!=29||devicevalue.second)return 5;
    clockcmd(0,"2026-02-29");if(writes!=3||strcmp(message,"Invalid date"))return 6;
    state=RTC_UNSET;clockcmd(1,"8: 03:04");clockcmd(0,"9: 2026-11-21");
    if(writes!=3||pendingdevice!=9||pendingparts!=1)return 7;
    clockcmd(1,"9: 05:06");if(writes!=4||devicevalue.hour!=5)return 8;
    state=RTC_OK;typed="";clockcmd(0,"");if(writes!=4)return 9;
    state=RTC_ERROR;clockcmd(0,"/T");if(strcmp(message,"Clock device error"))return 10;
    state=RTC_NONE;clockcmd(0,"/T");if(strcmp(message,"No clock device"))return 11;
    state=RTC_UNSET;clockcmd(0,"2026-11-21");writeResult=RTC_ERROR;
    clockcmd(1,"03:04");if(writes!=5||pendingparts!=3||strcmp(message,"Clock device error"))return 12;
    writeResult=RTC_OK;clockcmd(1,"03:04");if(writes!=6||pendingparts)return 13;
    state=RTC_OK;writeResult=RTC_DENIED;clockcmd(1,"03:04");
    if(strcmp(message,"Cannot set date/time"))return 14;
    prompted=0;transcript[0]=0;selected_device=RTC_ULTIMATE;clockcmd(0,"/D");
    if(prompted!=1||!strstr(transcript,"Clock device: ULTIMATE")||
        !strstr(transcript,"The current date is:")||!strstr(transcript,"Enter the new date"))return 15;
    if(strstr(transcript,"Clock device:")>strstr(transcript,"The current date is:")||
        strstr(transcript,"The current date is:")>strstr(transcript,"Enter the new date"))return 31;
    devicevalue.year=2026;devicevalue.month=11;devicevalue.day=21;
    devicevalue.hour=22;devicevalue.minute=46;devicevalue.second=0;
    prompted=0;transcript[0]=0;clockcmd(1,"/D");
    if(prompted!=1||!strstr(transcript,"Clock device: ULTIMATE")||
        !strstr(transcript,"The current time is: 22:46")||!strstr(transcript,"Enter the new time"))return 30;
    if(strstr(transcript,"Clock device:")>strstr(transcript,"The current time is:")||
        strstr(transcript,"The current time is:")>strstr(transcript,"Enter the new time"))return 32;
    prompted=0;
    clockcmd(1,"/T /D");if(strcmp(message,"22:46 (ULTIMATE)"))return 16;
    clockcmd(0,"/D/T");if(strcmp(message,"2026-11-21 (ULTIMATE)")||prompted)return 17;
    selected_device=8;clockcmd(1,"/D /T");if(strcmp(message,"22:46 (SD2IEC)"))return 18;
    clockdevice=8;transcript[0]=0;clockcmd(0,"/D");if(!strstr(transcript,"Clock device: SD2IEC,8"))return 19;
    clockdevice=0;transcript[0]=0;clockcmd(0,"/D 9:");if(!strstr(transcript,"Clock device: CMDHD,9"))return 20;
    clockcmd(1,"11: /T /D");if(strcmp(message,"22:46 (ULTIMATE)"))return 21;
    state=RTC_UNSET;transcript[0]=0;clockcmd(0,"/D");
    if(!strstr(transcript,"Clock device: SD2IEC")||!strstr(transcript,"Clock device not set")||
        !strstr(transcript,"Enter the new date"))return 22;
    clockcmd(0,"/T /D");if(strcmp(message,"Clock device not set"))return 23;
    state=RTC_NONE;clockcmd(0,"/D");if(strcmp(message,"No clock device available"))return 24;
    clockcmd(1,"/D/T");if(strcmp(message,"No clock device available"))return 25;
    state=RTC_OK;writeResult=RTC_OK;locale.order=0;locale.datesep='/';
    clockcmd(0,"/D 8: 11/22/2026");if(devicevalue.day!=22||strcmp(message,"Clock device: SD2IEC,8"))return 26;
    clockcmd(1,"8: 03:04 /D");if(devicevalue.hour!=3||devicevalue.minute!=4)return 27;
    clockcmd(0,"/T /D 11/22/2026");if(strcmp(message,SYSOUT_INVALID_PARAM))return 28;
    clockcmd(0,"/D /BAD");if(strcmp(message,SYSOUT_INVALID_PARAM))return 29;
    return 0;
}
`);
simulate('build/test-clock-command.c', {regional: true});
fs.writeFileSync('build/test-timestamp.c', base + `
static unsigned char io[256],stream[256];static unsigned int at,length;
static struct {unsigned char dev;} p1={8};
static void line(const char *s){stream[length++]=1;stream[length++]=1;stream[length++]=1;stream[length++]=0;strcpy((char*)stream+length,s);length+=strlen(s)+1;}
static unsigned char channel_open(unsigned char f,unsigned char dev,unsigned char sa,const char *s){at=0;return strcmp(s,"$=t:ONE.PRG=l")!=0;}
static void channel_close(unsigned char f){}
static int channel_read(unsigned char f,void *p,unsigned int n){if(at+n>length)n=length-at;memcpy(p,stream+at,n);at+=n;return n;}
static unsigned char softiec_dos(unsigned char cmd,const char *a,const char *b,unsigned char *p,unsigned int capacity,unsigned int *length,unsigned char *more){*length=12;*more=0;return 1;}
${extract('timestamp_iec','timestamp_fat')}
int main(void){
    DateTime d;unsigned int date,time;
    stream[0]=1;stream[1]=4;length=2;line("\\\"SD2IEC\\\" IK 2A");
    line("\\\"ONE.PRG\\\" PRG 11/21/26   00.18 AM");
    if(!timestamp_iec("ONE.PRG",&d)||d.year!=2026||d.month!=11||d.day!=21||d.hour||d.minute!=18)return 1;
    length=2;line("\\\"SD2IEC\\\" IK 2A");line("\\\"ONE.PRG\\\" PRG");
    if(timestamp_iec("ONE.PRG",&d))return 2;
    memset(io,0,sizeof(io));if(timestamp_fat("ONE.PRG",&d))return 3;
    date=((2026-1980)<<9)|(11<<5)|21;time=(15<<11)|(18<<5)|14;
    io[4]=date;io[5]=date>>8;io[6]=time;io[7]=time>>8;
    if(!timestamp_fat("ONE.PRG",&d)||d.year!=2026||d.hour!=15||d.minute!=18||d.second!=28)return 4;
    return 0;
}
`);
simulate('build/test-timestamp.c', {regional: true});
require('child_process').execFileSync(process.execPath, ['scripts/make-country.js'], {stdio: 'inherit'});
const wire = fs.readFileSync('build/COUNTRY.SYS');
assert.equal(wire.length, 8 + wire.readUInt16LE(6) * 13);
const codes = Array.from({length: wire.readUInt16LE(6)}, (_, i) => wire.subarray(8 + i * 13, 15 + i * 13).toString('ascii').split('\0')[0]);
assert.equal(codes.length, 59);
assert(codes.includes('INT') && !codes.includes('ISO'));
assert(codes.includes('FR-CA') && codes.includes('AR-001') && codes.includes('CH') && codes.includes('IN'));
assert(!codes.includes('FR-CH') && !codes.includes('HI-IN'));
for (const code of ['BA', 'HK', 'ID', 'IL', 'MY', 'MT', 'KR', 'TW']) assert(codes.includes(code));
const formatBytes = code => wire.subarray(15 + codes.indexOf(code) * 13, 21 + codes.indexOf(code) * 13);
assert.notDeepEqual(formatBytes('HK'), formatBytes('CN'), 'Hong Kong must differ from mainland China');
assert.equal(formatBytes('ID')[4], '.'.charCodeAt(0), 'Indonesian time separator');
console.log('PASS calendar boundaries, country file errors/duplicates, locale formats, staged per-device RTC initialization and bundled records');
