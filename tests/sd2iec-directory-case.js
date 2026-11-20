const fs = require('fs');
const {functions} = require('./source');
fs.writeFileSync('build/test-sd2iec-directory-case.c', `
#include <stdio.h>
#define CBM_T_DIR 1
#define CBM_T_PRG 2
struct DirectoryEntry { char name[17]; unsigned char type; };
/* The EasyFlash entry returned by the real device. */
static const char listed[] = {0xc5, 0x41, 0x53, 0x59, 0xc6, 0x4c, 0x41, 0x53, 0x48, 0};
static unsigned char type, opened, closed;
static unsigned char host_begin(unsigned char dev, unsigned char lfn, unsigned char partitions, unsigned char hidden)
{
    opened = 0;
    return dev == 8 && lfn == 6 && !partitions && hidden;
}
static unsigned char directory_read(unsigned char lfn, struct DirectoryEntry *entry)
{
    if (opened++) return 2;
    strcpy(entry->name, listed);
    entry->type = type;
    return 0;
}
static void channel_close(unsigned char lfn) { ++closed; }
${functions('host_dir_component')}
int main(void)
{
    char name[17];
    type = CBM_T_DIR;
    strcpy(name, "EASYFLASH");
    if (!host_dir_component(8, DRIVE_SD2IEC, name) || strcmp(name, listed) || closed != 1) return 1;
    strcpy(name, "EASYFLASH");
    if (host_dir_component(8, DRIVE_SOFTIEC, name) || closed != 2) return 2;
    type = CBM_T_PRG;
    if (host_dir_component(8, DRIVE_SD2IEC, name) || closed != 3) return 3;
    puts("PASS SD2IEC mixed-case directory resolution and file rejection");
    return 0;
}
`);
require('./simulator')('build/test-sd2iec-directory-case.c', {petscii: true});
