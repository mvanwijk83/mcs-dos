#include "core.h"
#pragma code(disk_code)
#pragma data(disk_data)
__noinline unsigned char bank_blockchannel(unsigned char dev, unsigned char lfn, unsigned char track,
                                  unsigned char sector, unsigned char writing);
__noinline unsigned char bank_blockio(unsigned char dev, unsigned char track, unsigned char sector,
                             unsigned char writing);
__noinline unsigned char bank_rawchannel(unsigned char dev, unsigned char lfn);
__noinline unsigned char bank_rawopen(unsigned char dev);
__noinline unsigned char bank_drivetype(unsigned char dev, unsigned char report);
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
 * separate host logical files let two drives keep their buffers open. */
__noinline unsigned char bank_blockchannel(unsigned char dev, unsigned char lfn, unsigned char track,
                                  unsigned char sector, unsigned char writing)
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

__noinline unsigned char bank_blockio(unsigned char dev, unsigned char track, unsigned char sector,
                             unsigned char writing)
{
    return bank_blockchannel(dev, 2, track, sector, writing);
}

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

__noinline unsigned char bank_rawopen(unsigned char dev)
{
    return bank_rawchannel(dev, 2);
}

/* Read-only stock ROM identification: compressed DOS model strings have the
 * final digit's high bit set. Includes 1541-II and 1571CR. Never reset a drive:
 * DIR may be running with a redirected output file already open. Unknown ROMs
 * retain ordinary DOS file access, but cannot perform raw disk operations. */
__noinline unsigned char bank_drivemodel(unsigned char dev, unsigned char report)
{
    unsigned char lfn = statuschannel(dev), i;
    unsigned char probe[6] = {'m', '-', 'r', 0xc4, 0xe5, 4}, signature[4];
    if (!dev) { if(report) error(SYSOUT_UNSUPPORTED_OPERATION_ON_CARTRIDGE); return 0; }
    if (!lfn)
        return 0;
    for (i = 0; i < 2; ++i) {
        POKE(144, 0);
        if (channel_write(lfn, probe, 6) != 6 || channel_read(lfn, signature, 4) != 4)
            break;
        if (signature[0] == '1' && signature[1] == '5') {
            if (!i && signature[2] == '4' && signature[3] == 0xb1) {
                /* Stock 1541-II: JMP opcode at $FF33 instead of TAX. */
                probe[3] = 0x33; probe[4] = 0xff; probe[5] = 1;
                POKE(144, 0);
                if (channel_write(lfn, probe, 6) == 6 && channel_read(lfn, signature, 1) == 1 && signature[0] == 0x4c)
                    return 4;
                return 1;
            }
            if (!i && signature[2] == '7') {
                if (signature[3] == 0xb0) return 5; /* 1570 */
                if (signature[3] == 0xb1) return 2; /* 1571 / 1571CR */
            }
            if (i && signature[2] == '8' && signature[3] == 0xb1)
                return 3;
        }
        probe[3] = 0xe7;
        probe[4] = 0xa6;
    }
    if (report)
        error(SYSOUT_UNSUPPORTED_DRIVE_TYPE);
    return 0;
}

/* Geometry families stay 1541=1, 1571=2, 1581=3 for all raw operations. */
__noinline unsigned char bank_drivetype(unsigned char dev, unsigned char report)
{
    unsigned char model = bank_drivemodel(dev, report);
    return model == 4 || model == 5 ? 1 : model;
}

__noinline unsigned char bank_tracksectors(unsigned char track, unsigned char tracks)
{
    if (tracks == 80)
        return 40;
    if (track > 35)
        track -= 35;
    return track <= 17 ? 21 : track <= 24 ? 19 : track <= 30 ? 18 : 17;
}

