#include "../../build/easyflash/helpmeta.h"

/* Immutable indexed help in bank 10 ROML; independent of filesystem mount.
 *
 * Read a byte from the immutable help bank through the resident bridge.
 *
 * at: Byte offset within the help bank. */
static unsigned char helpbyte(unsigned int at)
{
    H[0] = 10;
    H[1] = at;
    H[2] = 0x80 + (at >> 8);
    hal(0);
    return H[3];
}

/* Read a little-endian help topic offset.
 *
 * at: Low-byte index offset. */
static unsigned int helpword(unsigned int at)
{
    unsigned int n = helpbyte(at);
    return n | ((unsigned int)helpbyte(at + 1) << 8);
}

/* Validate the requested topic and return a bounded mailbox chunk of its immutable text. */
static void help_store(void)
{
    unsigned char topic = CART_MAILBOX[2], n = CART_MAILBOX[3], i;
    unsigned int start, end, pos = CART_MAILBOX[5] | ((unsigned int)(CART_MAILBOX[6]) << 8);
    CART_MAILBOX[4] = 0;
    if (topic >= HELP_TOPICS) {
        CART_MAILBOX[4] = 62;
        CART_MAILBOX[3] = 0;
        return;
    }
    start = helpword((unsigned int)topic * 2);
    end = helpword((unsigned int)(topic + 1) * 2);
    if (pos >= end - start)
        n = 0;
    else if (n > end - start - pos)
        n = end - start - pos;
    if (n > CART_TRANSFER_MAX)
        n = CART_TRANSFER_MAX;
    for (i = 0; i < n; ++i)
        CART_TEXT[i] = helpbyte(start + pos + i);
    CART_MAILBOX[3] = n;
}
