#ifndef MCS_SESSION_FORMAT_H
#define MCS_SESSION_FORMAT_H

/* Version 4 saves bytes in this order. Fixed offsets make the flash format
 * independent of compiler padding and pointer representation. Changing any
 * field requires updating the format version and the return wedge together. */
#define SESSION_ENV_OFFSET 16U
#define SESSION_HISTORY_OFFSET 528U
#define SESSION_RAW_HISTORY_OFFSET 1808U
#define SESSION_PROMPT_OFFSET 1968U
#define SESSION_VERSION 4
#define SESSION_KEYS_OFFSET 2001U
#define SESSION_LOCATIONS_OFFSET 2257U
#define SESSION_MOUNTS_OFFSET 5329U
#define SESSION_FONT_OFFSET 5904U
#define SESSION_FONT_SIZE 2048U
#define SESSION_SIZE (SESSION_FONT_OFFSET + SESSION_FONT_SIZE)
#if SESSION_SIZE > 8176U
#error Shell session exceeds its flash journal slot
#endif

#endif
