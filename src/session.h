#ifndef MCS_SESSION_H
#define MCS_SESSION_H
#define SESSION_SIZE 3349U
/* Survives BASIC and the cartridge loader, outside the shell's C stacks. */
#define RESUME ((volatile unsigned char *)0xc1e0)
unsigned char session_save(void);
unsigned char session_restore(void);
void session_basic(void);
void session_fontread(unsigned int offset, unsigned char size);
#endif
