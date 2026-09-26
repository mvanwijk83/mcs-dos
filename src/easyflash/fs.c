/* Writable MFJ3 journal plus private session/resource services. */
#include <string.h>
#include <stdlib.h>
#pragma section(startup, 0)
#pragma region(startup, 0x8000, 0x8020, , , {startup})
#pragma region(main, 0x8020, 0xc000, , , {code, data})
#pragma region(state, 0x0700, 0x07f0, , , {bss})
#pragma region(stackram, 0xc700, 0xc800, , , {stack})
#pragma stacksize(256)
#pragma heapsize(0)
#define P ((volatile unsigned char *)0x0800)
#define H ((volatile unsigned char *)0x07f0)
#define TEXT ((char *)0x0808)
void dispatch(void);
extern void StackEnd;
__asm startup {
 lda #<StackEnd-2
 sta 0x23
 lda #>StackEnd-2
 sta 0x24
 jsr dispatch
 rts }
#pragma startup(startup)
static void hal(unsigned char op) {
 switch(op) {
 case 0: __asm { jsr 0x0883 } break;
 case 1: __asm { jsr 0x0886 } break;
 case 2: __asm { jsr 0x0889 } break;
 default: __asm { jsr 0x088c } break;
 }
}
#include "journal.h"
static unsigned char number(unsigned char at,unsigned int value) {
 char digits[5];unsigned char n=0;
 do { digits[n++]='0'+value%10;value/=10; } while(value);
 while(n) TEXT[at++]=digits[--n];TEXT[at]=0;return at;
}

static void openfile(unsigned char f,const char *text) {
 char name[17];unsigned char n=0,mode='r',type=16,side;int index;const char *s=text;
 unsigned int off,len,j;
 if(f>=6){error=70;return;}if(channels[f].kind){error=60;return;}
 if(*s=='@')++s;if(s[0]=='0'&&s[1]==':')s+=2;
 while(*s&&*s!=','&&n<16)name[n++]=*s++;name[n]=0;
 if(*s==','){++s;if(*s=='p')type=17;else if(*s=='u')type=18;while(*s&&*s!=',')++s;if(*s)mode=s[1];}
 if(!n||(*s&&*s!=',')){error=33;return;}index=find(name);
 if(mode=='r') {
  if(index<0){error=62;return;}channels[f].off=eword(18);channels[f].len=eword(20);
  channels[f].side=active;channels[f].pos=0;channels[f].kind=1;return;
 }
 if(mode!='w'&&mode!='a'){error=33;return;}if(index>=0&&entry[22]){error=26;return;}
 if(!startwrite(index,name,type))return;
 writer=f+1;channels[f].kind=2;
 if(mode=='a'&&index>=0) {
  record(index);side=active;off=eword(18);len=eword(20);
  if(reserve(len))for(j=0;j<len;++j)payload(get(side,off+j));
  if(failed){channels[f].kind=0;abortwrite();}
 }
}
static void closefile(unsigned char f) {
 if(f>=6)return;
 if(channels[f].kind==2&&writer==f+1)completewrite();channels[f].kind=0;
}
static void command(const char *s) {
 char a[17],b[17];unsigned char n=0,op=*s++,j,found=0;int index,dest;
 if(op=='i')return;if(op!='s'&&op!='r'){error=31;return;}
 while(*s&&*s!=':')++s;if(*s)++s;
 while(*s&&*s!='='&&n<16)a[n++]=*s++;a[n]=0;
 if(op=='s') {
  for(j=0;j<40;++j)if(heads[j]){record(j);if(matches(a,(char*)entry)){if(entry[22]){error=26;return;}found=1;}}
  if(!found){error=62;return;}
  for(j=0;j<40;++j)if(heads[j]){record(j);if(matches(a,(char*)entry)){if(!prepare())return;record(j);metadata(j,3,255);if(error)return;}}
  return;
 }
 dest=find(a);if(dest>=0&&entry[22]){error=26;return;}
 if(*s!='='){error=33;return;}++s;if(s[0]=='0'&&s[1]==':')s+=2;
 if(strlen(s)>16){error=33;return;}strcpy(b,s);index=find(b);if(index<0){error=62;return;}
 if(entry[22]){error=26;return;}if(index==dest)return;
 if(!prepare())return;record(index);strcpy((char*)entry,a);metadata(index,2,dest<0?255:dest);
}
static void concat(void) {
 char request[41],name[17],dest[17],*s,*end;unsigned char n,side;int index;
 unsigned int off,len,j;
 if(strlen(TEXT)>40){error=33;return;}strcpy(request,TEXT);s=strchr(request,':');if(!s){error=33;return;}++s;
 end=strchr(s,'=');if(!end||end-s>16||end==s){error=33;return;}*end=0;strcpy(dest,s);
 index=find(dest);if(index>=0&&entry[22]){error=26;return;}
 if(!startwrite(index,dest,16))return;s=end+1;
 do {
  if(s[0]=='0'&&s[1]==':')s+=2;n=0;while(*s&&*s!=','&&n<16)name[n++]=*s++;name[n]=0;
  if(!n||(*s&&*s!=',')){error=33;break;}
  index=find(name);if(index<0){error=62;break;}
  side=active;off=eword(18);len=eword(20);if(!reserve(len))break;
  for(j=0;j<len;++j)payload(get(side,off+j));if(failed)break;
  if(!*s)break;++s;
 }while(1);
 if(error){failed=1;abortwrite();}else completewrite();
}
static void attribute(void) {
 unsigned char mode=P[2],flag;int index=find(TEXT);
 if(index<0){error=62;return;}P[5]=entry[22];if(!mode)return;
 flag=mode==1;if(entry[22]==flag)return;
 if(!prepare())return;record(index);entry[22]=flag;metadata(index,2,255);
}
static void config(void) {
 char *line=configline; unsigned char devices[24], trial[24], countdev=1, enabled=1, n=0, overflow=0, ch, j,k, bad=0;
 unsigned int off,len,pos=0,value; char *s,*end; int index=find("config.sys");
 devices[0]=0;
 if(index>=0) {
  off=entry[18]|((unsigned int)entry[19]<<8); len=entry[20]|((unsigned int)entry[21]<<8);
  while(pos<=len) {
   ch=pos<len?get(active,off+pos):13; ++pos;
   if(ch!=13&&ch!=10) {
    if(ch>=193&&ch<=218) ch-=128;
    if(ch>=97&&ch<=122) ch-=32;
    if(ch!=' '&&ch!=9) { if(n<79) line[n++]=ch; else overflow=1; }
    continue;
   }
   line[n]=0;
   if(overflow) bad=1;
   else if(n) {
    if(!strncmp(line,"ldautoex=",9)) {
     if(n==10&&(line[9]=='0'||line[9]=='1')) enabled=line[9]-'0'; else bad=1;
    } else if(!strncmp(line,"bootdrv=",8)) {
     s=line+8; k=0;
     do {
      value=0; end=s;
      while(*end>='0'&&*end<='9') { value=value*10+*end++-'0'; if(value>30) break; }
      if(end==s||value>30||(value!=0&&value<8)||k==24||(*end&&*end!=',')) { k=0; break; }
      trial[k++]=value; s=*end?end+1:end;
      if(*end&&!s[0]) { k=0; break; }
     } while(*end);
     if(k) { countdev=k; for(j=0;j<k;++j) devices[j]=trial[j]; } else bad=1;
    } else bad=1;
   }
   n=overflow=0;
  }
 }
 P[3]=enabled?countdev:0; for(j=0;j<countdev;++j) TEXT[j]=devices[j]; if(bad) error=33;
}

