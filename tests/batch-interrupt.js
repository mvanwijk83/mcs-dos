require('./setup');
const fs=require('fs'), {functions}=require('./source');
fs.writeFileSync('build/test-batch-interrupt.c', `
#include <string.h>
#include <ctype.h>
#define CH_STOP 3
static unsigned char batching,batchstop,aborted,editprompt;
static unsigned char key,questions;
static char output[100];
static int getch(void) {return key;}
static void editstatus(void) {}
static void consoleout(const char *s) {strcat(output,s);}
static void consolec(unsigned char c) {unsigned char n=strlen(output);output[n]=c;output[n+1]=0;}
static void consoleline(void) {++questions;}
${functions('shell_getch', 'yesno', 'batchcheck')}
int main(void) {
    key=CH_STOP;shell_getch();if(batchstop)return 1;
    batching=1;shell_getch();if(!batchstop)return 2;
    aborted=1;key='n';batchcheck();
    if(!batching||batchstop||aborted||questions!=1)return 3;
    if(strcmp(output,"Terminate batch job (Y/N)? N"))return 4;
    batchcheck();if(questions!=1)return 5;
    key=CH_STOP;shell_getch();key='y';batchcheck();
    if(batching||batchstop||questions!=2)return 6;
    batching=1;batchstop=1;key=CH_STOP;batchcheck();
    if(!batching||batchstop||questions!=3)return 7;
    batchcheck();if(questions!=3)return 8;
    return 0;
}
`);
require('./simulator')('build/test-batch-interrupt.c');
console.log('PASS batch RUN/STOP tracking, exact prompt, Y termination, N/STOP continuation and no repeated prompt');
