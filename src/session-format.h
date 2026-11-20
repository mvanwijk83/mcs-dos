#ifndef MCS_SESSION_FORMAT_H
#define MCS_SESSION_FORMAT_H

/* Version 6 saves bytes in this order. Fixed offsets make the flash format
 * independent of compiler padding and pointer representation. Update the
 * format version when changing the size or placement of fields. */
#define SESSION_ENV_OFFSET 16U
#define SESSION_HISTORY_OFFSET 272U
#define SESSION_RAW_HISTORY_OFFSET 1552U
#define SESSION_PROMPT_OFFSET 1712U
#define SESSION_VERSION 6
#define SESSION_KEYS_OFFSET 1745U
#define SESSION_LOCATIONS_OFFSET 2001U
#define SESSION_MOUNTS_OFFSET 5073U
#define SESSION_FONT_OFFSET 5648U
#define SESSION_FONT_SIZE 2048U
#define SESSION_SIZE (SESSION_FONT_OFFSET + SESSION_FONT_SIZE)
#if SESSION_SIZE > 8176U
#error Shell session exceeds its flash journal slot
#endif

#endif