__noinline unsigned char bank_bam(unsigned char dev)
{
    unsigned char ok, type = bank_drivetype(dev, 1);
    if (!type)
        return 0;
    headertrack = type == 3 ? 40 : 18;
    labeloff = type == 3 ? 4 : 144;
    idoff = type == 3 ? 22 : 162;
    if (type == 2 && !command(dev, "u0>m1"))
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
 * editbuf is idle during COPY and holds one complete binary record. */
__noinline unsigned char bank_copyrel(void)
{
    static unsigned char tr, se, r, len, next, sector, ok, code, lfn, tracks, dirtrack;
    static unsigned int off, n, pos, record, guard;
    static char name[17], position[5];
    len = pos = guard = 0;
    ok = record = 1;
    if (!bank_bam(p1.dev) || !bank_rawopen(p1.dev))
        return 0;
    tr = io[0];
    se = io[1];
    tracks = disktracks;
    dirtrack = headertrack;
    while (tr && !len && ++guard <= bank_tracksectors(dirtrack, tracks)) {
        if (tr != dirtrack || se >= bank_tracksectors(tr, tracks))
            break;
        if (!bank_blockio(p1.dev, tr, se, 0))
            break;
        tr = io[0];
        se = io[1];
        for (off = 0; off < 256; off += 32) {
            if ((io[off + 2] & 0x87) != 0x84)
                continue;
            memcpy(name, io + off + 5, 16);
            name[16] = 0;
            for (r = 16; r && (unsigned char)name[r - 1] == 160; --r)
                name[r - 1] = 0;
            if (strcmp(name, p1.name))
                continue;
            len = io[off + 23];
            tr = io[off + 3];
            se = io[off + 4];
            break;
        }
    }
    channel_close(2);
    if (!len || len == 255 || !tr) {
        error(SYSOUT_INVALID_REL_FILE);
        return 0;
    }
    if (!preparewrite(&p2) || !bank_rawopen(p1.dev))
        return 0;
    snprintf(diskcmd, sizeof(diskcmd), "0:%s,l,%c", p2.name, len);
    if (channel_open(3, p2.dev, 3, diskcmd) != 0) {
        channel_close(3);
        channel_close(2);
        return 0;
    }
    if (diskstatus(p2.dev, 1) >= 20)
        ok = 0;
    lfn = statuschannel(p2.dev);
    guard = 0;
    uppername(p1.name, statusbuf);
    outs(statusbuf);
    while (ok && tr) {
        if (tr > tracks || se >= bank_tracksectors(tr, tracks) ||
            ++guard > (tracks == 80   ? 3200
                       : tracks == 70 ? 1366
                                      : 683) ||
            !bank_blockio(p1.dev, tr, se, 0)) {
            ok = 0;
            break;
        }
        next = io[0];
        sector = io[1];
        n = next ? 256 : (unsigned int)sector + 1;
        if (n < 2) {
            ok = 0;
            break;
        }
        for (off = 2; ok && off < n; ++off) {
            editbuf[pos++] = io[off];
            if (pos != len)
                continue;
            position[0] = 'p';
            position[1] = 96 + 3;
            position[2] = record;
            position[3] = record >> 8;
            position[4] = 1;
            POKE(144, 0);
            if (channel_write(lfn, position, 5) != 5) {
                ok = 0;
                break;
            }
            code = diskstatus(p2.dev, 0);
            /* Positioning beyond EOF is how DOS extends a REL file. */
            if (code >= 20 && code != 50) {
                error(statusbuf);
                ok = 0;
                break;
            }
            POKE(144, 0);
            if (channel_write(3, editbuf, len) != len || diskstatus(p2.dev, 1) >= 20) {
                ok = 0;
                break;
            }
            pos = 0;
            ++record;
            if (stop()) {
                ok = 0;
                break;
            }
        }
        tr = next;
        se = sector;
    }
    if (pos)
        ok = 0;
    channel_close(3);
    channel_close(2);
    newline();
    if (diskstatus(p2.dev, 1) >= 20)
        ok = 0;
    return ok;
}

/* The preceding space statistics already end with a blank line. */
__noinline void bank_driveinfo(unsigned char dev)
{
    unsigned char type;
    if (!dev) {
        print(SYSOUT_DRIVE_MODEL, "EasyFlash");
        say(SYSOUT_VOLUME_IDENTIFIER_CART);
    } else {
        type = bank_drivemodel(dev, 0);
        print(SYSOUT_DRIVE_MODEL, type == 1 ? "1541" : type == 2 ? "1571" : type == 3 ? "1581" : type == 4 ? "1541-II" : type == 5 ? "1570" : "Unknown");
        print(SYSOUT_VOLUME_IDENTIFIER, dev, 'A' + dev - 8);
    }
}

__noinline void bank_volcmd(unsigned char stats)
{
    unsigned int i;
    unsigned int used, filecount;
    char shown[17];
    int compacted;
    p1.dev = drive;
    if (stats) {
        if (!reportoptions(1))
            return;
    } else if (argc > 2 || (argc == 2 && !path(args[1], &p1)))
        return;
    if (stats && validate == 2 && p1.dev) {
        error(SYSOUT_COMPACT_CARTRIDGE_ONLY);
        return;
    }
    if (stats && !p1.dev) {
        if (validate == 1) { error(SYSOUT_UNSUPPORTED_OPERATION_ON_CARTRIDGE); return; }
        if (validate == 2) {
            compacted = cart_compact();
            if (compacted < 0) { error(SYSOUT_COMPACTION_FAILED); return; }
            say(compacted ? SYSOUT_COMPACTION_COMPLETE : SYSOUT_JOURNAL_ALREADY_COMPACT);
            return;
        }
        used = (unsigned int)strtoul(cart_stats(1), 0, 10);
        i = (unsigned int)strtoul(cart_stats(0), 0, 10);
        outs(SYSOUT_CARTRIDGE_VOLUME);
        print(SYSOUT_DISK_TOTAL_SPACE, decimal(i));
        filecount = (unsigned int)strtoul(cart_stats(2), 0, 10);
        print(SYSOUT_DISK_ALLOCATED, decimal(used), filecount);
        print(SYSOUT_DISK_AVAILABLE, decimal(i - used));
        if (!validate) bank_driveinfo(p1.dev);
        return;
    }
    if (stats && validate) {
        say(SYSOUT_CHECKING_AND_FIXING_DISK);
        if (!command(p1.dev, "v0")) {
            error(SYSOUT_DISK_VALIDATION_FAILED);
            return;
        }
        say(SYSOUT_DISK_VALIDATION_COMPLETE);
    }
    if (!directory(p1.dev))
        return;
    if (stats) {
        uppername(volume, shown);
        print(SYSOUT_DISK_VOLUME, shown);
        if (!bank_bam(p1.dev))
            return;
        print(SYSOUT_DISK_ID_SPACED, toupper(io[idoff]), toupper(io[idoff + 1]));
        used = 0;
        for (i = 0; i < count; ++i)
            used += directory_entries[i].blocks;
        print(SYSOUT_DISK_TOTAL_SPACE, decimal(((unsigned long)used + freeblocks) * 256));
        print(SYSOUT_DISK_ALLOCATED, allocated(used), count);
        print(SYSOUT_DISK_AVAILABLE, allocated(freeblocks));
        /* Exactly 40 columns: outc already advances to the next row. */
        outs(SYSOUT_DISK_BLOCK_SIZE);
        if (redirected)
            newline();
        print(SYSOUT_DISK_TOTAL_BLOCKS, decimal((unsigned long)used + freeblocks));
        print(SYSOUT_DISK_FREE_BLOCKS, decimal(freeblocks));
        if (!validate) bank_driveinfo(p1.dev);
    } else
        volumeheader(p1.dev);
}

__noinline void bank_labelcmd(void)
{
    unsigned char i, a = 1;
    char name[17];
    p1.dev = drive;
    if (argc > 1 && strchr(args[1], ':')) {
        if (!path(args[1], &p1))
            return;
        if (p1.name[0]) {
            error(SYSOUT_INVALID_DRIVE_SPECIFICATION);
            return;
        }
        ++a;
    }
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
        say(SYSOUT_VOLUME_LABEL_CHANGED);
}

__noinline void bank_formatcmd(void)
{
    char name[17], id[3];
    unsigned char type;
    if (argc != 2 || !path(args[1], &p1)) {
        error(SYSOUT_SYNTAX_FORMAT);
        return;
    }
    type = bank_drivetype(p1.dev, 1);
    if (!type)
        return;
    print(SYSOUT_INSERT_DISK_IN_DRIVE, drivename(p1.dev));
    say(SYSOUT_ALL_DATA_ON_THIS_DISK_WILL_BE_LOST);
    if (!yesno(SYSOUT_PROCEED_WITH_FORMAT))
        return;
    outs(SYSOUT_FORMAT_LABEL_PROMPT);
    if (!input(line, 17, 0))
        return;
    filename(line, name);
    if (!*name)
        strcpy(name, "MCS-DOS");
    outs(SYSOUT_DISK_ID_PROMPT);
    if (!input(line, LINE, 0))
        return;
    if (strlen(line) != 2 || !isalnum(line[0]) || !isalnum(line[1])) {
        say(SYSOUT_DISK_ID_MUST_BE_TWO_LETTERS_OR_DIGITS);
        return;
    }
    filename(line, id);
    say(SYSOUT_FORMATTING);
    if (type == 2 && !command(p1.dev, "u0>m1"))
        return;
    snprintf(diskcmd, sizeof(diskcmd), "n0:%s,%s", name, id);
    if (command(p1.dev, diskcmd))
        say(SYSOUT_FORMAT_COMPLETE);
}

__noinline void bank_diskinitcmd(void)
{
    if (argc > 2) {
        error(SYSOUT_SYNTAX_DISKINIT);
        return;
    }
    p1.dev = drive;
    if (argc == 2) {
        if (!path(args[1], &p1))
            return;
        if (!strchr(args[1], ':') || p1.name[0]) {
            error(SYSOUT_INVALID_DRIVE_SPECIFICATION);
            return;
        }
    }
    if (!p1.dev) {
        error(SYSOUT_UNSUPPORTED_OPERATION_ON_CARTRIDGE);
        return;
    }
    command(p1.dev, "i0");
}

__noinline void bank_diskidcmd(void)
{
    char id[3];
    unsigned char a = 1, ok, se;
    p1.dev = drive;
    p1.name[0] = 0;
    if (argc > 1 && strchr(args[1], ':')) {
        if (!path(args[1], &p1) || p1.name[0]) {
            error(SYSOUT_INVALID_DRIVE_SPECIFICATION);
            return;
        }
        ++a;
    }
    if (argc > a + 1) {
        error(SYSOUT_SYNTAX_DISKID);
        return;
    }
    if (argc == a + 1) {
        if (strlen(args[a]) != 2) {
            say(SYSOUT_DISK_ID_MUST_BE_TWO_LETTERS_OR_DIGITS);
            return;
        }
        filename(args[a], id);
    } else {
        outs(SYSOUT_DISK_ID_PROMPT);
        if (!input(line, LINE, 0))
            return;
        if (strlen(line) != 2) {
            say(SYSOUT_DISK_ID_MUST_BE_TWO_LETTERS_OR_DIGITS);
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

__noinline void bank_diskcopycmd(void)
{
    unsigned char tr, se, sectors, ok = 1, type, other, tracks;
    char id[2];
    if (argc != 3 || !path(args[1], &p1) || !path(args[2], &p2)) {
        error(SYSOUT_SYNTAX_DISKCOPY);
        return;
    }
    if (p1.dev == p2.dev) {
        say(SYSOUT_TWO_DIFFERENT_DRIVES_REQUIRED);
        return;
    }
    if (p1.name[0] || p2.name[0]) {
        error(SYSOUT_INVALID_DRIVE_SPECIFICATION);
        return;
    }
    type = bank_drivetype(p1.dev, 1);
    other = bank_drivetype(p2.dev, 1);
    if (!type || !other)
        return;
    if (type != other) {
        error(SYSOUT_INCOMPATIBLE_DRIVE_TYPE);
        return;
    }
    if (!bank_bam(p1.dev))
        return;
    tracks = disktracks;
    id[0] = io[idoff];
    id[1] = io[idoff + 1];
    say(SYSOUT_DESTINATION_DISK_WILL_BE_OVERWRITTEN);
    if (!yesno(SYSOUT_PROCEED_WITH_DISK_COPY))
        return;
    if (type == 2 && !command(p2.dev, tracks == 70 ? "u0>m1" : "u0>m0"))
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
