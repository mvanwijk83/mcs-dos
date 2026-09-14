/* CPU RAM available to the shell; screen/font storage lives above this. */
#ifndef MCS_MEMORY_H
#define MCS_MEMORY_H

#define SHELL_RAM_END 53248U
#define SHELL_STACK_SIZE 2048U

#pragma region(main, 0x0a00, 0xd000, , , {code, data, bss, heap, stack})
#pragma stacksize(SHELL_STACK_SIZE)
#pragma heapsize(0)
extern void BSSEnd;

#endif
