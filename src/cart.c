#include "c64-support.h"
#include "cart.h"
#include <string.h>
#define P ((volatile unsigned char *)0x0800)
#define TEXT ((char *)0x0808)
/* Calls preserve the RAM shell's zero-page registers. The ROM driver owns
 * a separate stack and never receives pointers into banked-out shell RAM;
 * transfers cross this mailbox in chunks of at most 120 bytes. */
unsigned char cart_channels[6];
extern void charset_default(void);
static void call(unsigned char op,unsigned char f) {
 P[0]=op; P[1]=f;
 __asm { jsr 0x0880 }
}
unsigned char cart_init(void) {
 memset(cart_channels,0,6); call(0,0); return P[4];
}
unsigned char cart_status(void) { call(7,0); return P[4]; }
const char *cart_stats(unsigned char line) { P[2]=line;call(13,0);return TEXT; }
unsigned char cart_open(char f,char s,const char *name) {
 if(f<0||f>=6||strlen(name)>=120) return 1;
 strcpy(TEXT,name); P[2]=s; call(1,f); cart_channels[f]=!P[4]; return P[4];
}
int cart_read(char f,void *buffer,unsigned int size) {
 unsigned int done=0; unsigned char n; char *dest=buffer;
 while(done<size) {
  n=size-done>120?120:size-done; P[3]=n; call(2,f);
  if(P[4]) return -1;
  memcpy(dest+done,TEXT,P[3]); done+=P[3]; if(P[3]<n) break;
 }
 POKE(144,done<size?64:0); return done;
}
int cart_write(char f,const void *buffer,unsigned int size) {
 unsigned int done=0; unsigned char n; const char *src=buffer;
 while(done<size) {
  n=size-done>120?120:size-done; memcpy(TEXT,src+done,n); P[3]=n; call(3,f);
  if(P[4]) return -1; done+=n;
 }
 return done;
}
void channel_close(char f) {
 if(f>=0&&f<6&&cart_channels[f]) { call(4,f); cart_channels[f]=0; }
 else krnio_close(f);
}
void channel_abort(char f) {
 if(f>=0&&f<6&&cart_channels[f]) { call(12,f); cart_channels[f]=0; }
}
unsigned char cart_command(const char *text) {
 if(strlen(text)>=120) return 33; strcpy(TEXT,text); call(6,0); return P[4];
}
unsigned char cart_directory(char f,unsigned char first,struct DirectoryEntry *e) {
 P[2]=first?0:1; call(5,f); cart_channels[f]=1;
 if(first) return P[4];
 if(P[3]==2) { e->size=P[5]|((unsigned int)(P[6])<<8); return 2; }
 strcpy(e->name,TEXT); e->type=P[25]; e->access=P[30]?CBM_A_RO:CBM_A_RW;
 e->size=((unsigned int)(P[28])+((unsigned int)(P[29])<<8)+253)/254;
 return P[4]?1:0;
}
unsigned char cart_config(unsigned char *devices) {
 call(8,0); memcpy(devices,TEXT,P[3]); return P[3];
}
unsigned char cart_attribute(const char *name,unsigned char mode) {
 strcpy(TEXT,name); P[2]=mode; call(9,0); return P[5];
}
unsigned char cart_launch(const char *name,unsigned char absolute,unsigned int address) {
 unsigned int offset,len; unsigned char side,h[2];
 strcpy(TEXT,name); call(10,0); if(P[4]) return 0;
 offset=P[26]|((unsigned int)(P[27])<<8); len=P[28]|((unsigned int)(P[29])<<8); side=P[5];
 if(len<2) return 0;
 if(cart_open(2,2,name)||cart_read(2,h,2)!=2) return 0;
 channel_close(2); if(!absolute) address=h[0]|((unsigned int)h[1]<<8);
 if(address<2049 || (unsigned long)address+len-2>65536UL) return 0;
 offset+=2; len-=2;
 // Restore display before installing the low-RAM loader (including its caret).
 charset_default(); POKE(0x288,4); POKE(0xd015,PEEK(0xd015)&254);
 POKE(0xcc,0); POKE(0xcf,0); POKE(0x0291,0);
 call(11,0); memcpy((void*)0x0334,TEXT,P[3]);
 // The default screen contained EasyAPI, so clear it only after our last
 // filesystem call. Match the disk loader's BASIC display handoff.
 __asm { jsr 0xffcc
 jsr 0xffe7
 lda #0x8e
 jsr 0xffd2
 lda #0x93
 jsr 0xffd2 }
 POKE(0xf7,len); POKE(0xf8,len>>8); POKE(0xfb,offset); POKE(0xfc,(side?0xa0:0x80)+((offset>>8)&31));
 POKE(0xfd,address); POKE(0xfe,address>>8); POKE(0x02a0,56+(offset>>13)); POKE(0x02a1,side?0xa0:0x80);
 POKE(0x02a2,absolute); POKE(0x02a3,address); POKE(0x02a4,address>>8);
 __asm { jmp 0x0334 }
 return 1;
}
