/* CPU RAM available to the shell; screen/font storage lives above this. */
#ifndef MCS_MEMORY_H
#define MCS_MEMORY_H

#define SHELL_RAM_END 53248U
#define SHELL_STACK_SIZE 2048U

#ifdef MCS_DEFINE_LAYOUT
#pragma section(startup, 0)
#pragma region(startup, 0x0801, 0x0880, , , {startup})
#pragma region(main, 0x0a00, 0xa000, , , {code, data, bss, heap})
#pragma region(shellstack, 0xc800, 0xd000, , , {stack})
#pragma stacksize(SHELL_STACK_SIZE)
#pragma heapsize(0)
#endif
extern void BSSEnd;

#endif
