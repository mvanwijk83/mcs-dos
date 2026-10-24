/* Raw disk operations for supported floppy geometries. io holds one sector;
 * the header read supplies the current track count and label/ID positions. */
#include "core.h"
#pragma code(disk_code)
#pragma data(disk_data)
__noinline unsigned char bank_blockchannel(unsigned char dev, unsigned char lfn,
                                           unsigned char track, unsigned char sector,
                                           unsigned char writing);
__noinline unsigned char bank_blockio(unsigned char dev, unsigned char track, unsigned char sector,
                                      unsigned char writing);
__noinline unsigned char bank_rawchannel(unsigned char dev, unsigned char lfn);
__noinline unsigned char bank_rawopen(unsigned char dev);
__noinline unsigned char bank_tracksectors(unsigned char track, unsigned char tracks);
__noinline unsigned char bank_bam(unsigned char dev);
__noinline unsigned char bank_copyrel(void);
__noinline void bank_volcmd(unsigned char stats);
__noinline void bank_labelcmd(void);
__noinline void bank_formatcmd(void);
__noinline void bank_diskidcmd(void);
__noinline void bank_diskinitcmd(void);
__noinline void bank_diskcopycmd(void);

/* CBM DOS raw block interface. Each drive uses secondary address 2;
 * separate host logical files let two drives keep their buffers open.
 *
 * Transfer one raw disk sector through the shared io buffer; return nonzero on success.
 *
 * dev: Target disk device.
 * lfn: Open direct-access logical file.
 * track: One-based track number.
 * sector: Zero-based sector number.
 * writing: Nonzero writes io; zero reads into io. */
__noinline unsigned char bank_blockchannel(unsigned char dev, unsigned char lfn,
                                           unsigned char track, unsigned char sector,
                                           unsigned char writing)
{
    if (writing) {
        if (!command(dev, "b-p:2 0"))
            return 0;
        if (channel_write(lfn, io, 256) != 256)
            return 0;
    }
    snprintf(diskcmd, sizeof(diskcmd), writing ? "u2:2 0 %u %u" : "u1:2 0 %u %u", track, sector);
    if (!command(dev, diskcmd))
        return 0;
    eof[lfn] = 0; /* U1 resets the direct-access buffer, including its EOF. */
    if (!writing && readio(lfn, io, 256) != 256)
        return 0;
    return 1;
}

/* Transfer one sector using the standard direct-access logical file 2.
 *
 * dev: Target disk device.
 * track: One-based track number.
 * sector: Zero-based sector number.
 * writing: Nonzero writes io; zero reads into io. Return nonzero on success. */
__noinline unsigned char bank_blockio(unsigned char dev, unsigned char track, unsigned char sector,
                                      unsigned char writing)
{
    return bank_blockchannel(dev, 2, track, sector, writing);
}

/* Open a direct-access drive buffer and clear its EOF state.
 *
 * dev: Disk device.
 * lfn: Logical file to use; return nonzero on success. */
__noinline unsigned char bank_rawchannel(unsigned char dev, unsigned char lfn)
{
    if (channel_open(lfn, dev, 2, "#") != 0) {
        channel_close(lfn);
        error(SYSOUT_DRIVE_NOT_READY);
        return 0;
    }
    eof[lfn] = 0;
    POKE(144, 0);
    return 1;
}

/* Open the standard direct-access buffer on logical file 2.
 *
 * dev: Disk device; return nonzero on success. */
__noinline unsigned char bank_rawopen(unsigned char dev)
{
    return bank_rawchannel(dev, 2);
}

/* Return the sector count for a track in the detected disk geometry.
 *
 * track: One-based track number.
 * tracks: Total tracks: 35, 70 or 80. */
__noinline unsigned char bank_tracksectors(unsigned char track, unsigned char tracks)
{
    if (tracks == 80)
        return 40;
    if (track > 35)
        track -= 35;
    return track <= 17 ? 21 : track <= 24 ? 19 : track <= 30 ? 18 : 17;
}

/* Read and validate the disk header into io, updating shared geometry and label offsets.
 *
 * dev: Disk device; return nonzero for a supported readable format. */
