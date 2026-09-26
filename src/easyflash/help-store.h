#include "../../build/easyflash/helpmeta.h"
/* Immutable indexed help in bank 10 ROML; independent of filesystem mount. */
static unsigned char helpbyte(unsigned int at) {
 H[0]=10;H[1]=at;H[2]=0x80+(at>>8);hal(0);return H[3];
}
static unsigned int helpword(unsigned int at) {
 unsigned int n=helpbyte(at);return n|((unsigned int)helpbyte(at+1)<<8);
}
static void help_store(void) {
 unsigned char topic=P[2],n=P[3],i;unsigned int start,end,pos=P[5]|((unsigned int)(P[6])<<8);
 P[4]=0;if(topic>=HELP_TOPICS){P[4]=62;P[3]=0;return;}
 start=helpword((unsigned int)topic*2);end=helpword((unsigned int)(topic+1)*2);
 if(pos>=end-start)n=0;else if(n>end-start-pos)n=end-start-pos;
 if(n>120)n=120;for(i=0;i<n;++i)TEXT[i]=helpbyte(start+pos+i);P[3]=n;
}
