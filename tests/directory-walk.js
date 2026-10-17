// Traverse the production DIR /S walker with a cache replaced at every level.
require('./setup');
const fs = require('fs');
const {functions} = require('./source');
const code = `
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#define CBM_T_DIR 20
#define CBM_T_CBM 21
typedef struct Path {unsigned char dev;char name[17],dir[128];} Path;
static Path p1;
static struct Entry {char name[17];unsigned char type;unsigned int blocks;} files[8];
static unsigned int count,workspace[8],calls;
static unsigned char aborted,pagelines,cmd;
static char io[256],output[2048];
static void add(const char *s,unsigned char t,unsigned int blocks){strcpy(files[count].name,s);files[count].type=t;files[count++].blocks=blocks;}
static int location_list(unsigned char d,const char *p){
    if(++calls>30)return 0;
    count=0;
    if(cmd){
        if(!*p){add("part13",20,13);add("native",20,4);}
        else if(!strcmp(p,"@4")){add("b.txt",16,1);add("docs",20,1);}
        else if(!strcmp(p,"@4\\\\docs"))add("deep.txt",16,1);
        else if(!strcmp(p,"@13"))add("a.txt",16,1);
        else return 0;
    }else{
        if(!*p){add("root.txt",16,1);add("two",20,1);add("one",20,1);}
        else if(!strcmp(p,"one")){add(".",20,0);add("..",20,0);add("a.txt",16,1);add("b.prg",17,2);add("inner",20,1);}
        else if(!strcmp(p,"one\\\\inner"))add("deep.txt",16,1);
        else if(!strcmp(p,"two"))add("end.txt",16,1);
        else return 0;
    }
    return 1;
}
static int location_root(unsigned char d,const char *p){return cmd&&!*p;}
static int path_join(Path *p){if(*p->dir)strcat(p->dir,"\\\\");strcat(p->dir,p->name);p->name[0]=0;return 1;}
static int match(const char *p,const char *s){return !strcmp(p,"*") || (!strcmp(p,"*.txt")&&strstr(s,".txt"));}
static const char *drivename(unsigned char d){return "8";}
static const char *typename(unsigned char t){return t==16?"SEQ":"PRG";}
static int page(void){return 1;}
static int stop(void){return 0;}
static void say(const char *s){strcat(output,s);strcat(output,"\\n");}
${functions('uppername','dirwalk')}
static void reset(const char *dir,const char *pattern){strcpy(p1.dir,dir);strcpy(p1.name,pattern);calls=0;output[0]=0;}
int main(void){
    reset("","*.txt");dirwalk(0,255);
    if(strcmp(output,"8:\\\\ROOT.TXT\\n8:\\\\ONE\\\\A.TXT\\n8:\\\\ONE\\\\INNER\\\\DEEP.TXT\\n8:\\\\TWO\\\\END.TXT\\n"))return 1;
    reset("one","*");dirwalk(0,17);
    if(strcmp(output,"8:\\\\ONE\\\\B.PRG\\n"))return 2;
    cmd=1;reset("","*");dirwalk(0,255);
    if(strcmp(output,"8:\\\\@4\\\\B.TXT\\n8:\\\\@4\\\\DOCS\\\\DEEP.TXT\\n8:\\\\@13\\\\A.TXT\\n"))return 3;
    return 0;
}
`;
fs.writeFileSync('build/test-directory-walk.c', code);
require('./simulator')('build/test-directory-walk.c');
console.log('PASS recursive file paths, wildcard/type filters, parent resumption and CMD numeric roots');