__noinline unsigned char bank_bam(unsigned char dev)
{
    unsigned char ok, type = drivetype(dev, 1);
    if (!type)
        return 0;
    headertrack = type == 3 ? 40 : 18;
    labeloff = type == 3 ? 4 : 144;
    idoff = type == 3 ? 22 : 162;
    if (type == 2 && !drivemode(dev, 1))
        return 0;
    if (!bank_rawopen(dev))
        return 0;
    ok = bank_blockio(dev, headertrack, 0, 0);
    channel_close(2);
    disktracks = type == 3 ? 80 : type == 2 && (io[3] & 128) ? 70 : 35;
    if (ok && ((type == 1 && (io[3] & 128)) || io[2] != (type == 3 ? 0x44 : 0x41) ||
               io[0] != headertrack || io[1] != (type == 3 ? 3 : 1))) {
        error(SYSOUT_UNSUPPORTED_DISK_FORMAT);
        ok = 0;
    }
    return ok;
}

/* Read the source's data chain through a direct-access buffer, leaving the
 * drive's REL buffer available for the destination even on a single 1541.
 * DOS creates the destination side sectors; none of their links are copied.
 * editbuf is idle during COPY and holds one complete binary record.
 *
 * Copy a REL file record by record from p1 to p2, letting DOS create destination side sectors. */
/* The preceding space statistics already end with a blank line.
 *
 * Report the detected drive model and its supported disk capacity.
 *
 * dev: Device to inspect. */
__noinline void bank_driveinfo(unsigned char dev)
{
    unsigned char type, geometry;
    if (!dev) {
        print(SYSOUT_DRIVE_MODEL, "EasyFlash");
        say(SYSOUT_VOL_ID_CART);
    } else {
        type = drivemodel(dev, 0);
        if (type >= DRIVE_SOFTIEC)
            print(SYSOUT_DRIVE_MODEL, type == DRIVE_SD2IEC ? "SD2IEC drive" : "SoftIEC drive");
        else if (type >= DRIVE_CMD_HD) {
            geometry = drivetype(dev, 0);
            print(SYSOUT_DRIVE_MODEL, type == DRIVE_CMD_HD
                  ? (geometry == 1 ? "CMD HD (1541)" : geometry == 2 ? "CMD HD (1571)" :
                     geometry == 3 ? "CMD HD (1581)" : "CMD HD")
                  : (geometry == 1 ? "CMD FD (1541)" : geometry == 2 ? "CMD FD (1571)" :
                     geometry == 3 ? "CMD FD (1581)" : "CMD FD"));
        } else
        print(SYSOUT_DRIVE_MODEL, type == 1   ? "1541"
                                  : type == 2 ? "1571"
                                  : type == 3 ? "1581"
                                  : type == 4 ? "1541-II"
                                  : type == 5 ? "1570"
                                              : "Unknown");
        print(SYSOUT_VOL_ID, dev, 'A' + dev - 8);
    }
}

/* Display volume information, optionally including CHKDSK allocation checks.
 *
 * stats: Nonzero selects CHKDSK; zero selects VOL. */
typedef struct DiskWide1581 {
    unsigned int blocks, files, free, directories, directoryblocks;
    unsigned char id[2];
} DiskWide1581;

/* Allocation-report prototype: absolute 1581 sector addresses let us visit
 * sub-partition headers directly, without repeatedly replaying DOS paths.
 * The pending extents and visited-header bitmap use EDIT's idle workspace.
 * Each child BAM excludes its descendants; summing free counts is disjoint. */
