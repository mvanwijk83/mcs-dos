/* Standalone standard-Datasette copier. ROMH bank 11; 44 KiB of payload RAM
 * at $1000..$BFFF. Neither tape addresses nor tape header code are executed.
 * KERNAL's block reader handles parity, duplicate copies and checksums.
 * $0700/$0800/$C200/$C700 and EasyAPI remain owned by the flash driver. */
#include <c64/kernalio.h>
#include <string.h>
#include "../cart-protocol.h"
#include "../sysout.h"
#include "../tape.h"
#define PEEK(a) (*(volatile unsigned char *)(a))
#define POKE(a, v) (*(volatile unsigned char *)(a) = (v))
#define G ((volatile unsigned char *)0xc600)
#define HEADER ((unsigned char *)0x033c)
#pragma section(startup, 0)
#pragma region(startup,0xa000,0xa040,,, {startup})
#pragma region(main,0xa040,0xc000,,, {code,data})
#pragma region(state,0xc800,0xcc00,,, {bss})
#pragma region(stackram,0xcc00,0xd000,,, {stack})
#pragma stacksize(1024)
#pragma heapsize(0)
extern void StackEnd;
void copy_main(void);
__asm startup {
 sei
 ldx #0xff
 txs
 lda #<StackEnd-2
 sta 0x23
 lda #>StackEnd-2
 sta 0x24
 jsr 0xffcc
 jsr 0xffe7
 jsr 0xff84
 jsr 0xff8a
 jsr 0xff81
 cli
 jsr copy_main
 jmp 0xc306
}
#pragma startup(startup)
#include "../../build/easyflash/tape-bridge.h"
static char name[17], stored[17], request[24];
static unsigned char device, kind, opened;
static unsigned int length, address;

/* Print tape-copier text through KERNAL, converting line feeds to carriage returns.
 *
 * s: Terminated message. */
static void out(const char *s)
{
    while (*s) {
        krnio_chrout(*s == 10 ? 13 : *s);
        ++s;
    }
}

/* Print a tape-copier message followed by a carriage return.
 *
 * s: Terminated message. */
static void line(const char *s)
{
    out(s);
    krnio_chrout(13);
}

/* Wait for a key while keeping tape cancellation available; return the character code. */
static unsigned char key(void)
{
    do {
        __asm {
            jsr 0xffe1
            bne get
            lda #3
            bne done
        get:
            jsr 0xffe4
        done:
            sta 0xc606
        }
    } while (!G[6]);
    return G[6];
}

/* Ask the tape-copier confirmation question; return nonzero for Yes. */
static unsigned char yesno(void)
{
    unsigned char c;
    out(SYSOUT_TAPE_YES_NO);
    for (;;) {
        c = key();
        if (c == 3) {
            TAPE_RESULT = TAPE_CANCELLED;
            return 0;
        }
        if (c >= 193 && c <= 218)
            c -= 128;
        if (c == 'y' || c == 'n') {
            krnio_chrout(c);
            krnio_chrout(13);
            return c == 'y';
        }
    }
}

/* Invoke the filesystem through the tape-safe bridge and return its error code.
 *
 * op: Cartridge operation number; channel 2 is used for file data. */
static unsigned char call(unsigned char op)
{
    CART_MAILBOX[0] = op;
    CART_MAILBOX[1] = 2;
    __asm {jsr 0x0880}
    return CART_MAILBOX[4];
}

/* Keep the command channel open until the data file has been closed.
 *
 * Read and decode the disk command-channel status; return an error code. */
static unsigned char status(void)
{
    unsigned char a, b, c, n = 0, err;
    if (!krnio_chkin(15))
        return 74;
    a = krnio_chrin();
    b = krnio_chrin();
    do {
        c = krnio_chrin();
        err = krnio_status();
    } while (c != 13 && !err && ++n < 64);
    krnio_clrchn();
    if ((err & ~64) || a < '0' || a > '9' || b < '0' || b > '9')
        return 74;
    return (a - '0') * 10 + b - '0';
}

/* Read one tape block into the specified RAM interval; record cancellation or read failure.
 *
 * start: First destination RAM address.
 * end: Exclusive end address, including zero for the top of RAM. */
static unsigned char readblock(unsigned int start, unsigned int end)
{
    G[0] = start;
    G[1] = start >> 8;
    G[2] = end;
    G[3] = end >> 8;
    __asm {jsr 0xc300}
    if (G[4])
    {
        TAPE_RESULT = TAPE_CANCELLED;
        return 0;
    }
    if (PEEK(0x90) & 0x3f) {
        TAPE_RESULT = TAPE_READ_ERROR;
        return 0;
    }
    return 1;
}

