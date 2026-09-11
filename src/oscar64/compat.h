/* Experimental cc65 API adapter for Oscar64. Only the APIs used by MCS-DOS. */
#include <conio.h>
#include <c64/kernalio.h>
#include <stdio.h>
#include <string.h>
#include <ctype.h>
typedef const char * StringPtr;
static int stricmp(const char *a,const char *b) {
    while(*a && toupper(*a)==toupper(*b)) { ++a; ++b; }
    return (int)(unsigned char)toupper(*a)-(unsigned char)toupper(*b);
}
static int strnicmp(const char *a,const char *b,unsigned int n) {
    while(n && *a && toupper(*a)==toupper(*b)) { ++a; ++b; --n; }
    return n?(int)(unsigned char)toupper(*a)-(unsigned char)toupper(*b):0;
}
#pragma region(main, 0x0a00, 0xd000, , , {code, data, bss, heap, stack})
#pragma stacksize(2048)
/* The shell has no dynamic allocations. */
#pragma heapsize(0)
extern void BSSEnd;
#define PEEK(a) (*(volatile unsigned char *)(a))
#define POKE(a,v) (*(volatile unsigned char *)(a)=(v))
#define CH_STOP 3
#define CH_ENTER 13
#define CH_CURS_UP 145
#define CH_CURS_DOWN 17
#define CH_CURS_LEFT 157
#define CH_CURS_RIGHT 29
#define CH_HOME 19
#define CH_DEL 20
#define CH_INS 148
#define CBM_T_SEQ 16
#define CBM_T_PRG 17
#define CBM_T_USR 18
#define CBM_T_REL 19
#define cursor textcursor
#define cgetc getch
static unsigned char reverse_mask;
static void screen_reverse(unsigned char r) { reverse_mask=r?128:0; }
#define revers screen_reverse
/* cc65 conio writes screen RAM directly, without KERNAL scrolling/control codes. */
static void cputc(unsigned char c) {
    unsigned char x=wherex(), y=wherey();
    unsigned int p=40U*y+x;
    if(c<32) c+=128;
    else if(c<64) {}
    else if(c<96) c-=64;
    else if(c<128) c-=32;
    else if(c<160) c+=64;
    else if(c<192) c-=64;
    else c-=128;
    POKE((unsigned int)PEEK(648)*256+p,c|reverse_mask); POKE(0xd800+p,PEEK(646));
    if(++x==40) { x=0; if(y<24) ++y; }
    gotoxy(x,y);
}
static void cputs(const char *s) { while(*s) cputc(*s++); }
static void cclear(unsigned char n) { while(n--) cputc(' '); }
static unsigned char cbm_open(char f,char d,char s,const char *n) {
    krnio_setnam(n); return krnio_open(f,d,s)?0:1;
}
#define cbm_close krnio_close
#define cbm_closedir krnio_close
static int cbm_read(char f,void *p,unsigned int n) {
    /* The shell owns EOF state and resets it after a U1 block command. */
    krnio_pstatus[f]=KRNIO_OK;
    return krnio_read(f,(char *)p,n);
}
static int cbm_write(char f,const void *p,unsigned int n) {
    unsigned int i=0; const char *s=p;
    if(!krnio_chkout(f)) return -1;
    while(i<n) { if(!krnio_chrout(s[i]) || krnio_status()) break; ++i; }
    krnio_clrchn(); return i;
}
struct cbm_dirent { char name[17]; unsigned int size; unsigned char type; };
static unsigned char cbm_opendir(char f,char d) {
    char address[2];
    if(cbm_open(f,d,0,"$")) return 1;
    return cbm_read(f,address,2)!=2;
}
static unsigned char cbm_readdir(char f,struct cbm_dirent *e) {
    unsigned char h[4], c, n=0, quoted=0, seen=0, t=0;
    if(cbm_read(f,h,4)!=4) return 1;
    e->size=h[2]|((unsigned int)h[3]<<8); e->name[0]=0; e->type=0;
    do {
        if(cbm_read(f,&c,1)!=1) return 1;
        if(c=='"') { quoted=!quoted; seen=1; }
        else if(quoted) { if(n<16) e->name[n++]=c; }
        else if(seen && !t && c!=' ' && c!='*') t=c;
    } while(c);
    e->name[n]=0;
    while(n && e->name[n-1]==' ') e->name[--n]=0;
    if(!seen) return 2;
    if(t==0x50) e->type=CBM_T_PRG;
    else if(t==0x53) e->type=CBM_T_SEQ;
    else if(t==0x55) e->type=CBM_T_USR;
    else if(t==0x52) e->type=CBM_T_REL;
    return 0;
}
/* Bounded formatter for the shell's %s, %u, %c and field widths. */
static int vsnprintf(char *dst,unsigned int cap,const char *fmt,va_list ap) {
    unsigned int total=0,width,len,i; unsigned char left,c;
    char num[6],ch; const char *s;
    while((c=*fmt++)) {
        if(c!='%') { if(total+1<cap) dst[total]=c; ++total; continue; }
        left=0; width=0;
        if(*fmt=='-') { left=1; ++fmt; }
        while(*fmt>='0' && *fmt<='9') width=width*10+*fmt++-'0';
        c=*fmt++;
        if(c=='s') { s=va_arg(ap,StringPtr); len=strlen(s); }
        else if(c=='u') {
            unsigned int v=va_arg(ap,unsigned int); i=5; num[i]=0;
            do { num[--i]='0'+v%10; v/=10; } while(v);
            s=num+i; len=5-i;
        } else { ch=c=='c'?(char)(va_arg(ap,int)):c; s=&ch; len=1; }
        if(!left) while(width>len) { if(total+1<cap) dst[total]=' '; ++total; --width; }
        for(i=0;i<len;++i) { if(total+1<cap) dst[total]=s[i]; ++total; }
        if(left) while(width>len) { if(total+1<cap) dst[total]=' '; ++total; --width; }
    }
    if(cap) dst[total<cap?total:cap-1]=0;
    return total;
}
static int snprintf(char *dst,unsigned int cap,const char *fmt,...) {
    va_list ap; int n; va_start(ap,fmt); n=vsnprintf(dst,cap,fmt,ap); va_end(ap); return n;
}