static unsigned char diskwide1581(unsigned char dev, DiskWide1581 *result)
{
    unsigned char *pending = (unsigned char *)workspace;
    unsigned char *seen = (unsigned char *)workspace + 160;
    unsigned char top = 1, header, first, last, track, sector, nexttrack, nextsector;
    unsigned char bam, tr, off, start, end, type, n;
    unsigned int entry, blocks, guard = 0;
    memset(result, 0, sizeof(*result));
    memset(seen, 0, 10);
    pending[0] = 40; pending[1] = 80;
    seen[39 >> 3] |= 1 << (39 & 7);
    if (!bank_rawopen(dev))
        return 0;
    while (top) {
        --top;
        header = pending[top * 2]; last = pending[top * 2 + 1];
        first = header == 40 ? 1 : header;
        if (stop() || !bank_blockio(dev, header, 0, 0))
            goto failed;
        if (io[2] != 0x44 || io[0] != header || io[1] < 3 || io[1] >= 40) {
            if (header != 40)
                continue; /* An unformatted CBM area remains reserved space. */
            goto damaged;
        }
        track = io[0]; sector = io[1];
        if (header != 40) {
            ++result->directories;
            result->directoryblocks += 3; /* Header and two BAM sectors. */
        }
        if (header == 40) {
            for (n = 0; n < 16 && (unsigned char)io[4 + n] != 160; ++n)
                volume[n] = io[4 + n];
            volume[n] = 0;
            result->id[0] = io[22]; result->id[1] = io[23];
        }
        /* No child can cross root's track 40, so only one BAM half is
         * relevant for a child; root itself needs both BAM sectors. */
        for (bam = first <= 40 ? 1 : 2; bam <= (last <= 40 ? 1 : 2); ++bam) {
            if (!bank_blockio(dev, header, bam, 0))
                goto failed;
            if (io[2] != 0x44 || (unsigned char)io[3] != 0xbb)
                goto damaged;
            start = first > (bam == 1 ? 1 : 41) ? first : (bam == 1 ? 1 : 41);
            end = last < (bam == 1 ? 40 : 80) ? last : (bam == 1 ? 40 : 80);
            for (tr = start; tr <= end; ++tr)
                /* DOS excludes root's entire directory track from capacity,
                 * although its BAM retains unused directory-sector bits.
                 * Child headers share their track with ordinary file data. */
                if (header != 40 || tr != 40)
                    result->free += (unsigned char)io[16 + ((tr - 1) % 40) * 6];
        }
        while (track) {
            if (track < first || track > last || sector >= 40 || ++guard > 3200)
                goto damaged;
            if (stop() || !bank_blockio(dev, track, sector, 0))
                goto failed;
            if (header != 40)
                ++result->directoryblocks;
            nexttrack = io[0]; nextsector = io[1];
            for (entry = 0; entry < 256; entry += 32) {
                type = io[entry + 2] & 7;
                blocks = (unsigned char)io[entry + 30] | ((unsigned int)(unsigned char)io[entry + 31] << 8);
                if (type >= 1 && type <= 4) {
                    ++result->files;
                    result->blocks += blocks;
                } else if (type == 5 && blocks >= 120 && !(blocks % 40) && !io[entry + 4]) {
                    start = io[entry + 3];
                    if (start < first || start > last || start == header ||
                        blocks / 40 > last - start + 1 || (start <= 40 && start + blocks / 40 > 40))
                        goto damaged;
                    off = start - 1;
                    if (top == 80 || (seen[off >> 3] & (1 << (off & 7))))
                        goto damaged;
                    seen[off >> 3] |= 1 << (off & 7);
                    pending[top * 2] = start;
                    pending[top * 2 + 1] = start + blocks / 40 - 1;
                    ++top;
                }
            }
            track = nexttrack; sector = nextsector;
        }
    }
    if (result->blocks + result->free + result->directoryblocks > 3160)
        goto damaged;
    channel_close(2);
    return 1;
damaged:
    error(SYSOUT_INVALID_PARTITION_ALLOCATION);
failed:
    channel_close(2);
    return 0;
}

