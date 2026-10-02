#ifndef MCS_CART_PROTOCOL_H
#define MCS_CART_PROTOCOL_H

/* Shell, filesystem and tape copier exchange data in RAM that stays visible
 * through a bank switch. Never pass a pointer into the caller's banked RAM.
 * Bytes 0/1 select operation/channel, 2 is operation-specific, 3 is length,
 * 4 is the error code, and 5-7 carry extra arguments or results. Text starts
 * at byte 8; callers copy larger buffers in chunks of at most 120 bytes.
 * A few operations instead return fixed fields at bytes 5-30 (directory
 * metadata, loader coordinates or a session token); those replies do not
 * carry text at the same time. */
#define CART_MAILBOX ((volatile unsigned char *)0x0800)
#define CART_TEXT ((char *)0x0808)
#define CART_TRANSFER_MAX 120
#define CART_CHANNEL_COUNT 6

/* These values are also used by the low-RAM assembly bridges. Preserve their
 * numeric values when extending the protocol. Zero error means success. */
enum CartOperation {
    CART_INIT = 0,
    CART_OPEN = 1,
    CART_READ = 2,
    CART_WRITE = 3,
    CART_CLOSE = 4,
    CART_DIRECTORY = 5,
    CART_COMMAND = 6,
    CART_STATUS = 7,
    CART_CONFIG = 8,
    CART_ATTRIBUTE = 9,
    CART_LOOKUP = 10,
    CART_LOADER = 11,
    CART_ABORT = 12,
    CART_STATS = 13,
    CART_SESSION_BEGIN = 14,
    CART_SESSION_WRITE = 15,
    CART_SESSION_COMMIT = 16,
    CART_SESSION_RESTORE = 17,
    CART_SESSION_READ = 18,
    CART_HELP = 19,
    CART_COMPACT = 20
};

#endif
