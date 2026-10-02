#include "c64-support.h"
#include "cart.h"
#include <string.h>
/* Calls preserve the RAM shell's zero-page registers. The ROM driver owns
 * a separate stack and never receives pointers into banked-out shell RAM;
 * transfers cross this mailbox in chunks of at most CART_TRANSFER_MAX bytes. */
unsigned char cart_channels[CART_CHANNEL_COUNT];
extern void charset_default(void);

/* Invoke the cartridge driver after filling its operation and channel fields.
 *
 * op: Mailbox operation number.
 * f: Logical file number for channel operations. */
static void call(unsigned char op, unsigned char f)
{
    CART_MAILBOX[0] = op;
    CART_MAILBOX[1] = f;
    __asm { jsr 0x0880 }
}

/* Clear channel ownership and mount cartridge storage; return its error code (zero on success). */
unsigned char cart_init(void)
{
    memset(cart_channels, 0, sizeof(cart_channels));
    call(CART_INIT, 0);
    return CART_MAILBOX[4];
}

/* Return the last cartridge filesystem error without clearing it. */
unsigned char cart_status(void)
{
    call(CART_STATUS, 0);
    return CART_MAILBOX[4];
}

/* Fetch a bounded chunk of indexed help; return its size, or -1 on error.
 *
 * topic: Internal help topic index.
 * offset: Byte offset within the topic.
 * buffer: Destination with room for the requested chunk.
 * size: Requested bytes, clamped to the mailbox capacity. */
int cart_help(unsigned char topic, unsigned int offset, void *buffer, unsigned char size)
{
    CART_MAILBOX[2] = topic;
    CART_MAILBOX[3] = size > CART_TRANSFER_MAX ? CART_TRANSFER_MAX : size;
    CART_MAILBOX[5] = offset;
    CART_MAILBOX[6] = offset >> 8;
    call(CART_HELP, 0);
    if (CART_MAILBOX[4])
        return -1;
    memcpy(buffer, CART_TEXT, CART_MAILBOX[3]);
    return CART_MAILBOX[3];
}

/* Return a terminated statistic in the mailbox; the next cartridge call overwrites it.
 *
 * line: 0=capacity, 1=live bytes, 2=file count. */
const char *cart_stats(unsigned char line)
{
    CART_MAILBOX[2] = line;
    call(CART_STATS, 0);
    return CART_TEXT;
}

/* -1: failure; 0: already compact; 1: compacted.
 *
 * Reclaim obsolete journal records; return -1 on error, 0 if already compact, or 1 if changed. */
int cart_compact(void)
{
    call(CART_COMPACT, 0);
    return CART_MAILBOX[4] ? -1 : CART_MAILBOX[3];
}

/* Open a cartridge file and mark its channel ownership; return zero on success.
 *
 * f: Logical file number, 0-5.
 * s: Secondary address passed to the driver.
 * name: Native DOS open request, shorter than the mailbox capacity. */
unsigned char cart_open(char f, char s, const char *name)
{
    if (f < 0 || f >= CART_CHANNEL_COUNT || strlen(name) >= CART_TRANSFER_MAX)
        return 1;
    strcpy(CART_TEXT, name);
    CART_MAILBOX[2] = s;
    call(CART_OPEN, f);
    cart_channels[f] = !CART_MAILBOX[4];
    return CART_MAILBOX[4];
}

/* Read through mailbox-sized chunks; return bytes read or -1 on failure and set KERNAL EOF.
 *
 * f: Open cartridge logical file.
 * buffer: Destination buffer.
 * size: Maximum requested byte count. */
int cart_read(char f, void *buffer, unsigned int size)
{
    unsigned int done = 0;
    unsigned char n;
    char *dest = buffer;
    /* The ROM driver cannot dereference caller buffers, so copy through shared low RAM. */
    while (done < size) {
        n = size - done > CART_TRANSFER_MAX ? CART_TRANSFER_MAX : size - done;
        CART_MAILBOX[3] = n;
        call(CART_READ, f);
        if (CART_MAILBOX[4])
            return -1;
        memcpy(dest + done, CART_TEXT, CART_MAILBOX[3]);
        done += CART_MAILBOX[3];
        if (CART_MAILBOX[3] < n)
            break;
    }
    /* Match KERNAL status so readio can keep its usual per-channel EOF bookkeeping. */
    POKE(144, done < size ? 64 : 0);
    return done;
}

/* Write through mailbox-sized chunks; return bytes written or -1 on failure.
 *
 * f: Open cartridge logical file.
 * buffer: Source bytes.
 * size: Number of bytes to write. */
int cart_write(char f, const void *buffer, unsigned int size)
{
    unsigned int done = 0;
    unsigned char n;
    const char *src = buffer;
    while (done < size) {
        n = size - done > CART_TRANSFER_MAX ? CART_TRANSFER_MAX : size - done;
        memcpy(CART_TEXT, src + done, n);
        CART_MAILBOX[3] = n;
        call(CART_WRITE, f);
        if (CART_MAILBOX[4])
            return -1;
        done += n;
    }
    return done;
}

/* Close a cartridge-owned channel or delegate a disk channel to KERNAL.
 *
 * f: Logical file number; successful cartridge closes commit pending writes. */