__noinline void bank_volcmd(unsigned char stats)
{
    unsigned int i;
    unsigned int used = 0, filecount = 0, total = 0, reserved = 0;
    unsigned char whole1581, model;
    DiskWide1581 report;
    char shown[17];
    int compacted;
    if (!path("", &p1))
        return;
    if (stats) {
        if (!reportoptions(1))
            return;
    } else if (argc > 2 || (argc == 2 && !path(args[1], &p1)))
        return;
    model = p1.dev ? drivemodel(p1.dev, 0) : 0;
    whole1581 = stats && (model == DRIVE_1581 || mount_geometry(p1.dev) == 3);
    if (model >= DRIVE_SOFTIEC && !mount_geometry(p1.dev)) {
        if (stats) error(SYSOUT_UNSUPPORTED_DRIVE_TYPE);
        else host_volume(&p1);
        return;
    }
    if (stats && validate == 1 && (model == DRIVE_CMD_HD || model == DRIVE_CMD_FD)) {
        say(SYSOUT_CHECKING_AND_FIXING_DISK);
        if (!validate_disk(p1.dev))
            error(SYSOUT_DISK_VALIDATION_FAILED);
        else
            say(SYSOUT_DISK_VALIDATION_COMPLETE);
        return;
    }
    if (whole1581) {
        p1.dir[0] = 0;
        if (!location_select(p1.dev, p1.dir))
            return;
    } else if (p1.dev && stats && !disk_location(&p1))
        return;
    if (stats && validate == 2 && p1.dev) {
        error(SYSOUT_COMPACT_CRT_ONLY);
        return;
    }
    if (stats && !p1.dev) {
        if (validate == 1) {
            error(SYSOUT_UNSUPPORTED_OP_CRT);
            return;
        }
        if (validate == 2) {
            compacted = cart_compact();
            if (compacted < 0) {
                error(SYSOUT_COMPACT_FAIL);
                return;
            }
            say(compacted ? SYSOUT_COMPACT_COMPLETE : SYSOUT_ALREADY_COMPACT);
            return;
        }
        used = (unsigned int)strtoul(cart_stats(1), 0, 10);
        i = (unsigned int)strtoul(cart_stats(0), 0, 10);
        outs(SYSOUT_CRT_VOL);
        print(SYSOUT_DISK_TOTAL_SPACE, decimal(i));
        filecount = (unsigned int)strtoul(cart_stats(2), 0, 10);
        print(SYSOUT_DISK_ALLOCATED, decimal(used), filecount);
        print(SYSOUT_DISK_AVAILABLE, decimal(i - used));
        if (!validate)
            bank_driveinfo(p1.dev);
        return;
    }
    if (stats && validate) {
        if (!drivetype(p1.dev, 1))
            return;
        say(SYSOUT_CHECKING_AND_FIXING_DISK);
        if (!(whole1581 ? validate_disk(p1.dev) : command(p1.dev, "v0"))) {
            error(SYSOUT_DISK_VALIDATION_FAILED);
            return;
        }
        say(SYSOUT_DISK_VALIDATION_COMPLETE);
    }
    if (!whole1581 && !location_list(p1.dev, p1.dir))
        return;
    if (stats) {
        if (whole1581) {
            if (!diskwide1581(p1.dev, &report))
                return;
            used = report.blocks; filecount = report.files; freeblocks = report.free;
            total = 3160;
            reserved = total - used - freeblocks - report.directoryblocks;
        }
        uppername(volume, shown);
        print(SYSOUT_DISK_VOL, shown);
        if (whole1581)
            print(SYSOUT_DISK_ID_SPACED, toupper(report.id[0]), toupper(report.id[1]));
        else {
            if (!bank_bam(p1.dev))
                return;
            print(SYSOUT_DISK_ID_SPACED, toupper(io[idoff]), toupper(io[idoff + 1]));
            used = 0;
            for (i = 0; i < count; ++i)
                used += directory_entries[i].blocks;
            filecount = count;
            total = used + freeblocks;
        }
        print(SYSOUT_DISK_TOTAL_SPACE, decimal((unsigned long)total * 256));
        print(SYSOUT_DISK_ALLOCATED, allocated(used), filecount);
        if (whole1581 && report.directories)
            print(SYSOUT_DISK_DIRECTORIES, allocated(report.directoryblocks), report.directories);
        if (reserved)
            print(SYSOUT_DISK_RESERVED, allocated(reserved));
        print(SYSOUT_DISK_AVAILABLE, allocated(freeblocks));
        /* Exactly 40 columns: outc already advances to the next row. */
        outs(SYSOUT_DISK_BLOCK_SIZE);
        if (redirected)
            newline();
        print(SYSOUT_DISK_TOTAL_BLOCKS, decimal(total));
        print(SYSOUT_DISK_FREE_BLOCKS, decimal(freeblocks));
        if (!validate)
            bank_driveinfo(p1.dev);
    } else
        volumeheader(p1.dev);
}

/* Validate LABEL and update the volume name in the disk header. */
__noinline void bank_labelcmd(void)
{
    unsigned char i, a = 1;
    char name[17];
    p1.dev = drive;
    if (argc > 1 && strchr(args[1], ':')) {
        if (!path(args[1], &p1))
            return;
        if (p1.name[0]) {
            error(SYSOUT_INVALID_DRIVE_SPEC);
            return;
        }
        ++a;
    }
    if (!disk_location(&p1))
        return;
    if (argc > a + 1) {
        error(SYSOUT_SYNTAX_LABEL);
        return;
    }
    if (argc == a + 1) {
        if (strlen(args[a]) > 16) {
            say(SYSOUT_VOLUME_LABEL_TOO_LONG);
            return;
        }
        filename(args[a], name);
    } else {
        if (!directory(p1.dev) || !bank_bam(p1.dev))
            return;
        uppername(volume, name);
        print(SYSOUT_LABEL_VOLUME, drivename(p1.dev), name);
        print(SYSOUT_LABEL_DISK_ID, toupper(io[idoff]), toupper(io[idoff + 1]));
        outs(SYSOUT_LABEL_PROMPT);
        if (!input(line, 17, 0))
            return;
        filename(line, name);
    }
    if (!bank_bam(p1.dev))
        return;
    for (i = 0; i < 16; ++i)
        io[labeloff + i] = 0xa0;
    memcpy(io + labeloff, name, strlen(name));
    if (!bank_rawopen(p1.dev))
        return;
    i = bank_blockio(p1.dev, headertrack, 0, 1);
    channel_close(2);
    cachevalid = 0;
    if (i && command(p1.dev, "i0"))
        say(SYSOUT_VOL_LABEL_CHANGED);
}

