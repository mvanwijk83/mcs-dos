#ifndef MCS_CORE_H
#define MCS_CORE_H
/* Persistent state and the shell API. Banked services use the resident gates
 * declared here; bank_ implementations are private to their module/gate. */
#include "c64-support.h"

#include "cart.h"
#include "banking.h"
#include "session.h"
extern unsigned char resume_requested;
#include <conio.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <stdarg.h>
#include <time.h>

/* 64 command characters plus terminator. */
#define LINE 65
#define MAXARGS 33
#define ENVVALUE 32
#define ENVSIZE 512
#define VERSION "2.0"
#include "sysout.h"

#define MAXFILES 296
#define EDITROWS 24
#define BATCHMAX 2048

typedef struct Path {
    unsigned char dev;
    char name[17];
} Path;
typedef struct Entry {
    char name[17];
    unsigned int blocks;
    unsigned char type;
} Entry;

extern Entry directory_entries[MAXFILES];
extern unsigned int count;
extern unsigned char cachedev, cachevalid, drive;
extern unsigned int freeblocks;
extern char volume[17], diskid[3];
extern unsigned char ox, oy, fg, bg, bd, quit, reboot, echoon, batching;
extern volatile unsigned char skipautoexec;
extern unsigned char copysuppress;
extern unsigned char pagelines, aborted, editprompt;
extern unsigned int screenbase;
extern char environment[ENVSIZE];
extern unsigned int envused;
extern unsigned char envready;
extern char line[LINE], history[10][LINE], draft[LINE];
extern char prompttext[ENVVALUE + 1];
#define RAWMAP ((LINE + 7) / 8)
extern unsigned char rawline[RAWMAP], rawhistory[10][RAWMAP], rawdraft[RAWMAP];
extern unsigned char rawparse[(LINE + MAXARGS + 7) / 8];
extern unsigned char histcount, histnext;
extern char fmtbuf[160], statusbuf[64];
#define diskcmd fmtbuf
extern unsigned char io[256];
extern unsigned char eof[16];
extern unsigned char cmddev[2], cmdslot;
extern unsigned char headertrack, labeloff, idoff, disktracks;
extern char batch[BATCHMAX + 1];
extern char workspace[EDITROWS * 40];
#define editbuf workspace
extern unsigned int batchpos, batchlen;
extern char *args[MAXARGS];
extern char parsebuf[LINE + MAXARGS];
extern unsigned char argc;
extern unsigned char argquoted[MAXARGS];
extern Path p1, p2;
extern Path outputpath;
extern unsigned char redirected, outputfailed, outputused, outputcol;
extern unsigned char outputbuf[128];
extern char launchname[17];
extern unsigned char launchdevice, launchlength, launchabsolute;
extern unsigned int launchaddress;
extern unsigned char noseparators, validate;
extern const char *const commands[29];
#define COMMANDCOUNT 29
void launch(void);
void charset_prepare(void);
void charset_commit(void);
void charset_enable(void);
void charset_default(void);
void charset_scroll(void);
unsigned int splash_nmi_address(void);
void clear(void);
void newline(void);
void displayc(unsigned char c);
void outc(unsigned char c);
void outs(const char *s);
void say(const char *s);
void error(const char *s);
void outputflush(void);
void outputbyte(unsigned char c);
void print(const char *s, ...);
void colors(void);
char * decimal(unsigned long bytes);
char * allocated(unsigned int blocks);
void volumeheader(unsigned char dev);
void caret_hide(void);
void caret_init(void);
void caret_show(unsigned char x, unsigned char y);
unsigned char stop(void);
void editstatus(void);
void editsaving(void);
unsigned char yesno(const char *s);
unsigned char page(void);
void uppername(const char *s, char *d);
unsigned char rawget(const unsigned char *map, unsigned char pos);
void rawset(unsigned char *map, unsigned char pos, unsigned char value);
void rawedit(unsigned char pos, unsigned char len, unsigned char deleting);
void filename(const char *s, char *d);
char * envget(const char *name);
unsigned char dosdrives(void);
const char * drivename(unsigned char dev);
void showprompt(void);
unsigned char diroption(const char *s, unsigned char *flags);
unsigned char dirdefaults(const char *s, unsigned char *flags);
unsigned char charsetname(const char *s);
void setcmd(const char *s);
unsigned char path(const char *s, Path *p);
unsigned char statuschannel(unsigned char dev);
unsigned char diskstatus(unsigned char dev, unsigned char report);
int readio(unsigned char lfn, void *buf, unsigned int size);
void startupprompt(void);
void startupcolor(void);
void startupcharset(unsigned char device);
unsigned char command(unsigned char dev, const char *s);
unsigned char directory(unsigned char dev);
int findfile(const Path *p);
unsigned char match(const char *p, const char *s);
const char * typename(unsigned char t);
unsigned char scratch(const Path *p);
unsigned char preparewrite(const Path *p);
unsigned char openreadtype(const Path *p, unsigned char lfn, unsigned char type);
unsigned char openread(const Path *p, unsigned char lfn);
unsigned char openwrite(const Path *p, unsigned char type);
unsigned char input(char *buf, unsigned int max, unsigned char recall);
void dircmd(void);
void copycmd(unsigned char moving);
void typecmd(unsigned char printer);
void findcmd(void);
void editcmd(void);
void runbatch(void);
void runcmd(void);
unsigned char blockio(unsigned char dev, unsigned char track, unsigned char sector,
                             unsigned char writing);
unsigned char rawopen(unsigned char dev);
unsigned char drivetype(unsigned char dev, unsigned char report);
unsigned char tracksectors(unsigned char track, unsigned char tracks);
unsigned char bam(unsigned char dev);
unsigned char copyrel(void);
unsigned char reportoptions(unsigned char disk);
unsigned int freememory(void);
void memcmd(void);
void delcmd(void);
void volcmd(unsigned char stats);
void labelcmd(void);
void formatcmd(void);
void diskidcmd(void);
void diskcopycmd(void);
void attribcmd(void);
int commandid(const char *s);
void help(int id);
unsigned char tokenize(char *s);
void executecommand(char *s);
void execute(char *s);
void bootsplash(unsigned char wait);
void renamecmd(void);

unsigned char bootstart(unsigned char startdrive);
unsigned char typeoptions(unsigned char *mode, unsigned long *limit);
#endif
