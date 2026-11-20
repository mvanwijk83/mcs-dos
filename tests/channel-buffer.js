// Read-ahead must reduce IEC selections without losing EOF or channel ownership.
require('./setup');
const fs = require('fs'), {functions} = require('./source');
const source = fs.readFileSync('src/c64-support.c', 'utf8');
const state = source.slice(source.indexOf('typedef struct ChannelReadBuffer'), source.indexOf('void channel_buffer('));
const cart = fs.readFileSync('src/cart.c', 'utf8');
const close = cart.slice(cart.indexOf('void channel_close('), cart.indexOf('/* Discard a pending'));
fs.writeFileSync('build/test-channel-buffer.c', `
#define CART_CHANNEL_COUNT 6
#define KRNIO_OK 0
#define KRNIO_EOF 64
#define CART_CLOSE 1
static unsigned char cart_channels[6],krnio_pstatus[16];
static unsigned int lengths[16],positions[16],reads[16];
static unsigned char failed;
static unsigned char krnio_open(char f,char d,char s){positions[f]=0;return 1;}
static void krnio_setnam(const char *n){}
static void krnio_close(char f){}
static void call(unsigned char op,char f){}
static unsigned char cart_open(char f,char s,const char *n){return 0;}
static int cart_read(char f,void *p,unsigned int n){return -1;}
static int krnio_read(char f,char *p,unsigned int n){
    unsigned int i=0;++reads[f];if(failed)return -1;
    while(i<n&&positions[f]<lengths[f])p[i++]=(positions[f]++ + f)&255;
    if(positions[f]==lengths[f])krnio_pstatus[f]=KRNIO_EOF;
    return i;
}
${state}
${functions('channel_buffer','channel_open','channel_read')}
${close}
int main(void){
    unsigned char c,block[300];unsigned int i;
    lengths[4]=1001;channel_open(4,11,0,"$");channel_buffer(4,1);
    for(i=0;i<1001;++i)if(channel_read(4,&c,1)!=1||c!=((i+4)&255))return 1;
    if(reads[4]!=8||channel_read(4,&c,1)!=0||reads[4]!=8)return 2;
    lengths[4]=256;reads[4]=0;channel_open(4,11,0,"$");channel_buffer(4,1);
    if(channel_read(4,block,300)!=256||reads[4]!=2)return 3;
    lengths[4]=lengths[6]=300;
    channel_open(4,11,0,"$");channel_buffer(4,1);
    channel_open(6,11,0,"$");channel_buffer(6,1);
    if(channel_read(4,&c,1)!=1||c!=4||channel_read(6,&c,1)!=1||c!=6)return 4;
    channel_close(6);channel_open(6,11,0,"$");channel_buffer(6,1);
    if(channel_read(6,&c,1)!=1||c!=6||channel_read(4,&c,1)!=1||c!=5)return 5;
    channel_close(4);if(readbuffers[0].active)return 6;
    reads[4]=0;channel_open(4,11,0,"$");
    if(channel_read(4,&c,1)!=1||c!=4||reads[4]!=1||positions[4]!=1)return 7;
    failed=1;channel_buffer(4,1);if(channel_read(4,&c,1)!=-1)return 8;
    return 0;
}
`);
require('./simulator')('build/test-channel-buffer.c');
console.log('PASS read-ahead: 1001 byte reads use 8 IEC reads; EOF, reopen, close, errors and independent lookup/listing streams');
