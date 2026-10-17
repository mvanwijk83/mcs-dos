/* Disk-wide metadata and validation keep directory cache contents intact.
 * All paths crossing a bank gate live in RAM, never in bank-local ROM. */
#include "core.h"
#pragma code(volume_code)
#pragma data(volume_data)

/* Keep the 40-column presentation separate from directory enumeration. */
__noinline void bank_direntry(unsigned int index, const char *shown, unsigned char soft)
{
    Entry *entry = &directory_entries[index];
    PartitionInfo info;
    char label[12];
    const char *blocks, *type;
    if (entry->type == CBM_T_DIR) {
        /* G-P does not select a partition or replace the directory cache. */
        if (location_root(p1.dev, p1.dir) && partition_info(p1.dev, entry->blocks, &info)) {
            type = info.type == 1 ? SYSOUT_PARTITION_NATIVE :
                info.type == 2 ? SYSOUT_PARTITION_1541 :
                info.type == 3 ? SYSOUT_PARTITION_1571 :
                info.type == 4 ? SYSOUT_PARTITION_1581 : SYSOUT_PARTITION_UNKNOWN;
            snprintf(label, sizeof(label), SYSOUT_PARTITION_BRACKETS, type);
            print(SYSOUT_DIR_SUBDIR_ENTRY, shown);
            print(SYSOUT_DIR_PARTITION, label);
        } else
            print(SYSOUT_DIR_SUBDIR_ENTRY, shown);
    } else {
        print(SYSOUT_DIR_ENTRY, shown, typename(entry->type), allocated(entry->blocks));
        if (!soft) {
            blocks = decimal(entry->blocks);
            print(strlen(blocks) > 3 ? SYSOUT_DIR_BLOCKS_SHORT : SYSOUT_DIR_BLOCKS, blocks);
        }
    }
    /* A full-width row already advances the physical or redirected cursor. */
    if (redirected ? outputcol : ox)
        newline();
}

__noinline void bank_dirfooter(unsigned int files, unsigned int dirs, unsigned int blocks, unsigned char soft)
{
    unsigned char model = drivemodel(p1.dev, 0);
    unsigned char directories = dirs || model == DRIVE_1581 || model == DRIVE_CMD_HD ||
        model == DRIVE_CMD_FD || model >= DRIVE_SOFTIEC;
    print(SYSOUT_DIR_TOTAL, files, allocated(blocks));
    newline();
    if (directories)
        print(SYSOUT_DIR_COUNT, dirs);
    else if (!soft)
        outs(SYSOUT_DIR_COUNT_BLANK);
    if (!soft)
        print(SYSOUT_DIR_FREE, allocated(freeblocks));
    if (redirected ? outputcol : ox)
        newline();
}

/* Return 0 for the legacy BAM path, 1 for root metadata, 2 for an unreadable
 * root, and 3 for CMD's synthetic container, which has no volume disk ID. */
__noinline unsigned char bank_rootmetadata(unsigned char dev, char *label, char *id)
{
    unsigned char model, kind, track, sector, n, ok, switched = 0, result = 2;
    char restore[PATHSIZE], root[18];
    const char *slash;
    if (!dev)
        return 0;
    model = drivemodel(dev, 0);
    kind = location_kind();
    if (model == DRIVE_CMD_HD || model == DRIVE_CMD_FD) {
        if (!kind)
            return 3;
        if (kind != 1 && kind != 4)
            return 0;
    } else if (model != DRIVE_1581)
        return 0;
    track = kind == 1 ? 1 : 40;
    sector = kind == 1 ? 1 : 0;
    /* 1581 direct-access reads are confined to the selected extent. Read
     * root metadata there, then restore the requested listing's directory.
     * Selection alone never replaces the shared directory entries. */
    if (kind == 4 && location_header() != 40) {
        strcpy(restore, cachedir);
        root[0] = 0;
        if (model == DRIVE_CMD_HD || model == DRIVE_CMD_FD) {
            slash = strchr(restore, 0x5c);
            n = slash ? slash - restore : strlen(restore);
            memcpy(root, restore, n); root[n] = 0;
        }
        if (!location_select(dev, root))
            return 2;
        switched = 1;
    }
    if (!rawopen(dev))
        goto finished;
    ok = blockio(dev, track, sector, 0);
    channel_close(2);
    if (!ok || io[2] != (kind == 1 ? 0x48 : 0x44))
        goto finished;
    for (n = 0; n < 16 && (unsigned char)io[n + 4] != 160; ++n)
        label[n] = io[n + 4];
    label[n] = 0;
    id[0] = io[22]; id[1] = io[23]; id[2] = 0;
    result = 1;
finished:
    if (switched && !location_select(dev, restore))
        return 2;
    return result;
}

/* Print the cached volume name and, for disks, read and display its ID.
 *
 * dev: Device whose directory metadata is currently cached. */
