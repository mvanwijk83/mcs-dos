/* Private append-only journal: banks 48..55, both 64K flash chips.
 * 32 slots of 4096 bytes. Header first, CRC verified, commit byte last.
 * Only an exact wedge token may be restored; no search for fallback state. */
#define SESSION_SIZE 3349U
static unsigned char ss_slot, ss_failed;
static unsigned int ss_gen, ss_pos, ss_crc;
static unsigned int ss_update(unsigned int crc,unsigned char value) {
 unsigned char i; crc^=(unsigned int)value<<8;
 for(i=0;i<8;++i) crc=crc&0x8000?(crc<<1)^0x1021:crc<<1;
 return crc;
}
static unsigned char ss_get(unsigned char slot,unsigned int offset) {
 unsigned int at=(unsigned int)(slot&15)*4096+offset;
 H[0]=48+(at>>13);H[1]=at;H[2]=(slot<16?0x80:0xa0)+((at>>8)&31);
 hal(0);return H[3];
}
static void ss_put(unsigned int offset,unsigned char value) {
 unsigned int at=(unsigned int)(ss_slot&15)*4096+offset;
 if(ss_failed)return;
 H[0]=48+(at>>13);H[1]=at;H[2]=(ss_slot<16?0x80:0xa0)+((at>>8)&31);H[3]=value;
 hal(1);if(H[4])ss_failed=1;
}
static unsigned int ss_word(unsigned char slot,unsigned char offset) {
 unsigned int n=ss_get(slot,offset);return n|((unsigned int)ss_get(slot,offset+1)<<8);
}
static unsigned char ss_header(unsigned char slot) {
 return ss_get(slot,0)==77&&ss_get(slot,1)==83&&ss_get(slot,2)==83&&ss_get(slot,3)==1&&
  ss_word(slot,6)==SESSION_SIZE&&ss_get(slot,15)==0xa5;
}
static unsigned int ss_check(void) {
 unsigned int crc=0xffff,i;
 for(i=0;i<SESSION_SIZE;++i)crc=ss_update(crc,ss_get(ss_slot,16+i));
 return crc;
}
static void session_store(unsigned char op) {
 unsigned char i,j,empty=255,last=255,blank,n=P[3];unsigned int generation,crc;
 if(op==14) {
  ss_gen=0;ss_failed=0;
  for(i=0;i<32;++i) {
   blank=1;for(j=0;j<16;++j)if(ss_get(i,j)!=255)blank=0;
   if(blank&&empty==255)empty=i;
   if(ss_header(i)) {
    generation=ss_word(i,4);
    if(last==255||(generation!=ss_gen&&(unsigned int)(generation-ss_gen)<32768U)) {last=i;ss_gen=generation;}
   }
  }
  ++ss_gen;
  if(empty==255) {
   empty=last<16?16:0;H[0]=48;H[2]=empty?0xa0:0x80;hal(2);
   if(H[4])ss_failed=1;
  }
  ss_slot=empty;ss_pos=0;ss_crc=0xffff;
  ss_put(0,77);ss_put(1,83);ss_put(2,83);ss_put(3,1);
  ss_put(4,ss_gen);ss_put(5,ss_gen>>8);ss_put(6,SESSION_SIZE & 255);ss_put(7,SESSION_SIZE>>8);
 } else if(op==15) {
  if(n>120||ss_pos+n>SESSION_SIZE)ss_failed=1;
  else for(i=0;i<n;++i){ss_crc=ss_update(ss_crc,TEXT[i]);ss_put(16+ss_pos++,TEXT[i]);}
 } else if(op==16) {
  if(ss_pos!=SESSION_SIZE)ss_failed=1;
  ss_put(8,ss_crc);ss_put(9,ss_crc>>8);
  if(ss_word(ss_slot,4)!=ss_gen||ss_word(ss_slot,6)!=SESSION_SIZE||ss_word(ss_slot,8)!=ss_crc||ss_check()!=ss_crc)ss_failed=1;
  ss_put(15,0xa5);if(!ss_header(ss_slot))ss_failed=1;
  P[5]=ss_slot;P[6]=ss_gen;P[7]=ss_gen>>8;P[8]=ss_crc;P[9]=ss_crc>>8;
 } else if(op==17) {
  ss_slot=P[5];ss_gen=P[6]|((unsigned int)(P[7])<<8);crc=P[8]|((unsigned int)(P[9])<<8);
  ss_failed=ss_slot>=32;
  if(!ss_failed&&(!ss_header(ss_slot)||ss_word(ss_slot,4)!=ss_gen||ss_word(ss_slot,8)!=crc||ss_check()!=crc))ss_failed=1;
  ss_pos=0;
 } else if(op==18) {
  if(n>120||ss_pos+n>SESSION_SIZE)ss_failed=1;
  if(!ss_failed)for(i=0;i<n;++i)TEXT[i]=ss_get(ss_slot,16+ss_pos++);
 }
 P[4]=ss_failed?25:0;
}


