require('./setup');
const fs=require('fs'),{functions}=require('./source');
fs.writeFileSync('build/test-wildcard-match.c',`
#include <stdio.h>
#include <string.h>
${functions('match')}
/* Independent backtracking reference preserves the existing byte-for-byte
 * shell wildcard rules while production uses an iterative matcher. */
static unsigned char reference(const char *p,const char *s){
    if(!*p)return !*s;
    if(*p=='*')return reference(p+1,s)||(*s&&reference(p,s+1));
    return *s&&(*p=='?'||*p==*s)&&reference(p+1,s+1);
}
int main(void){
    char pattern[6],name[6];unsigned int p,n,code;unsigned char i,len;
    for(p=0;p<1365;++p){
        code=p;len=0;while(code){pattern[len++]="AB*?"[(code-1)%4];code=(code-1)/4;}pattern[len]=0;
        for(n=0;n<63;++n){code=n;len=0;while(code){name[len++]='A'+(code-1)%2;code=(code-1)/2;}name[len]=0;
            if(match(pattern,name)!=reference(pattern,name))return 1;
        }
    }
    puts("PASS 85,995 wildcard cases against independent reference");return 0;
}
`);
require('./simulator')('build/test-wildcard-match.c');
