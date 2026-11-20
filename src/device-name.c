#include <ctype.h>
#include <string.h>
#include "device-name.h"

/* Match an exact DOS device name, with an optional trailing colon. */
unsigned char reserved_device(const char *name)
{
    unsigned int size = strlen(name);
    if (size != 3 && (size != 4 || name[3] != ':'))
        return 0;
    if (toupper(name[0]) == 'C' && toupper(name[1]) == 'O' && toupper(name[2]) == 'N')
        return DEVICE_CON;
    if (toupper(name[0]) == 'P' && toupper(name[1]) == 'R' && toupper(name[2]) == 'N')
        return DEVICE_PRN;
    if (toupper(name[0]) == 'N' && toupper(name[1]) == 'U' && toupper(name[2]) == 'L')
        return DEVICE_NUL;
    return 0;
}