void channel_close(char f)
{
    if (f >= 0 && f < CART_CHANNEL_COUNT && cart_channels[f]) {
        call(CART_CLOSE, f);
        cart_channels[f] = 0;
    } else
        krnio_close(f);
}

/* Discard a pending cartridge write without publishing a partial file.
 *
 * f: Cartridge logical file number; other channels are left alone. */
void channel_abort(char f)
{
    if (f >= 0 && f < CART_CHANNEL_COUNT && cart_channels[f]) {
        call(CART_ABORT, f);
        cart_channels[f] = 0;
    }
}

/* Send a terminated cartridge DOS command; return its error code.
 *
 * text: Command shorter than the mailbox capacity. */
unsigned char cart_command(const char *text)
{
    if (strlen(text) >= CART_TRANSFER_MAX)
        return 33;
    strcpy(CART_TEXT, text);
    call(CART_COMMAND, 0);
    return CART_MAILBOX[4];
}

/* Start or advance cartridge directory enumeration using Commodore-compatible entries.
 *
 * f: Logical directory channel.
 * first: Nonzero starts enumeration; zero reads the next item.
 * e: Output entry; return 0 for an item, 2 for free blocks, or an error. */
unsigned char cart_directory(char f, unsigned char first, struct DirectoryEntry *e)
{
    CART_MAILBOX[2] = first ? 0 : 1;
    call(CART_DIRECTORY, f);
    cart_channels[f] = 1;
    if (first)
        return CART_MAILBOX[4];
    if (CART_MAILBOX[3] == 2) {
        e->size = CART_MAILBOX[5] | ((unsigned int)(CART_MAILBOX[6]) << 8);
        return 2;
    }
    strcpy(e->name, CART_TEXT);
    e->type = CART_MAILBOX[25];
    e->access = CART_MAILBOX[30] ? CBM_A_RO : CBM_A_RW;
    e->size =
        ((unsigned int)(CART_MAILBOX[28]) + ((unsigned int)(CART_MAILBOX[29]) << 8) + 253) / 254;
    return CART_MAILBOX[4] ? 1 : 0;
}

/* Read startup devices from CONFIG.SYS; return the number enabled for AUTOEXEC searching.
 *
 * devices: Output array with room for 24 device numbers. */
unsigned char cart_config(unsigned char *devices)
{
    call(CART_CONFIG, 0);
    memcpy(devices, CART_TEXT, CART_MAILBOX[3]);
    return CART_MAILBOX[3];
}

/* Read or change a cartridge read-only flag; errors are obtained through cart_status.
 *
 * name: Native filename, at most 16 bytes.
 * mode: 0=query, 1=set read-only, 2=clear; return the previous flag. */
unsigned char cart_attribute(const char *name, unsigned char mode)
{
    strcpy(CART_TEXT, name);
    CART_MAILBOX[2] = mode;
    call(CART_ATTRIBUTE, 0);
    return CART_MAILBOX[5];
}

/* Validate a cartridge PRG and install its low-RAM loader before leaving the shell.
 *
 * name: Native program filename.
 * absolute: Nonzero overrides the PRG load address.
 * address: Override address when absolute is set; return zero if validation fails. */
unsigned char cart_launch(const char *name, unsigned char absolute, unsigned int address)
{
    unsigned int offset, len;
    unsigned char side, h[2];
    strcpy(CART_TEXT, name);
    call(CART_LOOKUP, 0);
    if (CART_MAILBOX[4])
        return 0;
    offset = CART_MAILBOX[26] | ((unsigned int)(CART_MAILBOX[27]) << 8);
    len = CART_MAILBOX[28] | ((unsigned int)(CART_MAILBOX[29]) << 8);
    side = CART_MAILBOX[5];
    if (len < 2)
        return 0;
    if (cart_open(2, 2, name) || cart_read(2, h, 2) != 2)
        return 0;
    channel_close(2);
    if (!absolute)
        address = h[0] | ((unsigned int)h[1] << 8);
    if (address < 2049 || (unsigned long)address + len - 2 > 65536UL)
        return 0;
    /* The PRG address header selects the destination but is not part of its loaded payload. */
    offset += 2;
    len -= 2;
    // Restore display before installing the low-RAM loader (including its caret).
    charset_default();
    POKE(0x288, 4);
    POKE(0xd015, PEEK(0xd015) & 254);
    POKE(0xcc, 0);
    POKE(0xcf, 0);
    POKE(0x0291, 0);
    call(CART_LOADER, 0);
    memcpy((void *)0x0334, CART_TEXT, CART_MAILBOX[3]);
    // The default screen contained EasyAPI, so clear it only after our last
    // filesystem call. Match the disk loader's BASIC display handoff.
    __asm { jsr 0xffcc
 jsr 0xffe7
 lda #0x8e
 jsr 0xffd2
 lda #0x93
 jsr 0xffd2 }
    POKE(0xf7, len);
    POKE(0xf8, len >> 8);
    POKE(0xfb, offset);
    POKE(0xfc, (side ? 0xa0 : 0x80) + ((offset >> 8) & 31));
    POKE(0xfd, address);
    POKE(0xfe, address >> 8);
    POKE(0x02a0, 56 + (offset >> 13));
    POKE(0x02a1, side ? 0xa0 : 0x80);
    POKE(0x02a2, absolute);
    POKE(0x02a3, address);
    POKE(0x02a4, address >> 8);
    __asm { jmp 0x0334 }
    return 1;
}
