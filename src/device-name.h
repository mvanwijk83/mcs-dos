#ifndef MCS_DEVICE_NAME_H
#define MCS_DEVICE_NAME_H

#define DEVICE_CON 1
#define DEVICE_PRN 2

unsigned char reserved_device(const char *name);
#pragma compile("device-name.c")

#endif