/* FORMAT always targets a physical floppy, independently of its working path.
 * FD extensions are explicit: bare NEW could erase only one CMD partition. */
#pragma code(storage_code)
#pragma data(storage_data)
__noinline void bank_formatcmd(void)
{
    static const char *const formats[] = {"81", "DD8", "HD8", "ED8", "DDN", "HDN", "EDN", "S8", "SN"};
    const char *target = 0, *label = 0, *diskid = 0, *format = 0, *colon;
    char name[17], id[3], root[6], extension[4];
    unsigned char i, n, type, model, lfn;
    for (i = 1; i < argc; ++i) {
        if (!strnicmp(args[i], "/V:", 3) && !label)
            label = args[i] + 3;
        else if (!strnicmp(args[i], "/ID:", 4) && !diskid)
            diskid = args[i] + 4;
        else if (!strnicmp(args[i], "/F:", 3) && !format)
            format = args[i] + 3;
        else if (args[i][0] == '/') {
            error(SYSOUT_INVALID_SWITCH);
            return;
        } else if (!target)
            target = args[i];
        else {
            error(SYSOUT_TOO_MANY_PARAMS);
            return;
        }
    }
    if (!target || !(colon = strchr(target, ':')) || colon[1] || colon - target > 2) {
        error(SYSOUT_SYNTAX_FORMAT);
        return;
    }
    /* Parse an absolute root, so stale remembered CMD paths need no lookup. */
    strcpy(root, target);
    n = strlen(root);
    root[n] = 0x5c; root[n + 1] = 0;
    if (!path(root, &p1))
        return;
    if (p1.name[0] || p1.dir[0]) {
        error(SYSOUT_INVALID_DRIVE_SPEC);
        return;
    }
    if (!p1.dev) {
        error(SYSOUT_UNSUPPORTED_OP_CRT);
        return;
    }
    model = drivemodel(p1.dev, 1);
    if (!model)
        return;
    if (model == DRIVE_CMD_HD) {
        error(SYSOUT_FORMAT_CMD_HD_UNSUPPORTED);
        return;
    }
    if (model == DRIVE_CMD_FD) {
        if (!format) {
            error(SYSOUT_FORMAT_FD_REQUIRES_TYPE);
            return;
        }
        for (n = 0; n < sizeof(formats) / sizeof(formats[0]); ++n)
            if (!stricmp(format, formats[n]))
                break;
        if (n == sizeof(formats) / sizeof(formats[0])) {
            error(SYSOUT_UNSUPPORTED_DISK_FORMAT);
            return;
        }
        /* The NEW extension uses DOS bytes, not presentation PETSCII. */
        filename(formats[n], extension);
        format = extension;
        type = 3; /* Formatting must also work with native or unformatted media. */
    } else {
        if (format) {
            error(SYSOUT_FORMAT_FD_ONLY);
            return;
        }
        type = drivetype(p1.dev, 1);
        if (!type)
            return;
    }
    /* Reject supplied values before confirmation or any drive mutation. */
    if (label && (strlen(label) > 16 || strchr(label, ','))) {
        error(strlen(label) > 16 ? SYSOUT_VOLUME_LABEL_TOO_LONG : SYSOUT_FORMAT_INVALID_LABEL);
        return;
    }
    if (diskid) {
        if (strlen(diskid) != 2) {
            error(SYSOUT_DISK_ID_FORMAT);
            return;
        }
        filename(diskid, id);
        if (!isalnum(id[0]) || !isalnum(id[1])) {
            error(SYSOUT_DISK_ID_FORMAT);
            return;
        }
    }
    print(SYSOUT_INSERT_DISK, drivename(p1.dev));
    say(SYSOUT_ALL_DATA_LOST);
    if (format)
        print(SYSOUT_FORMAT_TYPE, format);
    if (!yesno(SYSOUT_PROCEED_WITH_FORMAT))
        return;
    if (!label) {
        outs(SYSOUT_FORMAT_LABEL_PROMPT);
        if (!input(line, 17, 0))
            return;
        label = line;
    }
    filename(label, name);
    if (strchr(name, ',')) {
        error(SYSOUT_FORMAT_INVALID_LABEL);
        return;
    }
    if (!*name)
        strcpy(name, SYSOUT_FORMAT_DEFAULT_LABEL);
    if (!diskid) {
        outs(SYSOUT_DISK_ID_PROMPT);
        if (!input(line, LINE, 0))
            return;
        diskid = line;
    }
    if (strlen(diskid) != 2) {
        error(SYSOUT_DISK_ID_FORMAT);
        return;
    }
    filename(diskid, id);
    if (!isalnum(id[0]) || !isalnum(id[1])) {
        error(SYSOUT_DISK_ID_FORMAT);
        return;
    }
    /* Establish physical root only after confirmation and value validation. */
    if (model == DRIVE_1581 || model == DRIVE_CMD_FD || mount_active(p1.dev)) {
        nav_invalidate();
        if (!location_select(p1.dev, p1.dir))
            return;
    }
    if (model == DRIVE_CMD_FD) {
        /* NEW is rejected inside native subdirectories. Both root commands
         * are harmless on other formats; discard their unsupported/unformatted
         * status so blank media can still be formatted. Check transport writes. */
        lfn = statuschannel(p1.dev);
        POKE(144, 0);
        if (!lfn || channel_write(lfn, "cd//\r", 5) != 5) {
            error(SYSOUT_WRITE_FAULT_ERR);
            return;
        }
        diskstatus(p1.dev, 0);
        POKE(144, 0);
        if (channel_write(lfn, "/\r", 2) != 2) {
            error(SYSOUT_WRITE_FAULT_ERR);
            return;
        }
        diskstatus(p1.dev, 0);
    }
    say(SYSOUT_FORMATTING);
    if (type == 2 && !drivemode(p1.dev, 1))
        return;
    snprintf(diskcmd, sizeof(diskcmd), "n0:%s,%s%s%s", name, id, format ? "," : "", format ? format : "");
    if (command(p1.dev, diskcmd)) {
        working[location_index(p1.dev)][0] = 0;
        nav_invalidate();
        say(SYSOUT_FORMAT_COMPLETE);
    }
}

