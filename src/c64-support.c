/* Direct screen output, disk channels, directory parsing and bounded text
 * formatting. These routines preserve the shell's C64-specific behavior. */
#include "c64-support.h"
#include <string.h>
#include <ctype.h>

typedef const char *StringPtr;
static unsigned char reverse_mask;

char *strpbrk(const char *s, const char *accept)
{
    while (*s) {
        if (strchr(accept, *s))
            return (char *)s;
        ++s;
    }
    return 0;
}

int stricmp(const char *a, const char *b)
{
    /* Fold each byte once; this form also works in aggressively inlined builds. */
    unsigned char x, y;
    do {
        x = toupper(*a++);
        y = toupper(*b++);
        if (x != y)
            return (int)x - (int)y;
    } while (x);
    return 0;
}

int strnicmp(const char *a, const char *b, unsigned int n)
{
    unsigned char x, y;
    while (n--) {
        x = toupper(*a++);
        y = toupper(*b++);
        if (x != y)
            return (int)x - (int)y;
        if (!x)
            break;
    }
    return 0;
}

void screen_reverse(unsigned char r)
{
    reverse_mask = r ? 128 : 0;
}

void screen_putc(unsigned char c)
{
    /* Write screen RAM directly: no KERNAL control codes or scrolling. */
    /* Each 32-character PETSCII range maps to a screen-code range. */
    static const unsigned char screen_codes[8] = {128, 32, 0, 64, 192, 96, 64, 96};
    unsigned char x = wherex(), y = wherey();
    unsigned int p = 40U * y + x;
    c = screen_codes[c >> 5] + (c & 31);
    POKE((unsigned int)PEEK(648) * 256 + p, c | reverse_mask);
    POKE(0xd800 + p, PEEK(646));
    if (++x == 40) {
        x = 0;
        if (y < 24)
            ++y;
    }
    gotoxy(x, y);
}

void screen_puts(const char *s)
{
    while (*s)
        screen_putc(*s++);
}

void screen_clear(unsigned char n)
{
    while (n--)
        screen_putc(' ');
}

unsigned char channel_open(char f, char d, char s, const char *n)
{
    krnio_setnam(n);
    return krnio_open(f, d, s) ? 0 : 1;
}

int channel_read(char f, void *p, unsigned int n)
{
    /* The shell owns EOF state and resets it after a U1 block command. */
    krnio_pstatus[f] = KRNIO_OK;
    return krnio_read(f, (char *)p, n);
}

int channel_write(char f, const void *p, unsigned int n)
{
    unsigned int i = 0;
    const char *s = p;
    if (!krnio_chkout(f))
        return -1;
    /* CHROUT returns the character in A, not a success flag: zero is data. */
    while (i < n) {
        krnio_chrout(s[i]);
        if (krnio_status())
            break;
        ++i;
    }
    krnio_clrchn();
    return i;
}

unsigned char directory_open(char f, char d)
{
    char address[2];
    if (channel_open(f, d, 0, "$"))
        return 1;
    return channel_read(f, address, 2) != 2;
}

unsigned char directory_read(char f, struct DirectoryEntry *e)
{
    unsigned char h[4], c, n = 0, quoted = 0, seen = 0, t = 0;
    if (channel_read(f, h, 4) != 4)
        return 1;
    e->size = h[2] | ((unsigned int)h[3] << 8);
    e->name[0] = 0;
    e->type = CBM_T_OTHER;
    e->access = CBM_A_RW;
    do {
        if (channel_read(f, &c, 1) != 1)
            return 1;
        if (c == '"') {
            quoted = !quoted;
            seen = 1;
        } else if (quoted) {
            if (n < 16)
                e->name[n++] = c;
        } else if (seen && c == '<')
            e->access = CBM_A_RO;
        else if (seen && !t && c != ' ' && c != '*')
            t = c;
    } while (c);
    e->name[n] = 0;
    while (n && e->name[n - 1] == ' ')
        e->name[--n] = 0;
    if (!seen)
        return 2;
    if (t == 0x44)
        e->type = CBM_T_DEL;
    else if (t == 0x50)
        e->type = CBM_T_PRG;
    else if (t == 0x53)
        e->type = CBM_T_SEQ;
    else if (t == 0x55)
        e->type = CBM_T_USR;
    else if (t == 0x52)
        e->type = CBM_T_REL;
    return 0;
}

/* The shell needs only %s, %u, %c, %% and left/right field widths.
 * Return the full length, even when the destination is truncated. */
int vsnprintf(char *dst, unsigned int cap, const char *fmt, va_list ap)
{
    unsigned int total = 0, width, len, i;
    unsigned char left, c;
    char num[6], ch;
    const char *s;
    while ((c = *fmt++)) {
        if (c != '%') {
            if (total + 1 < cap)
                dst[total] = c;
            ++total;
            continue;
        }
        left = 0;
        width = 0;
        if (*fmt == '-') {
            left = 1;
            ++fmt;
        }
        while (*fmt >= '0' && *fmt <= '9')
            width = width * 10 + *fmt++ - '0';
        c = *fmt++;
        if (c == 's') {
            s = va_arg(ap, StringPtr);
            len = strlen(s);
        } else if (c == 'u') {
            unsigned int v = va_arg(ap, unsigned int);
            i = 5;
            num[i] = 0;
            do {
                num[--i] = '0' + v % 10;
                v /= 10;
            } while (v);
            s = num + i;
            len = 5 - i;
        } else {
            ch = c == 'c' ? (char)(va_arg(ap, int)) : c;
            s = &ch;
            len = 1;
        }
        /* Emit either padding or content through the same bounded write. */
        width = width > len ? width - len : 0;
        while (width || len) {
            if ((!left && width) || !len) {
                c = ' ';
                --width;
            } else {
                c = *s++;
                --len;
            }
            if (total + 1 < cap)
                dst[total] = c;
            ++total;
        }
    }
    if (cap)
        dst[total < cap ? total : cap - 1] = 0;
    return total;
}

int snprintf(char *dst, unsigned int cap, const char *fmt, ...)
{
    va_list ap;
    int n;
    va_start(ap, fmt);
    n = vsnprintf(dst, cap, fmt, ap);
    va_end(ap);
    return n;
}
