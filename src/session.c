#include "core.h"
#include "session.h"
/* Changing these sizes requires a new on-flash format and matching offsets. */
#if LINE != 65 || ENVSIZE != 512 || ENVVALUE != 32 || RAWMAP != 9
#error Update the session format before changing persistent buffer sizes
#endif
/* Session persistence belongs with RUN in the file utility bank. Keeping it
 * out of the startup bank leaves room for hardware probes and configuration. */
#pragma code(fileutil_code)
#pragma data(fileutil_data)
#include "../build/easyflash/wedge.h"

/* Call the private session service through the shared mailbox; return nonzero on success.
 *
 * op: Session operation number.
 * n: Bytes in this transfer, at most the mailbox capacity. */
static unsigned char transfer(unsigned char op, unsigned char n)
{
    CART_MAILBOX[0] = op;
    CART_MAILBOX[3] = n;
    __asm { jsr 0x0880 }
    return !CART_MAILBOX[4];
}

/* Explicit on-flash fields, never compiler pointers or a raw C structure.
 *
 * Encode one shell-state byte without saving compiler pointers or structure padding.
 *
 * i: Byte offset in the serialized state, before the font data. */
static unsigned char statebyte(unsigned int i)
{
    if (i < SESSION_ENV_OFFSET) {
        switch (i) {
        case 0:
            return fg;
        case 1:
            return bg;
        case 2:
            return bd;
        case 3:
            return drive;
        case 4:
            return echoon;
        case 5:
            return histcount;
        case 6:
            return histnext;
        case 7:
            return envused;
        case 8:
            return envused >> 8;
        case 9:
            return envready;
        default:
            return 0;
        }
    }
    if (i < SESSION_HISTORY_OFFSET)
        return environment[i - SESSION_ENV_OFFSET];
    if (i < SESSION_RAW_HISTORY_OFFSET)
        return ((char *)history)[i - SESSION_HISTORY_OFFSET];
    if (i < SESSION_PROMPT_OFFSET)
        return ((char *)rawhistory)[i - SESSION_RAW_HISTORY_OFFSET];
    return prompttext[i - SESSION_PROMPT_OFFSET];
}

/* Decode one serialized byte into shell state or the saved font RAM.
 *
 * i: Byte offset in the complete session payload.
 * value: Saved byte to restore. */
static void stateput(unsigned int i, unsigned char value)
{
    if (i < SESSION_ENV_OFFSET) {
        switch (i) {
        case 0:
            fg = value;
            break;
        case 1:
            bg = value;
            break;
        case 2:
            bd = value;
            break;
        case 3:
            drive = value;
            break;
        case 4:
            echoon = value;
            break;
        case 5:
            histcount = value;
            break;
        case 6:
            histnext = value;
            break;
        case 7:
            envused = value;
            break;
        case 8:
            envused |= (unsigned int)value << 8;
            break;
        case 9:
            envready = value;
            break;
        }
    } else if (i < SESSION_HISTORY_OFFSET)
        environment[i - SESSION_ENV_OFFSET] = value;
    else if (i < SESSION_RAW_HISTORY_OFFSET)
        ((char *)history)[i - SESSION_HISTORY_OFFSET] = value;
    else if (i < SESSION_PROMPT_OFFSET)
        ((char *)rawhistory)[i - SESSION_RAW_HISTORY_OFFSET] = value;
    else if (i < SESSION_FONT_OFFSET)
        prompttext[i - SESSION_PROMPT_OFFSET] = value;
    else
        POKE(0xe800 + i - SESSION_FONT_OFFSET, value);
}

/* Save shell state and font to flash; publish a resume token only after commit.
 * Return nonzero on success, or zero when the save cannot be completed. */
