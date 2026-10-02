#include "banking.h"

/* The switch and all return gates execute in resident RAM. Only the mapping
 * change is atomic; KERNAL interrupts remain available to banked commands.
 *
 * Restore a ROM bank mapping from resident RAM, preserving the interrupt state.
 *
 * bank: Bank number, or BANK_NONE to hide cartridge ROM. */
__noinline void bank_leave(unsigned char bank)
{
    __asm { php
            sei }
    BANK_CURRENT = bank;
    if (bank == BANK_NONE) {
        *(volatile unsigned char *)0xde02 = 4;
        *(volatile unsigned char *)1 = 0x36;
    } else {
        *(volatile unsigned char *)0xde00 = bank;
        *(volatile unsigned char *)0xde02 = 7;
        *(volatile unsigned char *)1 = 0x36;
    }
    __asm { plp }
}

/* Select a command bank and return the previous bank for the caller to restore.
 *
 * bank: Bank number to expose in the cartridge window. */
__noinline unsigned char bank_enter(unsigned char bank)
{
    unsigned char previous = BANK_CURRENT;
    bank_leave(bank);
    return previous;
}
