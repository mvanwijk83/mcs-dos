// Exercise the production UCI transport and report against a register-level fake.
const fs=require('fs'),{functions}=require('./source');
require('./setup');
const harness=`
static unsigned char io[256], mode, pushed, commands[3], commandcount;
static unsigned char replypos, statuspos, polls, control, writes, id, revision=3;
static unsigned char c128, vdc, rasterreads;
static unsigned int window;
static unsigned long ticks;
static const char *reply, *status;
static char output[1024];
typedef long clock_t;
#define CLOCKS_PER_SEC 60
static clock_t clock(void) { return ticks++; }
static unsigned char peek(unsigned int a) {
 if(a>=0xde1c&&a<=0xde1f) { if(window!=0xde1c)return 255; a+=256; }
 else if(a>=0xdf1c&&a<=0xdf1f&&window!=0xdf1c)return 0;
 if(a==0xdf1d)return mode==1?id:mode==0?255:201;
 if(a==0xdf1c) {
  if(mode==1)return 0;
  if(mode==4)return 16;
  if(!pushed)return mode==8?2:0;
  if(mode==10)return 1;
  if(mode==9&&polls++<3)return 1;
  if(mode==3||polls++<3)return 16;
  return (mode==7?48:32)|(reply[replypos]?128:0)|(status[statuspos]?64:0);
 }
 if(a==0xdf1e)return reply[replypos++];
 if(a==0xdf1f)return status[statuspos++];
 if(a==0xd02f)return c128?248:255;
 if(a==0xd600)return 128|vdc;
 if(a==0xd011)return rasterreads++<2?128:0;
 if(a==0xd012)return 50;
 if(a==0xff80)return revision;
 if(a>=0xd000)return 0;
 return *(unsigned char *)a;
}
static void poke(unsigned int a,unsigned char value) {
 if(a>=0xde1c&&a<=0xde1f) { if(window!=0xde1c)return; a+=256; }
 if(a==0xdf1d) {
  ++writes;
  if(mode==1)id=value;
  else if(commandcount<3)commands[commandcount++]=value;
 }
 if(a==0xdf1c) { ++writes;control=value;if(value==1)pushed=1;else pushed=0; }
}
#define PEEK(a) peek(a)
#define POKE(a,v) poke(a,v)
${functions('romtext','kernalname','ultimate')}
static void newline(void) { strcat(output,"\\n"); }
static void say(const char *s) { strcat(output,s);newline(); }
static void print(const char *fmt,...) {
 va_list args;va_start(args,fmt);vsnprintf(output+strlen(output),sizeof(output)-strlen(output),fmt,args);va_end(args);
}
static unsigned char statuschannel(unsigned char dev) { return 0; }
static unsigned char drivetype(unsigned char dev,unsigned char report) { return 0; }
${functions('sysinfo')}
static void reset(unsigned char m,const char *r,const char *s) {
 mode=m;reply=r;status=s;pushed=commandcount=replypos=statuspos=polls=control=writes=rasterreads=0;
 id=201;ticks=250; /* Also exercise the bounded wait across the low-byte wrap. */
 window=0xdf1c;
 memset(io,0xa5,sizeof(io));output[0]=0;
}
static unsigned char check(const char *r,const char *expected) {
 const char *actual;
 reset(2,r,"00,OK");actual=ultimate();
 if(expected?(!actual||strcmp(actual,expected)):actual!=0)return 1;
 if(control!=(strlen(r)>=20?4:2)||commandcount!=3||commands[0]!=4||commands[1]!=40||commands[2]!=0)return 2;
 if(io[21]!=0xa5)return 3;
 return 0;
}
int main(void) {
 if(check("Ultimate 64","Ultimate 64"))return 1;
 if(check("Ultimate 64 Elite","Ultimate 64 Elite"))return 2;
 if(check("Ultimate 64-II","Ultimate 64 Elite-II"))return 3;
 if(check("C64 Ultimate","Commodore 64 Ultimate"))return 4;
 if(check("ULTIMATE 64","Ultimate 64")||check("c64 ultimate","Commodore 64 Ultimate"))return 5;
 if(check("Ultimate II",0)||check("Ultimate II+",0)||check("Ultimate II+L",0)||check("Ultimate",0))return 6;
 if(check("Ultimate 64 future",0)||check("Ultimate 64 Elite-II",0)||check("C64 Ultimate!",0))return 7;
 if(check("",0)||check("Ultimate 64 Elite with a longer name",0))return 8;
 reset(0,"Ultimate 64","00,OK");if(ultimate()||writes)return 9;
 reset(1,"Ultimate 64","00,OK");if(ultimate()||id!=201||writes!=2||control)return 10;
 reset(4,"Ultimate 64","00,OK");if(ultimate()||writes)return 11;
 reset(3,"Ultimate 64","00,OK");if(ultimate()||control!=4||ticks>300)return 12;
 reset(7,"Ultimate 64","00,OK");if(ultimate()||control!=4)return 13;
 reset(2,"Ultimate 64","21,UNKNOWN COMMAND");if(ultimate()||control!=4)return 14;
 reset(2,"Ultimate 64","");if(ultimate()||control!=4)return 15;
 reset(2,"Ultimate 64","00,OK EXTRA");if(ultimate()||control!=4)return 16;
 reset(2,"Ultimate 64","00,O");if(ultimate()||control!=4)return 17;
 reset(2,"C64 Ultimate","00,OK");revision=67;c128=1;vdc=2;sysinfo();
 if(!strstr(output,"Commodore 64 personal computer\\n64 KB RAM")||
    !strstr(output,"CPU:      MOS 6510 (FPGA)\\nBoard:    Commodore 64 Ultimate\\nKERNAL:")||strstr(output,"portable"))return 18;
 reset(2,"Ultimate II+","00,OK");revision=3;c128=1;vdc=2;sysinfo();
 if(!strstr(output,"Commodore 128DCR personal computer\\n128 KB RAM")||!strstr(output,"CPU:      MOS 8502")||strstr(output,"Board:"))return 19;
 reset(0,"","00,OK");c128=0;revision=67;sysinfo();
 if(!strstr(output,"Commodore SX-64 portable computer"))return 20;
 reset(8,"ULTIMATE 64","00,OK");revision=3;c128=0;sysinfo();
 if(!strstr(output,"CPU:      MOS 6510 (FPGA)")||!strstr(output,"Board:    Ultimate 64"))return 21;
 reset(9,"ULTIMATE 64","00,OK");
 if(!ultimate()||control!=2)return 22;
 reset(10,"ULTIMATE 64","00,OK");
 if(ultimate()||control!=4||ticks>300)return 23;
 reset(2,"ULTIMATE 64","00,OK");window=0xde1c;revision=3;c128=0;sysinfo();
 if(!strstr(output,"CPU:      MOS 6510 (FPGA)")||!strstr(output,"Board:    Ultimate 64"))return 24;
 if(control!=2||commandcount!=3)return 25;
 reset(1,"ULTIMATE 64","00,OK");window=0xde1c;
 if(ultimate()||id!=201||writes!=2)return 26;
 reset(4,"ULTIMATE 64","00,OK");window=0xde1c;
 if(ultimate()||writes)return 27;
 return 0;
}
`;
fs.writeFileSync('build/test-ultimate-models.c',harness);
require('./simulator')('build/test-ultimate-models.c');
console.log('PASS Ultimate mappings, aligned Board report, classic fallback, IO2 restoration, accepted idle state, pending command, busy interface, timeouts and malformed replies');