__noinline unsigned char bank_session_save(void)
{
    unsigned int pos = 0;
    unsigned char n, i;
    /* Clear validity before writing: an interrupted save must not publish a new resume token. */
    RESUME[1] = 0;
    if (!transfer(CART_SESSION_BEGIN, 0))
        return 0;
    while (pos < SESSION_SIZE) {
        n = SESSION_SIZE - pos > CART_TRANSFER_MAX ? CART_TRANSFER_MAX : SESSION_SIZE - pos;
        /* Do not cross from encoded shell fields into font RAM in the same chunk. */
        if (pos < SESSION_FONT_OFFSET) {
            if (n > SESSION_FONT_OFFSET - pos)
                n = SESSION_FONT_OFFSET - pos;
            for (i = 0; i < n; ++i)
                io[i] = statebyte(pos + i);
        } else
            session_fontread(pos - SESSION_FONT_OFFSET, n);
        memcpy(CART_TEXT, io, n);
        if (!transfer(CART_SESSION_WRITE, n))
            return 0;
        pos += n;
    }
    if (!transfer(CART_SESSION_COMMIT, 0))
        return 0;
    /* Copy the slot, generation and checksum only after flash verification succeeds. */
    for (i = 0; i < 5; ++i)
        RESUME[2 + i] = CART_MAILBOX[5 + i];
    RESUME[1] = 1;
    return 1;
}

/* Restore the exact saved session, validate field bounds, and rebuild display state.
 * Return nonzero on success, or zero for an invalid token or unreadable session. */
__noinline unsigned char bank_session_restore(void)
{
    unsigned int pos = 0;
    unsigned char n, i;
    if (RESUME[1] != 1)
        return 0;
    for (i = 0; i < 5; ++i)
        CART_MAILBOX[5 + i] = RESUME[2 + i];
    /* The driver checks the whole checksum before any live shell state is changed. */
    if (!transfer(CART_SESSION_RESTORE, 0))
        return 0;
    while (pos < SESSION_SIZE) {
        n = SESSION_SIZE - pos > CART_TRANSFER_MAX ? CART_TRANSFER_MAX : SESSION_SIZE - pos;
        if (!transfer(CART_SESSION_READ, n))
            return 0;
        for (i = 0; i < n; ++i)
            stateput(pos + i, CART_TEXT[i]);
        pos += n;
    }
    /* CRC was checked before modifying state; bounds also guard format misuse. */
    if (fg > 15 || bg > 15 || bd > 15 || (drive && (drive < 8 || drive > 30)) || histcount > 10 ||
        histnext >= 10 || envused > ENVSIZE)
        return 0;
    prompttext[ENVVALUE] = 0;
    for (i = 0; i < 10; ++i)
        history[i][LINE - 1] = 0;
    colors();
    clear();
    caret_init();
    return 1;
}

/* Install the shared BASIC return image and clear its handoff request.
 * Both BASIC and RUN use this image; colors are supplied only for BASIC. */
static __noinline void installwedge(void)
{
    memcpy((void *)0xc000, wedge_image, sizeof(wedge_image));
    RESUME[0] = 0;
}

/* Install the return wedge and leave the shell for BASIC; this handoff does not return. */
__noinline void bank_session_basic(void)
{
    installwedge();
    RESUME[16] = fg;
    RESUME[17] = bg;
    RESUME[18] = bd;
    __asm { jmp 0xc000 }
}

/* Install only the RAM image here. The low-RAM loaders initialize BASIC and
 * hook $0302 through $C003 once execution has left the shell permanently.
 *
 * Save the session and install the program return wedge; return zero if the user cancels. */
__noinline unsigned char bank_session_run(void)
{
    if (!bank_session_save() && !yesno(SYSOUT_SHELL_SAVE_WARNING_RUN))
        return 0;
    installwedge();
    return 1;
}

#pragma code(code)
#pragma data(data)

/* Reading font RAM beneath KERNAL must execute entirely in resident RAM.
 *
 * Copy font bytes beneath KERNAL into io while preserving the interrupt state.
 *
 * offset: Byte offset within the 2048-byte saved font.
 * size: Bytes to copy; must fit io and the remaining font. */
__noinline void session_fontread(unsigned int offset, unsigned char size)
{
    __asm { php
 sei }
    /* Hide KERNAL briefly to expose the saved font; resident code remains visible. */
    POKE(1, 0x34);
    memcpy(io, (void *)(0xe800 + offset), size);
    POKE(1, 0x36);
    __asm { plp }
}