#include "session-store.h"
#include "help-store.h"
void dispatch(void) {
 unsigned char op=P[0],f=P[1],n=P[3],i,j;Channel *c;
 if(op==0){hal(3);if(H[4]){error=74;P[4]=error;return;}mount();}
 else if(op>=14&&op<=18){session_store(op);return;}
 else if(op==19){help_store();return;}
 else if(op==7){P[4]=error;return;}
 else if(!mounted){P[4]=74;return;}
 else {
  error=0;
  if(op==1)openfile(f,TEXT);
  else if(op==4){if(writer==f+1&&failed)error=25;closefile(f);}
  else if(op==6){if(TEXT[0]=='c')concat();else command(TEXT);}
  else if(op==8)config();
  else if(op==9)attribute();
  else if(op==10){if(find(TEXT)<0)error=62;else{for(i=0;i<24;++i)TEXT[i]=entry[i];P[5]=active;}}
  else if(op==11){for(i=0;i<CART_RUN_SIZE;++i)TEXT[i]=((const char*)0xbf00)[i];P[3]=CART_RUN_SIZE;}
  else if(op==12){if(writer==f+1){channels[f].kind=0;abortwrite();}}
  else if(op==13) {
   switch(P[2]) {
   case 0:strcpy(TEXT,"Volume MCS-DOS 2.0\nDisk ID is MC\n\n");break;
   case 1:strcpy(TEXT,"131,072 bytes reserved flash\n 65,536 bytes compaction reserve\n");break;
   case 2:strcpy(TEXT,"  1,536 bytes overhead per sector\n\n 64,000 bytes total file space\n");break;
   case 3:i=number(0,livebytes);strcpy(TEXT+i," bytes used in ");i=number(i+15,count);strcpy(TEXT+i," files\n");break;
   case 4:i=number(0,CAPACITY-livebytes);strcpy(TEXT+i," bytes available for files\n");break;
   default:i=number(0,40-count);strcpy(TEXT+i," of 40 writable file slots free\n\nJournal compacts when needed.\n");break;
   }
  } else if(f<6) {
   c=channels+f;
   if(op==2) {
    if(c->kind!=1){error=61;n=0;}else{if(n>c->len-c->pos)n=c->len-c->pos;for(i=0;i<n;++i)TEXT[i]=get(c->side,c->off+c->pos++);}
    P[3]=n;
   }else if(op==3) {
    if(c->kind!=2||writer!=f+1)error=61;
    else if(failed)error=25;
    else if(reserve(n))for(i=0;i<n;++i)payload(TEXT[i]);
    if(error)P[3]=0;
   }else if(op==5) {
    if(P[2]==0){c->pos=0;c->kind=3;}
    else if(c->pos==0){memset(TEXT,0,24);strcpy(TEXT,"mcs-dos 2.0");P[3]=0;++c->pos;}
    else if(c->pos<=count){j=0;for(i=0;i<40;++i)if(heads[i]&&++j==c->pos)break;record(i);++c->pos;for(i=0;i<24;++i)TEXT[i]=entry[i];P[3]=0;}
    else{P[3]=2;P[5]=(CAPACITY-livebytes)/254;P[6]=((CAPACITY-livebytes)/254)>>8;}
   }
  }else error=70;
 }
 P[4]=error;
}
