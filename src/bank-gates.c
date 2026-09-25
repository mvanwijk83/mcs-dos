#include "core.h"
/* Typed resident gates: one linked program shares stack/register allocation. */
__noinline void bank_editstatus(void);
__noinline void editstatus(void)
{
    unsigned char previous=bank_enter(BANK_EDIT);
    bank_editstatus();
    bank_leave(previous);
}

__noinline void bank_editsaving(void);
__noinline void editsaving(void)
{
    unsigned char previous=bank_enter(BANK_EDIT);
    bank_editsaving();
    bank_leave(previous);
}

__noinline void bank_editcmd(void);
__noinline void editcmd(void)
{
    unsigned char previous=bank_enter(BANK_EDIT);
    bank_editcmd();
    bank_leave(previous);
}

__noinline void bank_typecmd(unsigned char printer);
__noinline void typecmd(unsigned char printer)
{
    unsigned char previous=bank_enter(BANK_FILEUTIL);
    bank_typecmd(printer);
    bank_leave(previous);
}

__noinline void bank_findcmd(void);
__noinline void findcmd(void)
{
    unsigned char previous=bank_enter(BANK_FILEUTIL);
    bank_findcmd();
    bank_leave(previous);
}

__noinline void bank_runcmd(void);
__noinline void runcmd(void)
{
    unsigned char previous=bank_enter(BANK_FILEUTIL);
    bank_runcmd();
    bank_leave(previous);
}

__noinline void bank_help(int id);
__noinline void help(int id)
{
    unsigned char previous=bank_enter(BANK_FILEUTIL);
    bank_help(id);
    bank_leave(previous);
}

__noinline void bank_dircmd(void);
__noinline void dircmd(void)
{
    unsigned char previous=bank_enter(BANK_FILEMGMT);
    bank_dircmd();
    bank_leave(previous);
}

__noinline void bank_copycmd(unsigned char moving);
__noinline void copycmd(unsigned char moving)
{
    unsigned char previous=bank_enter(BANK_FILEMGMT);
    bank_copycmd(moving);
    bank_leave(previous);
}

__noinline void bank_delcmd(void);
__noinline void delcmd(void)
{
    unsigned char previous=bank_enter(BANK_FILEMGMT);
    bank_delcmd();
    bank_leave(previous);
}

__noinline void bank_attribcmd(void);
__noinline void attribcmd(void)
{
    unsigned char previous=bank_enter(BANK_FILEMGMT);
    bank_attribcmd();
    bank_leave(previous);
}

__noinline void bank_renamecmd(void);
__noinline void renamecmd(void)
{
    unsigned char previous=bank_enter(BANK_FILEMGMT);
    bank_renamecmd();
    bank_leave(previous);
}

__noinline unsigned char bank_blockio(unsigned char dev, unsigned char track, unsigned char sector,
                                unsigned char writing);