/* Check whether the destination exists; return 0=absent, 1=present, 2=device error. */
static unsigned char exists(void)
{
    unsigned char err;
    if (!device) {
        strcpy(CART_TEXT, name);
        err = call(CART_LOOKUP);
    } else {
        strcpy(request, name);
        strcat(request, ",r");
        krnio_setnam(request);
        if (!krnio_open(2, device, 2)) {
            krnio_close(2);
            TAPE_RESULT = TAPE_DISK_ERROR;
            return 2;
        }
        err = status();
        krnio_close(2);
    }
    if (err == 62)
        return 0;
    if (err == 64)
        return 1; /* File exists with a different disk file type. */
    if (err) {
        TAPE_RESULT = TAPE_DISK_ERROR;
        return 2;
    }
    return 1;
}

/* Check the selected tape destination name against native filename restrictions. */
static unsigned char validname(void)
{
    unsigned char i, c;
    if (!name[0])
        return 0;
    for (i = 0; (c = name[i]) != 0; ++i)
        if (c < 32 || (c >= 128 && c < 160) || strchr(":,\"*?@=", c))
            return 0;
    return 1;
}

/* Ask for a valid destination name and confirm replacement; return zero on cancellation. */
static unsigned char filename(void)
{
    unsigned char n, c, e;
    for (;;) {
        out(SYSOUT_TAPE_FILENAME);
        n = 0;
        for (;;) {
            c = key();
            if (c == 3) {
                TAPE_RESULT = TAPE_CANCELLED;
                return 0;
            }
            if (c == 13)
                break;
            if (c == 20) {
                if (n) {
                    --n;
                    krnio_chrout(20);
                }
                continue;
            }
            if (c >= 32 && !(c >= 128 && c < 160) && n < 16) {
                if (c >= 193 && c <= 218)
                    c -= 128;
                name[n++] = c;
                krnio_chrout(c);
            }
        }
        krnio_chrout(13);
        name[n] = 0;
        if (!n)
            strcpy(name, stored);
        if (!validname()) {
            line(SYSOUT_INVALID_FILE_NAME);
            continue;
        }
        e = exists();
        if (e == 2)
            return 0;
        if (!e)
            return 1;
        line(SYSOUT_TAPE_EXISTS);
    }
}

/* Open the selected destination for writing and remember whether cleanup is required. */
static unsigned char openoutput(void)
{
    unsigned char err;
    strcpy(request, name);
    strcat(request, kind == 4 ? ",s,w" : ",p,w");
    if (!device) {
        strcpy(CART_TEXT, request);
        CART_MAILBOX[2] = 2;
        err = call(CART_OPEN);
    } else {
        krnio_setnam(request);
        if (!krnio_open(2, device, 2)) {
            krnio_close(2);
            TAPE_RESULT = TAPE_WRITE_ERROR;
            return 0;
        }
        err = status();
    }
    if (err) {
        if (device)
            krnio_close(2);
        /* DOS may have allocated an unclosed file before reporting disk full. */
        if (device && err == 72)
            opened = 1;
        TAPE_RESULT = TAPE_WRITE_ERROR;
        return 0;
    }
    opened = 1;
    return 1;
}

/* Source can be hidden beneath the cartridge: copy through the RAM gate.
 *
 * Copy RAM data through the tape bridge in bounded chunks, checking errors and cancellation.
 *
 * source: RAM source address.
 * size: Number of bytes to write; return nonzero on success. */
static unsigned char writebytes(unsigned int source, unsigned int size)
{
    unsigned char n, i;
    /* Copy only through the bridge buffer: the flash bank temporarily hides portions of tape payload RAM. */
    while (size) {
        n = size > CART_TRANSFER_MAX ? CART_TRANSFER_MAX : size;
        G[0] = source;
        G[1] = source >> 8;
        G[5] = n;
        __asm {jsr 0xc303}
        if (!device)
        {
            CART_MAILBOX[3] = n;
            if (call(CART_WRITE))
                goto failed;
        }
        else
        {
            if (!krnio_chkout(2))
                goto failed;
            for (i = 0; i < n; ++i) {
                krnio_chrout(CART_TEXT[i]);
                if (krnio_status()) {
                    krnio_clrchn();
                    goto failed;
                }
            }
            krnio_clrchn();
        }
        source += n;
        size -= n;
        __asm {
            jsr 0xffe1
            bne running
            lda #1
            sta 0xc607
            jmp checked
        running:
            lda #0
            sta 0xc607
        checked:
        }
        if (G[7])
        {
            TAPE_RESULT = TAPE_CANCELLED;
            return 0;
        }
    }
    return 1;
failed:
    TAPE_RESULT = TAPE_WRITE_ERROR;
    return 0;
}

/* Discard an unfinished cartridge record or scratch the partial disk output file. */
static void cleanup(void)
{
    unsigned char err;
    if (!opened)
        return;
    if (!device) {
        if (call(CART_ABORT))
            TAPE_RESULT = TAPE_CLEANUP_ERROR;
    } else {
        krnio_close(2);
        strcpy(request, "s0:");
        strcat(request, name);
        if (!krnio_chkout(15)) {
            TAPE_RESULT = TAPE_CLEANUP_ERROR;
            return;
        }
        out(request);
        krnio_clrchn();
        err = status();
        if (err != 1 && err != 0 && err != 62)
            TAPE_RESULT = TAPE_CLEANUP_ERROR;
    }
    opened = 0;
}

