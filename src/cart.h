#ifndef MCS_CART_H
#define MCS_CART_H
#include "cart-protocol.h"
/* Common channels are implemented in c64-support.c; these entry points are
 * its device-0 backend. Close must dispatch too: a cartridge close commits
 * the pending journal record. LFN 0..5 are available to cartridge callers. */
struct DirectoryEntry;
unsigned char cart_init(void);
unsigned char cart_open(char f, char s, const char *name);
int cart_read(char f, void *buffer, unsigned int size);
int cart_write(char f, const void *buffer, unsigned int size);
void channel_close(char f);
void channel_abort(char f);
unsigned char cart_status(void);
/* Unformatted decimal metrics: 0 capacity, 1 live bytes, 2 file count. */
const char *cart_stats(unsigned char line);
int cart_compact(void);
unsigned char cart_command(const char *text);
unsigned char cart_directory(char f, unsigned char first, struct DirectoryEntry *entry);
unsigned char cart_config(unsigned char *devices);
unsigned char cart_attribute(const char *name, unsigned char mode);
unsigned char cart_launch(const char *name, unsigned char absolute, unsigned int address);
extern unsigned char cart_channels[CART_CHANNEL_COUNT];
int cart_help(unsigned char topic, unsigned int offset, void *buffer, unsigned char size);
#pragma compile("cart.c")
#endif
