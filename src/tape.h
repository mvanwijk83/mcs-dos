#ifndef MCS_TAPE_H
#define MCS_TAPE_H
/* Private handoff bytes, outside the session token ($C1E0..$C1E6). */
#define TAPE_RESULT (*(volatile unsigned char *)0xc1e8)
#define TAPE_DEVICE (*(volatile unsigned char *)0xc1e9)
#define TAPE_LABEL ((char *)0xc1ea)
#define TAPE_PENDING (*(volatile unsigned char *)0xc1ee)
#define TAPE_SEARCH ((char *)0xc610)
#define TAPE_SAVED 1
#define TAPE_CANCELLED 2
#define TAPE_READ_ERROR 3
#define TAPE_TOO_LARGE 4
#define TAPE_WRITE_ERROR 5
#define TAPE_END 6
#define TAPE_UNSUPPORTED 7
#define TAPE_CLEANUP_ERROR 8
#define TAPE_DISK_ERROR 9
#define TAPE_BANK 11
#define TAPE_BUFFER 0x1000U
#define TAPE_LIMIT 0xc000U
void tapecopycmd(void);
void tapecopy_report(void);
#endif
