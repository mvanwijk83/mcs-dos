// Optional DIR header lookup must stay quiet and restore normal error reporting.
require('./setup');
const fs = require('fs'), {functions} = require('./source');
const harness = `
static char volume[17]="TEST", diskid[3];
static unsigned char io[256], idoff=10, ox, optionalheader, redirected;
static unsigned char ready, ids, errors, failures;
static void say(const char *s) { ++errors; }
static void outs(const char *s) {}
static void newline(void) {}
static void uppername(const char *s,char *d) { strcpy(d,s); }
static const char *drivename(unsigned char d) { return "8"; }
static void print(const char *fmt,...) { if(!strcmp(fmt,SYSOUT_DISK_ID_HEADER))++ids; }
${functions('error')}
static unsigned char bam(unsigned char d) {
    if (!ready) { ++failures; error("Unavailable ID"); return 0; }
    io[10]='m';io[11]='c';return 1;
}
${functions('volumeheader')}
int main(void) {
    volumeheader(8);
    if(errors || ids || failures!=1 || optionalheader)return 1;
    redirected=1;error("Normal error");
    if(errors!=1 || redirected!=1)return 2;
    ready=1;volumeheader(8);
    if(ids!=1 || strcmp(diskid,"MC") || optionalheader || errors!=1)return 3;
    volumeheader(0);
    if(ids!=1 || optionalheader || failures!=1)return 4;
    return 0;
}
`;
fs.writeFileSync('build/test-optional-diskid.c', harness);
require('./simulator')('build/test-optional-diskid.c');
console.log('PASS optional disk-ID failure is quiet, successful ID survives, normal errors restored');
