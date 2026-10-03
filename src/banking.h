#ifndef MCS_BANKING_H
#define MCS_BANKING_H

#define BANK_EDIT 5
#define BANK_FILEUTIL 6
#define BANK_FILEMGMT 7
#define BANK_DISK 8
#define BANK_BOOT 9
#define BANK_NONE 255
/* Shared with the low-RAM filesystem bridge. Hardware bank registers cannot
 * be read back. This byte describes the caller's mapping, even during I/O. */
#define BANK_CURRENT (*(volatile unsigned char *)0x07f5)

unsigned char bank_enter(unsigned char bank);
void bank_leave(unsigned char bank);

#endif
