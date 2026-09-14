/* C64 screen and disk services used by MCS-DOS. */
#ifndef MCS_C64_SUPPORT_H
#define MCS_C64_SUPPORT_H

#include <conio.h>
#include <c64/kernalio.h>
#include <stdarg.h>

#define PEEK(a) (*(volatile unsigned char *)(a))
#define POKE(a, v) (*(volatile unsigned char *)(a) = (v))
#define CH_STOP 3
#define CH_ENTER 13
#define CH_CURS_UP 145
#define CH_CURS_DOWN 17
#define CH_CURS_LEFT 157
#define CH_CURS_RIGHT 29
#define CH_HOME 19
#define CH_DEL 20
#define CH_INS 148
#define CBM_T_DEL 0
#define CBM_T_OTHER 4
#define CBM_T_SEQ 16
#define CBM_T_PRG 17
#define CBM_T_USR 18
#define CBM_T_REL 19

#define CBM_A_RO 1
#define CBM_A_RW 3
struct DirectoryEntry {
    char name[17];
    unsigned int size;
    unsigned char type, access;
};

char *strpbrk(const char *s, const char *accept);
int stricmp(const char *a, const char *b);
int strnicmp(const char *a, const char *b, unsigned int n);

/* Screen RAM output preserves PETSCII glyphs and never invokes ROM scrolling. */
void screen_reverse(unsigned char r);
void screen_putc(unsigned char c);
void screen_puts(const char *s);
void screen_clear(unsigned char n);

/* Open returns zero on success. The caller owns closing the logical file.
 * Reads/writes return byte counts, or a negative value if selection fails. */
unsigned char channel_open(char f, char d, char s, const char *n);
int channel_read(char f, void *p, unsigned int n);
int channel_write(char f, const void *p, unsigned int n);
unsigned char directory_open(char f, char d);
/* Directory reads return 0 for an entry, 1 for an error and 2 at the end. */
unsigned char directory_read(char f, struct DirectoryEntry *e);

/* Bounded formatting: %s, %u, %c, %% and optional left/right field widths. */
int vsnprintf(char *dst, unsigned int cap, const char *fmt, va_list ap);
int snprintf(char *dst, unsigned int cap, const char *fmt, ...);

#pragma compile("c64-support.c")
#endif
