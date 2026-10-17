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

/* Read the partition directory's own end marker, rather than treating it as
 * the ordinary free-block footer. Keep partition names and numbers together. */
__noinline unsigned char cmd_root(unsigned char dev)
{
    struct DirectoryEntry ent;
    unsigned char address[2], h[2], c, quoted, n, done = 0;
    unsigned int number, i, j;
    count = 0;
    cachevalid = 0;
    if (channel_open(2, dev, 0, "$=p") || channel_read(2, address, 2) != 2 ||
        directory_read(2, &ent))
        goto failed;
    strcpy(volume, SYSOUT_PARTITIONS_VOLUME);
    while (!done) {
        if (channel_read(2, h, 2) != 2)
            goto failed;
        if (!h[0] && !h[1])
            break;
        if (channel_read(2, h, 2) != 2)
            goto failed;
        number = h[0] | ((unsigned int)h[1] << 8);
        quoted = n = 0;
        ent.name[0] = 0;
        do {
            if (channel_read(2, &c, 1) != 1)
                goto failed;
            if (c == '"')
                quoted = !quoted;
            else if (quoted && n < 16)
                ent.name[n++] = c;
        } while (c);
        while (n && (ent.name[n - 1] == ' ' || (unsigned char)ent.name[n - 1] == 160))
            --n;
        ent.name[n] = 0;
        if (!number || number > 254)
            continue;
        if (count == MAXFILES)
            goto failed;
        strcpy(directory_entries[count].name, ent.name);
        directory_entries[count].blocks = number;
        directory_entries[count++].type = CBM_T_DIR;
    }
    channel_close(2);
    /* Unsafe or ambiguous names remain accessible through their numeric alias. */
    for (i = 0; i < count; ++i) {
        unsigned char alias = !directory_entries[i].name[0] ||
            strpbrk(directory_entries[i].name, "\\:,\"*?/@") ||
            !strcmp(directory_entries[i].name, ".") || !strcmp(directory_entries[i].name, "..");
        for (j = 0; j < count; ++j)
            if (i != j && !strcmp(directory_entries[i].name, directory_entries[j].name)) {
                alias = 1;
                snprintf(directory_entries[j].name, 17, "@%u", directory_entries[j].blocks);
            }
        if (alias)
            snprintf(directory_entries[i].name, 17, "@%u", directory_entries[i].blocks);
    }
    freeblocks = 0;
    cachedev = dev;
    cachedir[0] = 0;
    cachevalid = 1;
    return 1;
failed:
    channel_close(2);
    error(SYSOUT_ERR_READING_BANK_DIR);
    return 0;
}

/* Resolve a displayed partition name or reserved @number alias. Partition zero
 * remains system storage and is never addressable through the virtual root. */
__noinline unsigned char cmd_lookup(unsigned char dev, const char *name, PartitionInfo *info)
{
    unsigned int i, number = 0;
    const char *q;
    if (name[0] == '@') {
        q = name + 1;
        if (!*q)
            goto absent;
        while (isdigit(*q)) {
            number = number * 10 + *q++ - '0';
            if (number > 254)
                goto absent;
        }
        if (*q || !number)
            goto absent;
    } else {
        if (!cmd_root(dev))
            return 0;
        for (i = 0; i < count; ++i)
            if (!strcmp(directory_entries[i].name, name)) {
                number = directory_entries[i].blocks;
                break;
            }
        if (!number)
            goto absent;
    }
    if (!cmd_partition(dev, number, info))
        return 0;
    if (info->type && info->type != 255)
        return 1;
absent:
    error(SYSOUT_PARTITION_NOT_FOUND);
    return 0;
}

#pragma code(code)
#pragma data(data)