#pragma code(disk_code)
#pragma data(disk_data)
/* Execute DISKINIT to initialize a disk through its command channel. */
__noinline void bank_diskinitcmd(void)
{
    unsigned char model;
    if (argc > 2) {
        error(SYSOUT_SYNTAX_DISKINIT);
        return;
    }
    p1.dev = drive;
    if (argc == 2) {
        if (!path(args[1], &p1))
            return;
        if (!strchr(args[1], ':') || p1.name[0]) {
            error(SYSOUT_INVALID_DRIVE_SPEC);
            return;
        }
    }
    if (!p1.dev) {
        error(SYSOUT_UNSUPPORTED_OP_CRT);
        return;
    }
    model = drivemodel(p1.dev, 0);
    if (model >= DRIVE_CMD_HD) {
        error(SYSOUT_UNSUPPORTED_DRIVE_TYPE);
        return;
    }
    command(p1.dev, "i0");
    working[location_index(p1.dev)][0] = 0;
    nav_invalidate();
}

/* Read or change the two-byte disk ID after validating the disk header. */
__noinline void bank_diskidcmd(void)
{
    char id[3];
    unsigned char a = 1, ok, se;
    p1.dev = drive;
    p1.name[0] = 0;
    if (argc > 1 && strchr(args[1], ':')) {
        if (!path(args[1], &p1) || p1.name[0]) {
            error(SYSOUT_INVALID_DRIVE_SPEC);
            return;
        }
        ++a;
    }
    if (argc > a + 1) {
        error(SYSOUT_SYNTAX_DISKID);
        return;
    }
    /* Reject unsupported media before asking for an ID. */
    if (!drivetype(p1.dev, 1))
        return;
    if (argc == a + 1) {
        if (strlen(args[a]) != 2) {
            say(SYSOUT_DISK_ID_FORMAT);
            return;
        }
        filename(args[a], id);
    } else {
        outs(SYSOUT_DISK_ID_PROMPT);
        if (!input(line, LINE, 0))
            return;
        if (strlen(line) != 2) {
            say(SYSOUT_DISK_ID_FORMAT);
            return;
        }
        filename(line, id);
    }
    if (!isalnum(id[0]) || !isalnum(id[1])) {
        error(SYSOUT_INVALID_DISK_ID);
        return;
    }
    if (!bank_bam(p1.dev))
        return;
    io[idoff] = id[0];
    io[idoff + 1] = id[1];
    if (!bank_rawopen(p1.dev))
        return;
    ok = bank_blockio(p1.dev, headertrack, 0, 1);
    /* 1581 keeps two additional ID copies in its allocation-map sectors. */
    if (headertrack == 40)
        for (se = 1; se <= 2 && ok; ++se) {
            ok = bank_blockio(p1.dev, 40, se, 0);
            if (ok) {
                io[4] = id[0];
                io[5] = id[1];
                ok = bank_blockio(p1.dev, 40, se, 1);
            }
        }
    channel_close(2);
    cachevalid = 0;
    if (ok && command(p1.dev, "i0"))
        say(SYSOUT_DISK_ID_CHANGED);
}

