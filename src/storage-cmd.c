#include "core.h"
#pragma code(storage_code)
#pragma data(storage_data)

/* CMD ROM identifiers documented by Maurice Randall / Doug Cotton and
 * Todd S. Elliott: https://codebase64.net/doku.php?id=base:detect_drives_on_iec_bus
 * Adapt the two-byte probe to our existing channel ownership, not its scanner. */
unsigned char cmd_model(unsigned char dev)
{
    unsigned char lfn = statuschannel(dev), signature[2];
    const unsigned char probe[7] = {'m', '-', 'r', 0xa4, 0xfe, 2, 13};
    if (!lfn)
        return 0;
    POKE(144, 0);
    if (channel_write(lfn, probe, 7) != 7 || channel_read(lfn, signature, 2) != 2)
        return 0;
    if (signature[1] != 'd')
        return 0;
    return signature[0] == 'h' ? DRIVE_CMD_HD : signature[0] == 'f' ? DRIVE_CMD_FD : 0;
}

/* G-P is binary: NUL and CR may occur anywhere in its 30 data bytes. Always
 * append CR to the request (notably for partition 13) and consume all 31 bytes.
 * number=255 queries the current partition, number=0 the system partition.
 * Protocol: CMD FD-Series User's Manual, "Getting Partition Information";
 * the HD uses the same response layout. */
unsigned char cmd_partition(unsigned char dev, unsigned char number, PartitionInfo *info)
{
    unsigned char request[5] = {'g', '-', 'p', 0, 13}, response[31], i;
    unsigned char lfn = statuschannel(dev);
    request[3] = number;
    POKE(144, 0);
    if (!lfn || channel_write(lfn, request, 5) != 5 ||
        channel_read(lfn, response, 31) != 31 || response[30] != 13 ||
        (number != 255 && response[2] != number)) {
        error(SYSOUT_PARTITION_INFO_FAILED);
        return 0;
    }
    info->type = response[0];
    info->number = response[2];
    memcpy(info->name, response + 3, 16);
    info->name[16] = 0;
    for (i = 16; i && ((unsigned char)info->name[i - 1] == 160 || info->name[i - 1] == ' '); --i)
        info->name[i - 1] = 0;
    info->bytes = (((unsigned long)response[27] << 16) |
                   ((unsigned long)response[28] << 8) | response[29]) * 512;
    return 1;
}

/* Only CBM emulation partitions expose geometries understood by disk.c. */
void cmd_geometry(unsigned char dev, unsigned char report, unsigned char *geometry)
{
    PartitionInfo info;
    *geometry = 0;
    if (!cmd_partition(dev, 255, &info))
        return;
    if (info.type >= 2 && info.type <= 4)
        *geometry = info.type - 1;
    else if (report)
        error(SYSOUT_UNSUPPORTED_DISK_FORMAT);
}

/* Validate the target before CP and verify the selected number afterwards.
 * Invalidate even after failure: the device may have accepted a command whose
 * response was lost. No geometry is retained across a selection. */
unsigned char cmd_select(unsigned char dev, unsigned char number)
{
    PartitionInfo info;
    cachevalid = 0;
    if (!cmd_partition(dev, number, &info))
        return 0;
    if (!info.type || info.type == 255) {
        error(SYSOUT_PARTITION_NOT_FOUND);
        return 0;
    }
    snprintf(diskcmd, sizeof(diskcmd), "cp%u", number);
    if (!command(dev, diskcmd) || !cmd_partition(dev, 255, &info))
        return 0;
    if (info.number != number) {
        error(SYSOUT_PARTITION_SELECT_FAILED);
        return 0;
    }
    return 1;
}

/* Unlike file directories, CMD's partition directory has no free-block line.
 * Its BASIC end marker is two zero bytes; do not ask the file parser to read a
 * four-byte line header after the final entry. */
unsigned char cmd_nextpartition(unsigned int *number)
{
    unsigned char header[2], c;
    if (channel_read(2, header, 2) != 2)
        return 1;
    if (!header[0] && !header[1])
        return 2;
    if (channel_read(2, header, 2) != 2)
        return 1;
    *number = header[0] | ((unsigned int)header[1] << 8);
    do {
        if (channel_read(2, &c, 1) != 1)
            return 1;
    } while (c);
    return 0;
}

/* Ask DOS for the partition-wide free count without CP or a directory cache.
 * An exact filename filter returns at most one entry plus the free-block line.
 * No shell directory cache or file data reads are involved.
 * Native DOS reports the same free count from every subdirectory. */
unsigned char cmd_free(unsigned char dev, unsigned char number, unsigned long *bytes)
{
    struct DirectoryEntry ent;
    unsigned char address[2], r;
    char request[10];
    snprintf(request, sizeof(request), "$%u:!!", number);
    if (channel_open(2, dev, 0, request) || channel_read(2, address, 2) != 2 ||
        directory_read(2, &ent)) {
        channel_close(2);
        return 0;
    }
    do {
        r = directory_read(2, &ent);
    } while (!r);
    channel_close(2);
    if (r != 2)
        return 0;
    *bytes = (unsigned long)ent.size * 256;
    return 1;
}

/* Read the partition numbers into EDIT's idle workspace, then close the
 * directory before G-P, keeping directory reads and command responses separate. */
void cmd_list(unsigned char dev)
{
    struct DirectoryEntry ent;
    PartitionInfo info;
    unsigned char address[2], active, r;
    unsigned int listed = 0, n, number;
    char shown[17];
    unsigned long available;
    const char *space;
    static const char *const types[] = {"----", "CMD", "1541", "1571", "1581",
                                       "CP/M", "PRNT", "FRGN"};
    if (!cmd_partition(dev, 255, &info))
        return;
    active = info.number;
    if (channel_open(2, dev, 0, "$=p") || channel_read(2, address, 2) != 2 ||
        directory_read(2, &ent)) {
        channel_close(2);
        error(SYSOUT_ERR_READING_BANK_DIR);
        return;
    }
    while (!(r = cmd_nextpartition(&number))) {
        if (!number || number > 254)
            continue;
        if (listed == 254) {
            r = 1;
            break;
        }
        editbuf[listed++] = (unsigned char)number;
    }
    channel_close(2);
    if (r != 2) {
        error(SYSOUT_ERR_READING_BANK_DIR);
        return;
    }
    print(SYSOUT_PARTITION_HEADER, dev);
    pagelines = 4;
    for (n = 0; n < listed; ++n) {
        if (!cmd_partition(dev, (unsigned char)editbuf[n], &info))
            return;
        uppername(info.name, shown);
        space = info.type >= 1 && info.type <= 4 &&
                cmd_free(dev, info.number, &available) ? decimal(available) : "--";
        /* 39 columns: never wrap a row or emit a second newline at column 40. */
        print("%c %-3u %-16s %-4s %11s\n", info.number == active ? '*' : ' ',
              info.number, shown, info.type < 8 ? types[info.type] : "????", space);
        if (!page())
            return;
    }
    print(SYSOUT_PARTITION_COUNT, listed);
}

#pragma code(code)
#pragma data(data)
