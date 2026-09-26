#include "core.h"
#include "session.h"
/* Changing these sizes requires a new on-flash format and matching offsets. */
#if LINE != 65 || ENVSIZE != 512 || ENVVALUE != 32 || RAWMAP != 9
#error Update the session format before changing persistent buffer sizes
#endif
#pragma code(boot_code)
#pragma data(boot_data)
#include "../build/easyflash/wedge.h"
#define P ((volatile unsigned char *)0x0800)
#define TEXT ((char *)0x0808)
static unsigned char transfer(unsigned char op,unsigned char n) {
 P[0]=op;P[3]=n;__asm { jsr 0x0880 } return !P[4];
}
/* Explicit on-flash fields, never compiler pointers or a raw C structure. */
static unsigned char statebyte(unsigned int i) {
 if(i<16) {
  switch(i) {
  case 0:return fg;case 1:return bg;case 2:return bd;case 3:return drive;
  case 4:return echoon;case 5:return histcount;case 6:return histnext;
  case 7:return envused;case 8:return envused>>8;case 9:return envready;
  default:return 0;
  }
 }
 if(i<528)return environment[i-16];
 if(i<1178)return ((char*)history)[i-528];
 if(i<1268)return ((char*)rawhistory)[i-1178];
 return prompttext[i-1268];
}
static void stateput(unsigned int i,unsigned char value) {
 if(i<16) {
  switch(i) {
  case 0:fg=value;break;case 1:bg=value;break;case 2:bd=value;break;case 3:drive=value;break;
  case 4:echoon=value;break;case 5:histcount=value;break;case 6:histnext=value;break;
  case 7:envused=value;break;case 8:envused|=(unsigned int)value<<8;break;case 9:envready=value;break;
  }
 } else if(i<528)environment[i-16]=value;
 else if(i<1178)((char*)history)[i-528]=value;
 else if(i<1268)((char*)rawhistory)[i-1178]=value;
 else if(i<1301)prompttext[i-1268]=value;
 else POKE(0xe800+i-1301,value);
}
__noinline unsigned char bank_session_save(void) {
 unsigned int pos=0;unsigned char n,i;
 RESUME[1]=0;
 if(!transfer(14,0))return 0;
 while(pos<SESSION_SIZE) {
  n=SESSION_SIZE-pos>120?120:SESSION_SIZE-pos;
  if(pos<1301) {
   if(n>1301-pos)n=1301-pos;
   for(i=0;i<n;++i)io[i]=statebyte(pos+i);
  } else session_fontread(pos-1301,n);
  memcpy(TEXT,io,n);if(!transfer(15,n))return 0;pos+=n;
 }
 if(!transfer(16,0))return 0;
 for(i=0;i<5;++i)RESUME[2+i]=P[5+i];
 RESUME[1]=1;return 1;
}
__noinline unsigned char bank_session_restore(void) {
 unsigned int pos=0;unsigned char n,i;
 if(RESUME[1]!=1)return 0;
 for(i=0;i<5;++i)P[5+i]=RESUME[2+i];
 if(!transfer(17,0))return 0;
 while(pos<SESSION_SIZE) {
  n=SESSION_SIZE-pos>120?120:SESSION_SIZE-pos;
  if(!transfer(18,n))return 0;
  for(i=0;i<n;++i)stateput(pos+i,TEXT[i]);pos+=n;
 }
 /* CRC was checked before modifying state; bounds also guard format misuse. */
 if(fg>15||bg>15||bd>15||(drive&& (drive<8||drive>30))||histcount>10||histnext>=10||envused>ENVSIZE)return 0;
 prompttext[ENVVALUE]=0;
 for(i=0;i<10;++i)history[i][LINE-1]=0;
 colors();clear();caret_init();return 1;
}
__noinline void bank_session_basic(void) {
 memcpy((void*)0xc000,wedge_image,sizeof(wedge_image));
 RESUME[0]=0;RESUME[16]=fg;RESUME[17]=bg;RESUME[18]=bd;
 __asm { jmp 0xc000 }
}
#pragma code(code)
#pragma data(data)
/* Reading font RAM beneath KERNAL must execute entirely in resident RAM. */
__noinline void session_fontread(unsigned int offset,unsigned char size) {
 __asm { php
 sei }
 POKE(1,0x34);memcpy(io,(void*)(0xe800+offset),size);POKE(1,0x36);
 __asm { plp }
}
