// Rebuild: clang --target=wasm32-unknown-unknown -O3 -nostdlib -Wl,--no-entry -Wl,--export=initialize -Wl,--export=params_ptr -Wl,--export=search -Wl,--export-memory -Wl,--initial-memory=131072 src/key_search.c -o src/key_search.wasm
#include <stdint.h>

// params: [0..16) AES-128 key, [16..32) raw IV, [32..48) base block.
static uint8_t sbox[256], params_buffer[48];
static uint32_t te0[256],te1[256],te2[256],te3[256],rk[44];
// Per-key invariants: the AES input is raw_iv ^ (k repeated), so the first AddRoundKey
// collapses to pre[i] ^ k. The candidate's little-endian header words are the byte-reversed
// block, i.e. word i of (iv ^ base) read big-endian, so the last round key and base block fold into fin[].
static uint32_t pre[4], fin[4];
static uint8_t mul(uint8_t a,uint8_t b){uint8_t r=0;while(b){if(b&1)r^=a;a=(uint8_t)((a<<1)^((a&128)?27:0));b>>=1;}return r;}
static uint8_t rot8(uint8_t x,unsigned n){return(uint8_t)((x<<n)|(x>>(8-n)));}
static uint8_t inv(uint8_t x){if(!x)return 0;uint8_t r=1,a=x;unsigned e=254;while(e){if(e&1)r=mul(r,a);a=mul(a,a);e>>=1;}return r;}
static uint32_t be32(const uint8_t*p){return((uint32_t)p[0]<<24)|((uint32_t)p[1]<<16)|((uint32_t)p[2]<<8)|p[3];}
static void setup(const uint8_t*k){for(unsigned i=0;i<256;i++){uint8_t y=inv(i);y=(uint8_t)(y^rot8(y,1)^rot8(y,2)^rot8(y,3)^rot8(y,4)^99);sbox[i]=y;uint8_t a=mul(y,2),b=(uint8_t)(a^y);te0[i]=((uint32_t)a<<24)|((uint32_t)y<<16)|((uint32_t)y<<8)|b;te1[i]=((uint32_t)b<<24)|((uint32_t)a<<16)|((uint32_t)y<<8)|y;te2[i]=((uint32_t)y<<24)|((uint32_t)b<<16)|((uint32_t)a<<8)|y;te3[i]=((uint32_t)y<<24)|((uint32_t)y<<16)|((uint32_t)b<<8)|a;}
for(unsigned i=0;i<4;i++)rk[i]=be32(k+4*i);uint8_t rc=1;for(unsigned i=4;i<44;i++){uint32_t t=rk[i-1];if(!(i&3)){t=(t<<8)|(t>>24);t=((uint32_t)sbox[t>>24]<<24)|((uint32_t)sbox[(t>>16)&255]<<16)|((uint32_t)sbox[(t>>8)&255]<<8)|sbox[t&255];t^=(uint32_t)rc<<24;rc=mul(rc,2);}rk[i]=rk[i-4]^t;}}
__attribute__((visibility("default"))) void initialize(const uint8_t*p){setup(p);for(unsigned i=0;i<4;i++){pre[i]=be32(p+16+4*i)^rk[i];fin[i]=be32(p+32+4*i)^rk[40+i];}}
__attribute__((visibility("default"))) uint32_t params_ptr(void){return(uint32_t)(uintptr_t)params_buffer;}
// Final AES round for one output column, already XORed with the base block.
static inline uint32_t last(uint32_t a,uint32_t b,uint32_t c,uint32_t d,uint32_t f){return(((uint32_t)sbox[a>>24]<<24)|((uint32_t)sbox[(b>>16)&255]<<16)|((uint32_t)sbox[(c>>8)&255]<<8)|sbox[d&255])^f;}
static inline int thumb(uint32_t v,int flash_ok){uint32_t t=v&~1u;return(v&1)&&v!=1&&(t<0x40000u||(flash_ok&&t-0x10000000u<0x100000u));}
__attribute__((visibility("default"))) int64_t search(uint32_t start,uint32_t stride,uint32_t count){
  const uint32_t p0=pre[0],p1=pre[1],p2=pre[2],p3=pre[3];uint32_t k=start,hi=~start>>8,h0=0,h1=0,h2=0,h3=0;
  for(uint32_t n=0;n<count;n++,k+=stride){
    // Round 1: only the te3 lookup in each column depends on the key's low byte, so the other
    // three lookups are cached per 256-key block of a sequential search.
    if((k>>8)!=hi){hi=k>>8;uint32_t s0=p0^k,s1=p1^k,s2=p2^k,s3=p3^k;
      h0=te0[s0>>24]^te1[(s1>>16)&255]^te2[(s2>>8)&255]^rk[4];h1=te0[s1>>24]^te1[(s2>>16)&255]^te2[(s3>>8)&255]^rk[5];
      h2=te0[s2>>24]^te1[(s3>>16)&255]^te2[(s0>>8)&255]^rk[6];h3=te0[s3>>24]^te1[(s0>>16)&255]^te2[(s1>>8)&255]^rk[7];}
    const uint32_t lo=k&255;
    uint32_t s0=h0^te3[(p3^lo)&255],s1=h1^te3[(p0^lo)&255],s2=h2^te3[(p1^lo)&255],s3=h3^te3[(p2^lo)&255];
    for(unsigned r=2;r<10;r++){uint32_t a=te0[s0>>24]^te1[(s1>>16)&255]^te2[(s2>>8)&255]^te3[s3&255]^rk[4*r],b=te0[s1>>24]^te1[(s2>>16)&255]^te2[(s3>>8)&255]^te3[s0&255]^rk[4*r+1],c=te0[s2>>24]^te1[(s3>>16)&255]^te2[(s0>>8)&255]^te3[s1&255]^rk[4*r+2],d=te0[s3>>24]^te1[(s0>>16)&255]^te2[(s1>>8)&255]^te3[s2&255]^rk[4*r+3];s0=a;s1=b;s2=c;s3=d;}
    // Initial SP first: it rejects almost every candidate, so the other three columns are rarely computed.
    uint32_t sp=last(s3,s0,s1,s2,fin[3]);
    if((sp&3)||((sp-0x18000000u)>=0x40000u&&(sp-0x20000000u)>=0x40000u))continue;
    if(!thumb(last(s2,s3,s0,s1,fin[2]),0))continue;
    if(!thumb(last(s1,s2,s3,s0,fin[1]),1)||!thumb(last(s0,s1,s2,s3,fin[0]),1))continue;
    return(int64_t)k;
  }
  return-1;
}
