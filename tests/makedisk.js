// Verify the shell options and the SD2IEC sparse writes for each image format.
require('./setup');
const fs = require('fs');
const {functions} = require('./source');
const header = fs.readFileSync('src/mount.h', 'utf8');
const imageTypes = header.match(/typedef struct ImageLayout[\s\S]*?} ImageLabel;/)[0];
const layouts = fs.readFileSync('src/mount.c', 'utf8')
    .match(/const ImageLayout image_layouts\[3\] = \{[\s\S]*?\};/)[0];

fs.writeFileSync('build/test-makedisk.c', `
#include <ctype.h>
#include <string.h>
#define LINE 128
${imageTypes}
${layouts}
typedef struct { unsigned char dev; char name[17], dir[128]; } Path;
typedef struct { unsigned char number, type; } PartitionInfo;
static Path p1, outputpath;
static unsigned char argc, model, redirected, cachevalid, aborted;
static const char *args[6], *answers[2], *message;
static char line[LINE], working[24][128];
static unsigned char io[256], prompts, inputs, creates, scratches, fail_write;
static unsigned char expected_kind, seeks, writes, wire_ok;
static unsigned long position;
static ImageLabel captured;
static unsigned int ultimatebase = 0x0400, uci_sector;
static unsigned char list_valid, check_crc, verify_failure, verified;
static char workspace[960], statusbuf[64];
static const unsigned char *read_sector;
static const char *read_status;
static unsigned int read_size, read_at;
static unsigned char read_pushes, read_acks, read_aborts, read_status_at, read_phase, bad_byte;

static void poke(unsigned int address, unsigned char value)
{
    if (address != ultimatebase) return;
    if (value == 1) ++read_pushes;
    if (value == 2) ++read_acks;
    if (value == 4) ++read_aborts;
}
static unsigned char peek(unsigned int address)
{
    if (address != ultimatebase || read_pushes != 2) return 0;
    if (!read_phase) {
        read_phase = 1;
        return 0x20;
    }
    if (read_at < read_size) {
        *(volatile unsigned char *)0x0402 = read_sector[(unsigned char)read_at] ^
                                           (bad_byte && read_at == 17);
        ++read_at;
        return 0xa0;
    }
    if (read_phase == 1) {
        read_phase = 2;
        return 0x20;
    }
    if (read_status[read_status_at]) {
        *(volatile unsigned char *)0x0403 = read_status[read_status_at++];
        return 0x60;
    }
    return 0x20;
}
#define POKE(a, b) poke(a, b)
#define PEEK(a) peek(a)

/* Full-sector CRCs from VICE c1541 -format "test label,x7" for each type. */
static const unsigned long expected_crc[3][4] = {
    {0xbd5811dcUL, 0xde588bdbUL},
    {0xa4e612bcUL, 0xde588bdbUL, 0xa45f0623UL},
    {0x34e7605fUL, 0x987475feUL, 0x76745dd2UL, 0xde588bdbUL}
};
static const unsigned int expected_sectors[3][5] = {
    {357, 358, 683}, {357, 358, 1040, 1366}, {1560, 1561, 1562, 1563, 3200}
};
static const unsigned int prefixes[3][5] = {
    {171, 2, 1}, {256, 2, 105, 1}, {29, 256, 256, 2, 1}
};
static const unsigned char write_count[3] = {3, 4, 5};

static void error(const char *text) { message = text; }
static void say(const char *text) { message = text; }
static void outs(const char *text)
{
    prompts |= !strcmp(text, SYSOUT_FORMAT_LABEL_PROMPT) ? 1 : 2;
}
static unsigned char input(char *dest, unsigned int size, unsigned char edit)
{
    const char *answer = answers[inputs++];
    if (!answer) return 0;
    strcpy(dest, answer);
    return 1;
}
static void filename(const char *s, char *d) { strcpy(d, s); }
static unsigned char path(const char *s, Path *p)
{
    const char *leaf = strrchr(s, 0x5c);
    strcpy(p->name, leaf ? leaf + 1 : s);
    p->dev = model == DRIVE_SD2IEC ? 8 : 11;
    return 1;
}
static unsigned char drivemodel(unsigned char d, unsigned char report) { return model; }
static unsigned char mount_active(unsigned char d) { return 0; }
static unsigned char location_index(unsigned char d) { return d - 7; }
static void nav_invalidate(void) {}
static unsigned char location_select(unsigned char d, const char *s) { return 1; }
static unsigned char partition_info(unsigned char d, unsigned char n, PartitionInfo *info)
{
    info->number = info->type = 1;
    return 1;
}
static unsigned char command(unsigned char d, const char *s)
{
    if (!strncmp(s, "s0:", 3)) ++scratches;
    return 1;
}
static unsigned char statuschannel(unsigned char d) { return 15; }
static unsigned char diskstatus(unsigned char d, unsigned char report) { return report ? 0 : 50; }
static void channel_close(unsigned char lfn) {}
static unsigned char channel_open(unsigned char lfn, unsigned char dev, unsigned char sa,
                                  const char *name)
{
    ++creates;
    return 0;
}
static unsigned long sector_crc(const unsigned char *data, unsigned int length)
{
    unsigned long crc = 0xffffffffUL;
    unsigned int i;
    unsigned char bit;
    for (i = 0; i < 256; ++i) {
        if (i < length) crc ^= data[i];
        for (bit = 0; bit < 8; ++bit)
            crc = (crc >> 1) ^ ((crc & 1) ? 0xedb88320UL : 0);
    }
    return ~crc;
}
static int channel_write(unsigned char lfn, const void *buf, unsigned int length)
{
    const unsigned char *data = buf;
    unsigned char type = expected_kind - 1;
    unsigned long offset;
    if (lfn == 15) {
        offset = data[2] | ((unsigned long)data[3] << 8) | ((unsigned long)data[4] << 16);
        if (length != 6 || data[0] != 0x50 || data[1] != 3 || data[5] || offset <= position)
            wire_ok = 0;
        position = offset;
        ++seeks;
        return length;
    }
    if (fail_write) return 0;
    if (writes >= write_count[type]) return 0;
    offset = expected_sectors[type][writes] * 256UL;
    if (writes == write_count[type] - 1) {
        --offset;
        if (data[0]) wire_ok = 0;
    } else if (sector_crc(data, length) != expected_crc[type][writes]) {
        wire_ok = 0;
    }
    if (position != offset || length != prefixes[type][writes]) wire_ok = 0;
    ++writes;
    position += length;
    return length;
}
static unsigned char stop(void) { return 0; }
static void softiec_list_begin(const Path *p) { list_valid = 1; }
static unsigned char softiec_list(const Path *p, void *records, unsigned char n, char *names)
{
    return 1;
}
static void softiec_native(const char *s, char *d) { strcpy(d, s); }
static unsigned char softiec_wait(unsigned char mask, unsigned char value) { return 1; }
static unsigned char softiec_reply(unsigned char *data, unsigned int capacity,
                                   unsigned int *length, unsigned char *more)
{
    *more = 0;
    return 1;
}
static unsigned char softiec_dos(unsigned char cmd, const char *a, const char *b,
                                 unsigned char *data, unsigned int capacity,
                                 unsigned int *length, unsigned char *more)
{
    if (cmd == 8) {
        unsigned char type = expected_kind - 1;
        unsigned int sectors = expected_sectors[type][write_count[type] - 1];
        *length = 4;
        data[0] = data[3] = 0;
        data[1] = sectors;
        data[2] = sectors >> 8;
        if (uci_sector != sectors) wire_ok = 0;
    }
    if (cmd == 9) ++scratches;
    return 1;
}
static unsigned char softiec_disk_open(const char *name, unsigned char mode)
{
    ++creates;
    return mode == 6;
}
static unsigned char softiec_disk_verify(const char *name, unsigned char kind, const ImageLabel *label)
{
    ++verified;
    return !verify_failure;
}
static void check_uci_sector(const unsigned char *data)
{
    unsigned char type = expected_kind - 1, index, offset, length;
    for (index = 0; index + 1 < write_count[type]; ++index) {
        if (uci_sector != expected_sectors[type][index]) continue;
        if (!data || (check_crc && sector_crc(data, 256) != expected_crc[type][index])) {
            wire_ok = 0;
        } else if (!index) {
            offset = type == 2 ? 4 : 144;
            for (length = 0; length < 16 && data[offset + length] != 0xa0; ++length)
                captured.name[length] = data[offset + length];
            captured.name[length] = 0;
            memcpy(captured.id, data + offset + 18, 2);
            captured.id[2] = 0;
        }
        return;
    }
    if (data) wire_ok = 0;
}
static unsigned char softiec_disk_write(unsigned char count, const unsigned char *first,
                                        const unsigned char *second)
{
    /* A full packet starting at a physical sector boundary can be corrupted. */
    if (count == 2 && !(uci_sector & 1)) wire_ok = 0;
    check_uci_sector(first);
    ++uci_sector;
    if (count == 2) {
        check_uci_sector(second);
        ++uci_sector;
    }
    return 1;
}
${functions('format_label_valid', 'format_label', 'format_id', 'makedisk_title', 'imagekind', 'image_header',
    'image_154x_bam', 'image_1581_bam', 'image_metadata', 'sd_image_write', 'sd_makedisk',
    'softiec_disk_check', 'softiec_makedisk', 'makediskcmd')}

static void reset(const char *name, unsigned char kind, unsigned char devmodel)
{
    argc = 4;
    args[1] = name;
    args[2] = "/V:TEST LABEL";
    args[3] = "/I:X7";
    model = devmodel;
    expected_kind = kind;
    message = 0;
    answers[0] = answers[1] = 0;
    prompts = inputs = creates = scratches = fail_write = seeks = writes = 0;
    position = 0;
    uci_sector = check_crc = verify_failure = verified = 0;
    wire_ok = 1;
}
static unsigned char success(void)
{
    return creates == 1 && wire_ok && message && !strcmp(message, "Disk image created");
}
static unsigned char verify_read(unsigned int size, const char *status, unsigned char corrupt,
                                 unsigned char success, unsigned char abort_reply)
{
    static unsigned char pattern[256];
    unsigned char i = 0, ok;
    do { pattern[i] = i; } while (++i);
    read_sector = pattern;
    read_status = status;
    read_size = size;
    bad_byte = corrupt;
    read_at = read_pushes = read_acks = read_aborts = read_status_at = read_phase = 0;
    ok = softiec_disk_check(357, pattern);
    return ok == success && read_at == size &&
           read_acks == !abort_reply && read_aborts == abort_reply;
}
int main(void)
{
    static const char *const names[] = {"disk.D64", "A:\\\\disk.d71", "8:\\\\disk.D81"};
    unsigned char i;
    for (i = 0; i < 3; ++i) {
        reset(names[i], i + 1, DRIVE_SD2IEC);
        makediskcmd();
        if (!success() || prompts || seeks != 3 || writes != write_count[i]) return i + 1;
        reset(names[i], i + 1, DRIVE_SOFTIEC);
        check_crc = 1;
        makediskcmd();
        if (!success() || prompts || verified != 1) return 13 + i;
    }
    reset("disk", 0, DRIVE_SOFTIEC);
    makediskcmd();
    if (creates || prompts || !message || strcmp(message, "Invalid format")) return 4;
    reset("disk.DNP", 0, DRIVE_SOFTIEC);
    makediskcmd();
    if (creates || prompts || !message || strcmp(message, "Invalid format")) return 5;
    reset("disk.D71", 2, DRIVE_SOFTIEC);
    argc = 2; answers[0] = ""; answers[1] = "A1";
    makediskcmd();
    if (!success() || prompts != 3 || inputs != 2 ||
        strcmp(captured.name, SYSOUT_FORMAT_DEFAULT_LABEL) || strcmp(captured.id, "A1")) return 6;
    reset("disk.D81", 3, DRIVE_SOFTIEC);
    argc = 3; answers[0] = "Z9";
    makediskcmd();
    if (!success() || prompts != 2 || strcmp(captured.name, "TEST LABEL") ||
        strcmp(captured.id, "Z9")) return 7;
    reset("disk.D64", 1, DRIVE_SOFTIEC);
    argc = 3; args[2] = "/I:Q3"; answers[0] = "PROMPTED";
    makediskcmd();
    if (!success() || prompts != 1 || strcmp(captured.name, "PROMPTED") ||
        strcmp(captured.id, "Q3")) return 8;
    reset("disk.D71", 2, DRIVE_SOFTIEC);
    args[3] = "/I:bad";
    makediskcmd();
    if (creates || prompts || !message || strcmp(message, SYSOUT_DISK_ID_FORMAT)) return 9;
    reset("disk.D71", 2, DRIVE_SOFTIEC);
    args[2] = "/V:one,two";
    makediskcmd();
    if (creates || prompts || !message || strcmp(message, SYSOUT_FORMAT_INVALID_LABEL)) return 10;
    reset("disk.D81", 3, DRIVE_SOFTIEC);
    argc = 2;
    makediskcmd();
    if (creates || inputs != 1 || message) return 11;
    reset("disk.D81", 3, DRIVE_SD2IEC);
    fail_write = 1;
    makediskcmd();
    if (creates != 1 || scratches != 1 || !message || strcmp(message, SYSOUT_MAKEDISK_FAILED))
        return 12;
    reset("disk.D64", 1, DRIVE_SOFTIEC);
    verify_failure = 1;
    makediskcmd();
    if (creates != 1 || verified != 1 || scratches != 1 ||
        !message || strcmp(message, SYSOUT_MAKEDISK_FAILED)) return 16;
    if (!verify_read(256, "", 0, 1, 0) || !verify_read(256, "00,OK", 0, 1, 0) ||
        !verify_read(256, "", 1, 0, 0) || !verify_read(256, "25,WRITE ERROR", 0, 0, 0) ||
        !verify_read(255, "", 0, 0, 1) || !verify_read(257, "", 0, 0, 1)) return 17;
    return 0;
}
`);
require('./simulator')('build/test-makedisk.c', {mount: true});
console.log('PASS MAKEDISK format selection, prompts, SD2IEC sparse writes, Ultimate sectors and cleanup');
