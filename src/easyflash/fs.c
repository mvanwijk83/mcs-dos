/* Separately linked ROM driver. Two complete snapshots occupy ROML/ROMH
 * sectors in banks 56..63. The commit byte is programmed last. */
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
#define LIMIT 65024U
#define RECORD 24U
#define BASE 32U
#define DATA 1024U
#define MAXFILES 40
typedef struct { unsigned int pos, len, off; unsigned char side, kind; } Channel;
static Channel channels[6];
static unsigned char active, count, pending, writer, error, target, outcount, mounted, exclude, entry[24];
static unsigned int generation, used, cursor, writebase;
static char newname[17];
static unsigned char newtype, failed;
static char configline[80];
#define EXESIZE (*(const unsigned int *)0xb7f0)
/* Small decimal formatter: keep variadic printf off the driver's tiny stack. */
static unsigned char number(unsigned char at,unsigned int value) {
 char digits[5];unsigned char n=0;
 do { digits[n++]='0'+value%10;value/=10; } while(value);
 while(n) TEXT[at++]=digits[--n];TEXT[at]=0;return at;
}
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
static unsigned char get(unsigned char side, unsigned int at) {
 H[0]=56+(at>>13); H[1]=at; H[2]=(side?0xa0:0x80)+((at>>8)&31);
 hal(0); return H[3];
}
static void put(unsigned int at, unsigned char v) {
 if(failed) return;
 H[0]=56+(at>>13); H[1]=at; H[2]=(target?0xa0:0x80)+((at>>8)&31); H[3]=v;
 hal(1); if(H[4]) { failed=1; error=25; }
}
static unsigned int word(unsigned char side, unsigned int at) {
 unsigned int v=get(side,at); return v|((unsigned int)get(side,at+1)<<8);
}
static void putword(unsigned int at,unsigned int v) { put(at,v); put(at+1,v>>8); }
static void record(unsigned char i) {
 unsigned char j; for(j=0;j<24;++j) entry[j]=get(active,BASE+(unsigned int)i*RECORD+j);
}
static int find(const char *name) {
 unsigned char i; for(i=0;i<count;++i) { record(i); if(!strcmp((char*)entry,name)) return i; } return -1;
}
static unsigned char matches(const char *p,const char *s) {
 const char *star=0,*retry=0;
 while(*s) {
  if(*p=='?'||*p==*s) { ++p; ++s; }
  else if(*p=='*') { star=++p; retry=s; }
  else if(star) { p=star; s=++retry; }
  else return 0;
 }
 while(*p=='*') ++p; return !*p;
}
static unsigned int checksum(unsigned char side,unsigned int end) {
 unsigned int i; unsigned char a=0,b=0;
 for(i=BASE;i<end;++i) { a+=get(side,i); b+=a; } return a|((unsigned int)b<<8);
}
static unsigned char valid(unsigned char side) {
 unsigned int end;
 if(get(side,0)!=77||get(side,1)!=70||get(side,2)!=83||get(side,3)!=2||get(side,15)!=0xa5) return 0;
 end=word(side,6);
 if(end<DATA||end>LIMIT||get(side,8)>MAXFILES) return 0;
 return checksum(side,end)==word(side,10);
}
static void mount(void) {
 unsigned char a,b;
 memset(channels,0,sizeof(channels)); mounted=writer=pending=error=failed=0;
 a=valid(0); b=valid(1);
 if(!a&&!b) { error=74; count=0; used=DATA; return; }
 active=b&&(!a||(int)(word(1,4)-word(0,4))>0);
 generation=word(active,4); used=word(active,6); count=get(active,8);
 mounted=1;
}
static void emitrecord(unsigned int off,unsigned int len) {
 unsigned char j; unsigned int at=BASE+(unsigned int)outcount*RECORD;
 entry[18]=off; entry[19]=off>>8; entry[20]=len; entry[21]=len>>8;
 for(j=0;j<24;++j) put(at+j,entry[j]); ++outcount;
}
static unsigned char begin(int omit) {
 unsigned char i; unsigned int n,off,len,start;
 if(writer) { error=60; return 0; }
 for(i=0;i<6;++i) if(channels[i].kind==1&&channels[i].side!=active) { error=60; return 0; }
 target=active^1; failed=0; H[2]=target?0xa0:0x80; hal(2);
 if(H[4]) { error=25; return 0; }
 cursor=DATA; outcount=0;
 for(i=0;i<count;++i) {
  record(i); if(i==omit||i==exclude||(omit==-2&&matches(newname,(char*)entry))) continue;
  off=entry[18]|((unsigned int)entry[19]<<8); len=entry[20]|((unsigned int)entry[21]<<8); start=cursor;
  if(len>LIMIT-cursor) { error=72; return 0; }
  for(n=0;n<len;++n) put(cursor++,get(active,off+n));
  emitrecord(start,len);
 }
 return !failed;
}
static void commit(void) {
 unsigned int sum;
 if(failed) return;
 sum=checksum(target,cursor);
 put(0,77); put(1,70); put(2,83); put(3,2); putword(4,generation+1);
 putword(6,cursor); put(8,outcount); putword(10,sum);
 if(failed||checksum(target,cursor)!=sum) { error=25; return; }
 put(15,0xa5);
 if(!failed) { active=target; ++generation; count=outcount; used=cursor; }
}
static void openfile(unsigned char f,const char *text) {
 char name[17]; unsigned char n=0,mode='r',type=16; int index; const char *s=text;
 if(f>=6) { error=70; return; }
 channels[f].kind=0;
 if(*s=='@') ++s;
 if(s[0]=='0'&&s[1]==':') s+=2;
 while(*s&&*s!=','&&n<16) name[n++]=*s++;
 name[n]=0;
 if(!strcmp(name,"mcs-dos.exe")) { error=26; return; }
 if(*s==',') { ++s; if(*s=='p') type=17; else if(*s=='u') type=18; while(*s&&*s!=',') ++s; if(*s) mode=s[1]; }
 if(!n||*s&&*s!=',') { error=33; return; }
 index=find(name);
 if(mode=='r') {
  if(index<0) { error=62; return; }
  channels[f].off=entry[18]|((unsigned int)entry[19]<<8); channels[f].len=entry[20]|((unsigned int)entry[21]<<8);
  channels[f].side=active; channels[f].pos=0; channels[f].kind=1; return;
 }
 if(mode!='w'&&mode!='a') { error=33; return; }
 if(index>=0&&entry[22]) { error=26; return; }
 if(index<0&&count==MAXFILES) { error=72; return; }
 if(!begin(index)) return;
 strcpy(newname,name); newtype=type; writebase=cursor; writer=f+1;
 if(mode=='a'&&index>=0) {
  unsigned int off,len,j; record(index); off=entry[18]|((unsigned int)entry[19]<<8); len=entry[20]|((unsigned int)entry[21]<<8);
  if(len>LIMIT-cursor) { failed=1; error=72; } else for(j=0;j<len;++j) put(cursor++,get(active,off+j));
 }
 channels[f].kind=2;
}
static void closefile(unsigned char f) {
 if(f>=6) return;
 if(channels[f].kind==2&&writer==f+1) {
  memset(entry,0,sizeof(entry)); strcpy((char*)entry,newname); entry[17]=newtype;
  emitrecord(writebase,cursor-writebase); commit(); writer=0;
 }
 channels[f].kind=0;
}
static void command(const char *s) {
 char a[17],b[17]; unsigned char n=0; int i;
 if(*s=='i') { error=0; return; }
 if(*s!='s'&&*s!='r') { error=31; return; }
 pending=*s++;
 while(*s&&*s!=':') ++s; if(*s) ++s;
 while(*s&&*s!='='&&n<16) a[n++]=*s++; a[n]=0;
 if(!strcmp(a,"mcs-dos.exe")) { error=26; return; }
 if(pending=='s') {
  n=0; for(i=0;i<count;++i) { record(i); if(matches(a,(char*)entry)) { if(entry[22]) { error=26; return; } ++n; } }
  if(!n) { error=62; return; } strcpy(newname,a); if(begin(-2)) commit(); return;
 }
 i=find(a); if(i>=0) { if(entry[22]) { error=26; return; } exclude=i; }
 if(*s!='=') { error=33; return; } ++s;
 if(s[0]=='0'&&s[1]==':') s+=2;
 strncpy(b,s,16); b[16]=0; i=find(b); if(i<0) { error=62; return; }
 if(entry[22]) { error=26; return; }
 // Copy everything, changing just the matching directory record.
 // Rewriting non-erased metadata is not valid flash programming. Rename is
 // performed as a normal replacement transaction by copying the renamed file last.
 if(!begin(i)) return;
 record(i);
 { unsigned int off=entry[18]|((unsigned int)entry[19]<<8), len=entry[20]|((unsigned int)entry[21]<<8), j, start=cursor;
  strcpy((char*)entry,a); for(j=0;j<len;++j) put(cursor++,get(active,off+j)); emitrecord(start,len); }
 commit();
}
static void concat(void) {
 char request[41], name[17], *s,*end; unsigned char n; int index;
 if(strlen(TEXT)>40) { error=33; return; }
 strcpy(request,TEXT); s=strchr(request,':'); if(!s) { error=33; return; } ++s;
 end=strchr(s,'='); if(!end||end-s>16) { error=33; return; } *end=0;
 if(!strcmp(s,"mcs-dos.exe")) { error=26; return; }
 index=find(s); if(index>=0&&entry[22]) { error=26; return; }
 if(index<0&&count==MAXFILES) { error=72; return; }
 if(!begin(index)) return;
 strcpy(newname,s); writebase=cursor; s=end+1;
 do {
  if(s[0]=='0'&&s[1]==':') s+=2;
  n=0; while(*s&&*s!=','&&n<16) name[n++]=*s++; name[n]=0;
  if(*s&&*s!=',') { error=33; return; }
  index=find(name); if(index<0) { error=62; return; }
  { unsigned int off=entry[18]|((unsigned int)entry[19]<<8),len=entry[20]|((unsigned int)entry[21]<<8),j;
   if(len>LIMIT-cursor) { error=72; return; }
   for(j=0;j<len;++j) put(cursor++,get(active,off+j)); }
  if(!*s) break; ++s;
 } while(1);
 memset(entry,0,24); strcpy((char*)entry,newname); entry[17]=16;
 emitrecord(writebase,cursor-writebase); commit();
}
static void attribute(void) {
 unsigned char mode=P[2], flag; int index=find(TEXT);
 unsigned int off,len,j,start;
 if(!strcmp(TEXT,"mcs-dos.exe")) { P[5]=1;if(mode==2) error=26;return; }
 if(index<0) { error=62; return; }
 P[5]=entry[22]; if(!mode) return;
 flag=mode==1; if(entry[22]==flag) return;
 if(!begin(index)) return; record(index);
 off=entry[18]|((unsigned int)entry[19]<<8);len=entry[20]|((unsigned int)entry[21]<<8); start=cursor;
 for(j=0;j<len;++j) put(cursor++,get(active,off+j));
 entry[22]=flag; emitrecord(start,len); commit();
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
void dispatch(void) {
 unsigned char op=P[0],f=P[1],n=P[3],i; Channel *c;
 if(op==0) { hal(3); if(H[4]) { error=74; P[4]=error; return; } mount(); }
 else if(op==7) { P[4]=error; return; }
 else if(!mounted) { P[4]=74; return; }
 else {
  error=0; exclude=255;
  if(op==1) openfile(f,TEXT);
  else if(op==4) { if(failed) error=25; closefile(f); }
  else if(op==6) { if(TEXT[0]=='c') concat(); else command(TEXT); }
  else if(op==8) config();
  else if(op==9) attribute();
  else if(op==10) { if(find(TEXT)<0) error=62; else { for(i=0;i<24;++i) TEXT[i]=entry[i]; P[5]=active; } }
  else if(op==11) { for(i=0;i<CART_RUN_SIZE;++i) TEXT[i]=((const char*)0xbf00)[i]; P[3]=CART_RUN_SIZE; }
  else if(op==12) { if(writer==f+1) { failed=1; channels[f].kind=0; writer=0; } }
  else if(op==13) {
   switch(P[2]) {
   case 0: strcpy(TEXT,"Volume MCS-DOS 2.0\nDisk ID is MC\n\n"); break;
   case 1: strcpy(TEXT,"131,072 bytes reserved flash\n 65,536 bytes recovery snapshot\n"); break;
   case 2: strcpy(TEXT,"  1,024 bytes snapshot metadata\n    512 bytes reserved per snapshot\n\n 64,000 bytes total file space\n"); break;
   case 3: i=number(0,used-DATA);strcpy(TEXT+i," bytes used in ");i=number(i+15,count);strcpy(TEXT+i," files\n");break;
   case 4: i=number(0,LIMIT-used);strcpy(TEXT+i," bytes available for files\n");break;
   default: i=number(0,40-count);strcpy(TEXT+i," of 40 writable file slots free\n\nMCS-DOS.EXE is outside this area.\n");break;
   }
  }
  else if(f<6) {
   c=channels+f;
   if(op==2) {
    if(c->kind!=1) { error=61; n=0; }
    else { if(n>c->len-c->pos) n=c->len-c->pos; for(i=0;i<n;++i) TEXT[i]=get(c->side,c->off+c->pos++); }
    P[3]=n;
   } else if(op==3) {
    if(failed) error=25;
    else if(c->kind!=2||writer!=f+1) error=61;
    else if(n>LIMIT-cursor) { error=72; failed=1; }
    else for(i=0;i<n;++i) put(cursor++,TEXT[i]);
    if(error) P[3]=0;
   } else if(op==5) {
    if(P[2]==0) { c->pos=0; c->kind=3; }
    else if(c->pos==0) { memset(TEXT,0,24); strcpy(TEXT,"mcs-dos 2.0"); P[3]=0; ++c->pos; }
    else if(c->pos<=count) { record(c->pos++-1); for(i=0;i<24;++i) TEXT[i]=entry[i]; P[3]=0; }
    else if(c->pos==count+1) {
     memset(TEXT,0,24);strcpy(TEXT,"mcs-dos.exe");TEXT[17]=17;
     TEXT[20]=EXESIZE;TEXT[21]=EXESIZE>>8;TEXT[22]=1;P[3]=0;++c->pos;
    }
    else { P[3]=2; P[5]=(LIMIT-used)/254; P[6]=((LIMIT-used)/254)>>8; }
   }
  } else error=70;
 }
 P[4]=error;
}
