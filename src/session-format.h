#ifndef MCS_SESSION_FORMAT_H
#define MCS_SESSION_FORMAT_H

/* Version 1 saves bytes in this order. Fixed offsets make the flash format
 * independent of compiler padding and pointer representation. Changing any
 * field requires updating the format version and the return wedge together. */
#define SESSION_ENV_OFFSET 16U
#define SESSION_HISTORY_OFFSET 528U
#define SESSION_RAW_HISTORY_OFFSET 1178U
#define SESSION_PROMPT_OFFSET 1268U
#define SESSION_FONT_OFFSET 1301U
#define SESSION_FONT_SIZE 2048U
#define SESSION_SIZE (SESSION_FONT_OFFSET + SESSION_FONT_SIZE)

#endif
