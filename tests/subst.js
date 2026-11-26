// Production resolver and handler, with controlled physical bus/directory I/O.
require('./setup');
const fs = require('fs'), {functions, header} = require('./source');
const types = header.slice(header.indexOf('typedef struct Path'), header.indexOf('extern Substitution'));
fs.writeFileSync('build/test-subst.c', `
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include "../src/storage.h"
#include "../src/device-name.h"
#define PATHSIZE 128
${types}
static Substitution substitutions[SUBST_COUNT];
static unsigned char subst_checked[SUBST_COUNT],present[31],probes[31];
static unsigned char drive=8,argc,optionalheader,errors,invalidations;
static unsigned char subst_validating;
static char subst_error[64];
static void subst_diagnostic(const char *s);
static char working[24][128],component[17],io[256],output[1024];
static const char *args[4],*message;
static Path p1;
unsigned char location_index(unsigned char d){return d?d-7:0;}
static void error(const char *s){if(subst_validating){subst_diagnostic(s);return;}++errors;message=s;}
static void nav_invalidate(void){++invalidations;}
static unsigned char drivepresent(unsigned char d){++probes[d];return present[d];}
static unsigned char modelof(unsigned char d){return DRIVE_1581;}
static unsigned char partition_lookup(unsigned char d,const char *n,PartitionInfo *p){return 0;}
#define host_partfind(d,n,p) 0
static void uppername(const char *s,char *d){while(*s)*d++=toupper(*s++);*d=0;}
static void displaypath(unsigned char d,const char *p,char *out){uppername(p,out);}
static const char *drivename(unsigned char d){static char b[4];sprintf(b,"%u",d);return b;}
static void outs(const char *s){strcat(output,s);}
static void outc(unsigned char c){unsigned int n=strlen(output);output[n]=c;output[n+1]=0;}
static void say(const char *s){outs(s);outs("\\n");}
static unsigned char location_select(unsigned char d,const char *p){return (!d||present[d])&&!strstr(p,"missing");}
${functions('subst_diagnostic','subst_find','subst_remove','subst_begin','subst_check','subst_cwd','subst_resolve','subst_guard','subst_root','pathdir','pathdisplay')}
${functions('appendpart','canonical','path','path_join','sameplace')}
static unsigned char path_directory(Path *p){
 if(!p->name[0])return 1;
 if(strcmp(p->name,"games")&&strcmp(p->name,"sub"))return 0;
 return path_join(p);
}
${functions('subst_device','substcmd')}
${functions('target_device')}
static void run(const char *dev,const char *target){
 errors=0;output[0]=0;message="";subst_begin();
 argc=dev?3:1;args[1]=dev;args[2]=target;substcmd();
}
int main(void){
 Path p,q;char shown[128];unsigned char i,destination;
 present[8]=1;
 run("D:","8:\\\\games");if(errors||!subst_find(11)||substitutions[0].length!=5)return 1;
 if(!path("D:\\\\file",&p)||p.dev!=8||p.logical!=11||strcmp(p.dir,"games"))return 2;
 if(!target_device("D:",&destination)||destination!=11)return 45;
 if(!path("8:\\\\games\\\\file",&q)||!sameplace(&p,&q)||strcmp(p.name,q.name))return 3;
 pathdisplay(&p,shown);if(*shown)return 4;
 if(subst_guard(&p,"blocked")||strcmp(message,"blocked"))return 5;
 strcpy(working[4],"games\\\\sub");
 if(!path("D:file",&p)||strcmp(p.dir,"games\\\\sub"))return 6;
 pathdisplay(&p,shown);if(strcmp(shown,"SUB"))return 7;
 if(!path("D:..\\\\file",&p)||strcmp(p.dir,"games"))return 8;
 if(!path("D:\\\\..\\\\..\\\\file",&p)||strcmp(p.dir,"games"))return 9;
 if(!path("D:\\\\",&p)||!subst_root(&p))return 10;
 drive=11;if(!path("file",&p)||strcmp(p.dir,"games\\\\sub"))return 11;drive=8;
 if(working[1][0])return 12;
 run("E:","D:\\\\sub");if(errors||subst_find(12)->target!=8||strcmp(working[5],"games\\\\sub"))return 13;
 run("D:","/D");if(errors||subst_find(11)||!subst_find(12))return 14;
 run("E:","8:\\\\");if(!errors||strcmp(message,SYSOUT_INVALID_DRIVE_SPEC))return 15;
 run("A:","0:\\\\");if(!errors)return 16;
 run("F:","8:\\\\missing");if(!errors||strcmp(message,SYSOUT_INVALID_PATH))return 17;
 run("F:","8:\\\\file");if(!errors||strcmp(message,SYSOUT_INVALID_PATH))return 18;
 run("F:","8:\\\\*");if(!errors)return 19;
 run("31:","8:\\\\");if(!errors)return 20;
 run("0:","8:\\\\");if(!errors)return 21;
 run("F:","8:\\\\");if(errors)return 22;
 run("G:","0:\\\\");if(errors)return 23;
 run("H:","8:\\\\");if(errors)return 24;
 run("I:","8:\\\\");if(errors)return 25;
 run("J:","8:\\\\");if(!errors||strcmp(message,SYSOUT_SUBST_FULL))return 26;
 run(0,0);if(!strstr(output,"12: => 8:\\\\GAMES\\\\SUB")||!strstr(output,"14: => 0:\\\\"))return 27;
 drive=12;run("E:","/D");if(!errors||!subst_find(12))return 28;drive=8;
 run("E:","/D");if(errors||subst_find(12))return 29;
 run("E:","/D");if(!errors)return 30;
 run("D:","8:\\\\games");if(errors)return 31;
 subst_begin();memset(probes,0,sizeof(probes));
 for(i=0;i<4;++i)if(!path("D:file",&p))return 32;
 if(probes[11]!=1)return 33;
 present[11]=1;if(!path("D:file",&p)||p.dev!=8)return 34;
 subst_begin();
 if(!path("D:file",&p)||p.dev!=11||p.logical!=11||p.dir[0]||subst_find(11)||!invalidations)return 35;
 if(!subst_guard(&p,"blocked"))return 36;
 run("D:","8:\\\\games");if(!errors)return 37;
 subst_error[0]=0;subst_diagnostic(SYSOUT_DISK_ERR);subst_diagnostic("62,file not found,00,00");
 if(strcmp(subst_error,SYSOUT_INVALID_PATH))return 38;
 subst_error[0]=0;subst_diagnostic(SYSOUT_PATH_TOO_LONG);
 if(strcmp(subst_error,SYSOUT_PATH_TOO_LONG))return 39;
 run("I:","/D");if(errors)return 40;
 strcpy(working[1],"games");
 run("17:","sub");if(errors||strcmp(working[10],"games\\\\sub"))return 41;
 strcpy(working[10],"games\\\\sub\\\\deep");
 run(0,0);if(!strstr(output,"17: => 8:\\\\GAMES\\\\SUB\\n"))return 42;
 if(!path("17:\\\\..\\\\file",&p)||strcmp(p.dir,"games\\\\sub"))return 43;
 subst_find(17)->length=119;memset(working[10],'a',119);working[10][119]=0;
 if(path("17:\\\\12345678",&p)||strcmp(message,SYSOUT_PATH_TOO_LONG))return 44;
 puts("PASS five SUBST slots, identity, roots, parents, cwd, flattening, errors, listing, removal and physical takeover");
 return 0;
}
`);
require('./simulator')('build/test-subst.c', {subst: true});