__noinline void bank_volumeheader(unsigned char dev)
{
    char shown[17];
    unsigned char ok, root;
    optionalheader = 1;
    root = bank_rootmetadata(dev, shown, diskid);
    optionalheader = 0;
    uppername(root == 1 ? shown : volume, shown);
    print(SYSOUT_VOL_HEADER, drivename(dev));
    if (ox + strlen(shown) > 40)
        newline();
    outs(shown);
    if (ox)
        newline();
    if (!dev) {
        outs(SYSOUT_CRT_ID_HEADER);
        return;
    }
    if (root) {
        if (root == 1) {
            diskid[0] = toupper(diskid[0]);
            diskid[1] = toupper(diskid[1]);
            print(SYSOUT_DISK_ID_HEADER, diskid);
        }
        return;
    }
    optionalheader = 1;
    ok = bam(dev);
    optionalheader = 0;
    if (ok) {
        diskid[0] = toupper(io[idoff]);
        diskid[1] = toupper(io[idoff + 1]);
        diskid[2] = 0;
        print(SYSOUT_DISK_ID_HEADER, diskid);
    }
}

/* The virtual root is not CMD's reserved system partition (partition zero). */
__noinline unsigned char bank_partitionheader(unsigned char dev)
{
    unsigned char model = drivemodel(dev, 0), kind = location_kind();
    if ((model == DRIVE_CMD_HD || model == DRIVE_CMD_FD) && kind >= 1 && kind <= 4) {
        print(SYSOUT_PARTITION_TYPE, kind == 1 ? SYSOUT_PARTITION_NATIVE :
              kind == 2 ? SYSOUT_PARTITION_1541 : kind == 3 ? SYSOUT_PARTITION_1571 : SYSOUT_PARTITION_1581);
        return 1;
    }
    return 0;
}

/* A CBM allocation need not be a formatted directory. Preserve raw reservations
 * by inspecting the child's header before issuing any DOS VALIDATE within it. */
static unsigned char formattedchild(Path *p)
{
    unsigned char track, ok;
    if (!fileentry(p))
        return 2;
    track = io[entryoffset + 3];
    if (io[entryoffset + 4])
        return 0;
    if (!rawopen(p->dev))
        return 2;
    ok = blockio(p->dev, track, 0, 0);
    channel_close(2);
    if (!ok)
        return 2;
    return io[2] == 0x44 && io[0] == track && io[1] >= 3 && io[1] < 40;
}

/* DOS handles a native directory tree in one partition-wide V command.
 * 1581 subpartitions each need their own V, reached by an iterative walk. */
static unsigned char validatetree(Path *p)
{
    unsigned int boundary = strlen(p->dir), i, next;
    unsigned char kind, result;
    char *slash;
    p->name[0] = 0;
    for (;;) {
        if (stop() || !location_select(p->dev, p->dir))
            return 0;
        kind = location_kind();
        if (!p->name[0] && !command(p->dev, "v0"))
            return 0;
        if (kind != 4)
            return 1;
        if (!location_list(p->dev, p->dir))
            return 0;
        next = count;
        for (i = 0; i < count; ++i)
            if (directory_entries[i].type == CBM_T_DIR &&
                strcmp(directory_entries[i].name, p->name) > 0 &&
                (next == count || strcmp(directory_entries[i].name, directory_entries[next].name) < 0))
                next = i;
        if (next < count) {
            strcpy(p->name, directory_entries[next].name);
            result = formattedchild(p);
            if (result == 2)
                return 0;
            if (result && !path_join(p))
                return 0;
        } else {
            if (strlen(p->dir) == boundary)
                return 1;
            slash = strrchr(p->dir, 0x5c);
            strcpy(p->name, slash ? slash + 1 : p->dir);
            if (slash)
                *slash = 0;
            else
                p->dir[0] = 0;
        }
    }
}

__noinline unsigned char bank_validate_disk(unsigned char dev)
{
    PartitionInfo info;
    unsigned char model = drivemodel(dev, 0);
    unsigned int i, partitions;
    p2.dev = dev; p2.dir[0] = p2.name[0] = 0;
    if (model != DRIVE_CMD_HD && model != DRIVE_CMD_FD)
        return validatetree(&p2);
    if (!partition_root(dev))
        return 0;
    partitions = count;
    /* Preserve partition numbers while filesystem listings replace the cache. */
    for (i = 0; i < partitions; ++i)
        editbuf[i] = directory_entries[i].blocks;
    for (i = 0; i < partitions; ++i) {
        if (stop() || !partition_info(dev, (unsigned char)editbuf[i], &info))
            return 0;
        if (!info.type || info.type > 4)
            continue; /* System, foreign and CP/M regions have no CBM filesystem. */
        snprintf(p2.dir, sizeof(p2.dir), "@%u", info.number);
        if (!validatetree(&p2))
            return 0;
    }
    return 1;
}