/* Copy compatible disk geometries sector by sector, with optional verification. */
__noinline void bank_diskcopycmd(void)
{
    unsigned char tr, se, sectors, ok = 1, type, other, tracks;
    char id[2];
    if (argc != 3 || !path(args[1], &p1) || !path(args[2], &p2)) {
        error(SYSOUT_SYNTAX_DISKCOPY);
        return;
    }
    if (p1.dev == p2.dev) {
        say(SYSOUT_TWO_DIFF_DRIVES);
        return;
    }
    if (p1.name[0] || p2.name[0]) {
        error(SYSOUT_INVALID_DRIVE_SPEC);
        return;
    }
    type = drivetype(p1.dev, 1);
    if (!disk_location(&p2))
        return;
    other = drivetype(p2.dev, 1);
    if (!type || !other)
        return;
    if (!bank_bam(p1.dev))
        return;
    tracks = disktracks;
    /* A physical 1571 can format either side count. CMD partitions have fixed
     * geometries, so compare the source medium rather than physical models. */
    type = tracks == 80 ? 3 : tracks == 70 ? 2 : 1;
    if (type != other && !(type == 1 && drivemodel(p2.dev, 0) == DRIVE_1571)) {
        error(SYSOUT_INCOMPATIBLE_DRIVE);
        return;
    }
    id[0] = io[idoff];
    id[1] = io[idoff + 1];
    say(drivemodel(p2.dev, 0) >= DRIVE_CMD_HD ? SYSOUT_PARTITION_OVERWRITTEN
                                           : SYSOUT_DEST_DISK_OVERWRITTEN);
    if (!yesno(SYSOUT_DISKCOPY_PROCEED))
        return;
    if (drivemodel(p2.dev, 0) == DRIVE_1571 && !drivemode(p2.dev, tracks == 70))
        return;
    snprintf(diskcmd, sizeof(diskcmd), "n0:mcs-copy,%c%c", id[0], id[1]);
    if (!command(p2.dev, diskcmd))
        return;
    /* Establish both status channels before opening persistent data buffers. */
    if (!statuschannel(p1.dev) || !statuschannel(p2.dev))
        return;
    if (!bank_rawchannel(p1.dev, 2))
        return;
    if (!bank_rawchannel(p2.dev, 3)) {
        channel_close(2);
        return;
    }
    for (tr = 1; tr <= tracks && ok; ++tr) {
        print(SYSOUT_COPY_TRACK_PROGRESS, tr, tracks);
        sectors = bank_tracksectors(tr, tracks);
        for (se = 0; se < sectors; ++se) {
            ok = bank_blockchannel(p1.dev, 2, tr, se, 0);
            if (!ok)
                break;
            ok = bank_blockchannel(p2.dev, 3, tr, se, 1);
            if (stop())
                ok = 0;
            if (!ok)
                break;
        }
    }
    channel_close(3);
    channel_close(2);
    command(p2.dev, "i0");
    cachevalid = 0;
    say(ok ? SYSOUT_COPY_COMPLETE : SYSOUT_DISK_COPY_NOT_COMPLETED);
}

#pragma code(code)
#pragma data(data)