__noinline unsigned char blockio(unsigned char dev, unsigned char track, unsigned char sector,
                                unsigned char writing)
{
    unsigned char previous=bank_enter(BANK_DISK);
    unsigned char result=bank_blockio(dev,track,sector,writing);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_rawopen(unsigned char dev);
__noinline unsigned char rawopen(unsigned char dev)
{
    unsigned char previous=bank_enter(BANK_DISK);
    unsigned char result=bank_rawopen(dev);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_drivetype(unsigned char dev, unsigned char report);
__noinline unsigned char drivetype(unsigned char dev, unsigned char report)
{
    unsigned char previous=bank_enter(BANK_DISK);
    unsigned char result=bank_drivetype(dev,report);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_tracksectors(unsigned char track, unsigned char tracks);
__noinline unsigned char tracksectors(unsigned char track, unsigned char tracks)
{
    unsigned char previous=bank_enter(BANK_DISK);
    unsigned char result=bank_tracksectors(track,tracks);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_bam(unsigned char dev);
__noinline unsigned char bam(unsigned char dev)
{
    unsigned char previous=bank_enter(BANK_DISK);
    unsigned char result=bank_bam(dev);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_copyrel(void);
__noinline unsigned char copyrel(void)
{
    unsigned char previous=bank_enter(BANK_DISK);
    unsigned char result=bank_copyrel();
    bank_leave(previous);
    return result;
}

__noinline void bank_volcmd(unsigned char stats);
__noinline void volcmd(unsigned char stats)
{
    unsigned char previous=bank_enter(BANK_DISK);
    bank_volcmd(stats);
    bank_leave(previous);
}

__noinline void bank_labelcmd(void);
__noinline void labelcmd(void)
{
    unsigned char previous=bank_enter(BANK_DISK);
    bank_labelcmd();
    bank_leave(previous);
}

__noinline void bank_formatcmd(void);
__noinline void formatcmd(void)
{
    unsigned char previous=bank_enter(BANK_DISK);
    bank_formatcmd();
    bank_leave(previous);
}

__noinline void bank_diskidcmd(void);
__noinline void diskidcmd(void)
{
    unsigned char previous=bank_enter(BANK_DISK);
    bank_diskidcmd();
    bank_leave(previous);
}

__noinline void bank_diskcopycmd(void);
__noinline void diskcopycmd(void)
{
    unsigned char previous=bank_enter(BANK_DISK);
    bank_diskcopycmd();
    bank_leave(previous);
}

__noinline void bank_startupprompt(void);
__noinline void startupprompt(void)
{
    unsigned char previous=bank_enter(BANK_BOOT);
    bank_startupprompt();
    bank_leave(previous);
}

__noinline void bank_startupcolor(void);
__noinline void startupcolor(void)
{
    unsigned char previous=bank_enter(BANK_BOOT);
    bank_startupcolor();
    bank_leave(previous);
}

__noinline void bank_startupcharset(unsigned char device);
__noinline void startupcharset(unsigned char device)
{
    unsigned char previous=bank_enter(BANK_BOOT);
    bank_startupcharset(device);
    bank_leave(previous);
}

__noinline void bank_bootsplash(unsigned char wait);
__noinline void bootsplash(unsigned char wait)
{
    unsigned char previous=bank_enter(BANK_BOOT);
    bank_bootsplash(wait);
    bank_leave(previous);
}

__noinline unsigned char bank_input(char *buf, unsigned int max, unsigned char recall);
__noinline unsigned char input(char *buf, unsigned int max, unsigned char recall)
{
    unsigned char previous=bank_enter(BANK_EDIT);
    unsigned char result=bank_input(buf,max,recall);
    bank_leave(previous);
    return result;
}

__noinline void bank_rawedit(unsigned char pos, unsigned char len, unsigned char deleting);
__noinline void rawedit(unsigned char pos, unsigned char len, unsigned char deleting)
{
    unsigned char previous=bank_enter(BANK_EDIT);
    bank_rawedit(pos,len,deleting);
    bank_leave(previous);
    
}

__noinline void bank_setcmd(const char *s);
__noinline void setcmd(const char *s)
{
    unsigned char previous=bank_enter(BANK_BOOT);
    bank_setcmd(s);
    bank_leave(previous);
    
}

__noinline unsigned char bank_bootstart(unsigned char startdrive);
__noinline unsigned char bootstart(unsigned char startdrive)
{
    unsigned char previous=bank_enter(BANK_BOOT);
    unsigned char result=bank_bootstart(startdrive);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_directory(unsigned char dev);
__noinline unsigned char directory(unsigned char dev)
{
    unsigned char previous=bank_enter(BANK_FILEMGMT);
    unsigned char result=bank_directory(dev);
    bank_leave(previous);
    return result;
}

__noinline int bank_findfile(const Path *p);
__noinline int findfile(const Path *p)
{
    unsigned char previous=bank_enter(BANK_FILEMGMT);
    int result=bank_findfile(p);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_preparewrite(const Path *p);
__noinline unsigned char preparewrite(const Path *p)
{
    unsigned char previous=bank_enter(BANK_FILEMGMT);
    unsigned char result=bank_preparewrite(p);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_openreadtype(const Path *p, unsigned char lfn, unsigned char type);
__noinline unsigned char openreadtype(const Path *p, unsigned char lfn, unsigned char type)
{
    unsigned char previous=bank_enter(BANK_FILEMGMT);
    unsigned char result=bank_openreadtype(p,lfn,type);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_openread(const Path *p, unsigned char lfn);
__noinline unsigned char openread(const Path *p, unsigned char lfn)
{
    unsigned char previous=bank_enter(BANK_FILEMGMT);
    unsigned char result=bank_openread(p,lfn);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_openwrite(const Path *p, unsigned char type);
__noinline unsigned char openwrite(const Path *p, unsigned char type)
{
    unsigned char previous=bank_enter(BANK_FILEMGMT);
    unsigned char result=bank_openwrite(p,type);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_scratch(const Path *p);
__noinline unsigned char scratch(const Path *p)
{
    unsigned char previous=bank_enter(BANK_FILEMGMT);
    unsigned char result=bank_scratch(p);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_diroption(const char *s, unsigned char *flags);
__noinline unsigned char diroption(const char *s, unsigned char *flags)
{
    unsigned char previous=bank_enter(BANK_FILEMGMT);
    unsigned char result=bank_diroption(s,flags);
    bank_leave(previous);
    return result;
}

__noinline unsigned char bank_dirdefaults(const char *s, unsigned char *flags);
__noinline unsigned char dirdefaults(const char *s, unsigned char *flags)
{
    unsigned char previous=bank_enter(BANK_FILEMGMT);
    unsigned char result=bank_dirdefaults(s,flags);
    bank_leave(previous);
    return result;
}