/* Close and check the destination, removing partial output if finalization fails. */
static unsigned char finishoutput(void)
{
    unsigned char err;
    if (!device)
        err = call(CART_CLOSE);
    else {
        krnio_close(2);
        err = status();
    }
    if (err) {
        TAPE_RESULT = TAPE_WRITE_ERROR;
        cleanup();
        return 0;
    }
    opened = 0;
    TAPE_RESULT = TAPE_SAVED;
    return 1;
}

/* Read tape headers and matching payloads, write a selected file, then return through shell
 * reload. */
void copy_main(void)
{
    unsigned char i, save, ended;
    unsigned int end, n;
    memcpy((void *)0xc300, tape_bridge, sizeof(tape_bridge));
    device = TAPE_DEVICE;
    opened = 0;
    TAPE_RESULT = 0;
    POKE(0x07f5, TAPE_BANK);
    /* Default ROM character generator, screen outside EasyAPI's $0400 area. */
    POKE(0x288, 12);
    POKE(0xd018, 0x36);
    POKE(0xd015, 0);
    POKE(0x0286, TAPE_COLORS[0]);
    POKE(0xd021, TAPE_COLORS[1]);
    POKE(0xd020, TAPE_COLORS[2]);
    krnio_chrout(14);
    krnio_chrout(147);
    POKE(0xb2, 0x3c);
    POKE(0xb3, 3);
    POKE(0x9d, 0);
    /* External disks need a command channel to check write errors and remove partial files. */
    if (device) {
        krnio_setnam("");
        if (!krnio_open(15, device, 15)) {
            TAPE_RESULT = TAPE_DISK_ERROR;
            goto done;
        }
        /* Discard the drive's startup identification status (73). */
        i = status();
        if (i >= 20 && i != 73) {
            TAPE_RESULT = TAPE_DISK_ERROR;
            goto done;
        }
    }
    for (;;) {
        line(SYSOUT_TAPE_PLAY);
        if (!readblock(0x033c, 0x03fc))
            break;
        kind = HEADER[0];
        if (kind == 5) {
            TAPE_RESULT = TAPE_END;
            break;
        }
        if (kind != 1 && kind != 3 && kind != 4) {
            TAPE_RESULT = TAPE_UNSUPPORTED;
            break;
        }
        memcpy(stored, HEADER + 5, 16);
        stored[16] = 0;
        for (i = 16; i && stored[i - 1] == ' '; --i)
            stored[i - 1] = 0;
        out(SYSOUT_TAPE_FOUND);
        for (i = 0; stored[i]; ++i)
            krnio_chrout(stored[i] < 32 || (stored[i] >= 128 && stored[i] < 160) ? '?' : stored[i]);
        krnio_chrout(13);
        address = HEADER[1] | ((unsigned int)(HEADER[2]) << 8);
        end = HEADER[3] | ((unsigned int)(HEADER[4]) << 8);
        length = end - address;
        if (kind != 4 && (!length || (end && end < address))) {
            TAPE_RESULT = TAPE_UNSUPPORTED;
            break;
        }
        if (kind != 4 && length > TAPE_LIMIT - TAPE_BUFFER) {
            TAPE_RESULT = TAPE_TOO_LARGE;
            break;
        }
        save = 0;
        /* Like BASIC LOAD, compare the requested prefix of the tape name.
         * Consume nonmatching standard files without prompting or saving. */
        if (!strncmp(stored, TAPE_SEARCH, strlen(TAPE_SEARCH))) {
            TAPE_SEARCH[0] = 0;
            out(SYSOUT_TAPE_SAVE_TO);
            out(TAPE_LABEL);
            out(SYSOUT_TAPE_QUESTION);
            save = yesno();
            if (TAPE_RESULT)
                break;
        }
        if (save && !filename())
            break;
        line(SYSOUT_TAPE_LOADING);
        if (kind == 4) {
            if (save && !openoutput())
                break;
            ended = 0;
            while (!ended) {
                if (!readblock(0x033c, 0x03fc))
                    break;
                if (HEADER[0] != 2) {
                    TAPE_RESULT = TAPE_UNSUPPORTED;
                    break;
                }
                for (n = 1; n < 192 && HEADER[n]; ++n)
                    ;
                ended = n < 192;
                if (save && !writebytes(0x033d, n - 1))
                    break;
            }
            if (TAPE_RESULT)
                break;
        } else {
            if (!readblock(TAPE_BUFFER, TAPE_BUFFER + length))
                break;
            if (save) {
                line(SYSOUT_TAPE_SAVING);
                if (!openoutput())
                    break;
                G[8] = address;
                G[9] = address >> 8;
                if (!writebytes(0xc608, 2) || !writebytes(TAPE_BUFFER, length))
                    break;
            }
        }
        if (save) {
            finishoutput();
            break;
        }
    }
done:
    cleanup();
    if (device) {
        krnio_close(2);
        krnio_close(15);
    }
    POKE(1, PEEK(1) | 32);
}
