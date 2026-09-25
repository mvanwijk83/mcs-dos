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
        error("Drive not ready");
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
__noinline unsigned char bank_drivetype(unsigned char dev, unsigned char report)
{
    unsigned char lfn = statuschannel(dev), i;
    unsigned char probe[6] = {'m', '-', 'r', 0xc4, 0xe5, 4}, signature[4];
    if (!dev) { if(report) error("Unsupported operation on cartridge"); return 0; }
    if (!lfn)
        return 0;
    for (i = 0; i < 2; ++i) {
        POKE(144, 0);
        if (channel_write(lfn, probe, 6) != 6 || channel_read(lfn, signature, 4) != 4)
            break;
        if (signature[0] == '1' && signature[1] == '5' && signature[3] == 0xb1) {
            if (!i && signature[2] == '4')
                return 1;
            if (!i && signature[2] == '7')
                return 2;
            if (i && signature[2] == '8')
                return 3;
        }
        probe[3] = 0xe7;
        probe[4] = 0xa6;
    }
    if (report)
        error("Unsupported drive type");
    return 0;
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
        error("Unsupported disk format");
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
        error("Invalid REL file");
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

__noinline void bank_volcmd(unsigned char stats)
{
    unsigned int i;
    unsigned int used;
    char shown[17];
    p1.dev = drive;
    if (stats) {
        if (!reportoptions(1))
            return;
    } else if (argc > 2 || (argc == 2 && !path(args[1], &p1)))
        return;
    if (stats && !p1.dev) {
        if (validate) { error("Unsupported operation on cartridge"); return; }
        for(i=0;i<6;++i) outs(cart_stats(i));
        return;
    }
    if (stats && validate) {
        say("Checking and fixing disk . . .");
        if (!command(p1.dev, "v0")) {
            error("Disk validation failed");
            return;
        }
        say("Disk validation complete.");
    }
    if (!directory(p1.dev))
        return;
    if (stats) {
        uppername(volume, shown);
        print("Volume %s\n", shown);
        if (!bank_bam(p1.dev))
            return;
        print("Disk ID is %c%c\n\n", toupper(io[idoff]), toupper(io[idoff + 1]));
        used = 0;
        for (i = 0; i < count; ++i)
            used += directory_entries[i].blocks;
        print("%7s bytes total disk space\n", decimal(((unsigned long)used + freeblocks) * 256));
        print("%7s bytes allocated in %u files\n", allocated(used), count);
        print("%7s bytes available on disk\n\n", allocated(freeblocks));
        /* Exactly 40 columns: outc already advances to the next row. */
        outs("    256 bytes in each block (254 usable)");
        if (redirected)
            newline();
        print("%7s total blocks on disk\n", decimal((unsigned long)used + freeblocks));
        print("%7s available blocks on disk\n\n", decimal(freeblocks));
        print("%7s total bytes memory\n", decimal(65536UL));
        print("%7s bytes free\n", decimal(freememory()));
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
            error("Invalid drive specification");
            return;
        }
        ++a;
    }
    if (argc > a + 1) {
        error("Syntax: LABEL [drive:] [name]");
        return;
    }
    if (argc == a + 1) {
        if (strlen(args[a]) > 16) {
            say("Volume label too long");
            return;
        }
        filename(args[a], name);
    } else {
        if (!directory(p1.dev) || !bank_bam(p1.dev))
            return;
        uppername(volume, name);
        print("Volume in drive %s: is %s\n", drivename(p1.dev), name);
        print("Disk ID is %c%c\n", toupper(io[idoff]), toupper(io[idoff + 1]));
        outs("Volume label  (16 characters)? ");
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
        say("Volume label changed.");
}

__noinline void bank_formatcmd(void)
{
    char name[17], id[3];
    unsigned char type;
    if (argc != 2 || !path(args[1], &p1)) {
        error("Syntax: FORMAT drive:");
        return;
    }
    type = bank_drivetype(p1.dev, 1);
    if (!type)
        return;
    print("Insert disk in drive %s:\n", drivename(p1.dev));
    say("All data on this disk will be lost!");
    if (!yesno("Proceed with format"))
        return;
    outs("Volume label (16 characters): ");
    if (!input(line, 17, 0))
        return;
    filename(line, name);
    if (!*name)
        strcpy(name, "MCS-DOS");
    outs("New disk ID (2 letters or digits): ");
    if (!input(line, LINE, 0))
        return;
    if (strlen(line) != 2 || !isalnum(line[0]) || !isalnum(line[1])) {
        say("Disk ID must be two letters or digits");
        return;
    }
    filename(line, id);
    say("Formatting...");
    if (type == 2 && !command(p1.dev, "u0>m1"))
        return;
    snprintf(diskcmd, sizeof(diskcmd), "n0:%s,%s", name, id);
    if (command(p1.dev, diskcmd))
        say("Format complete.");
}

__noinline void bank_diskidcmd(void)
{
    char id[3];
    unsigned char a = 1, ok, se;
    p1.dev = drive;
    p1.name[0] = 0;
    if (argc > 1 && strchr(args[1], ':')) {
        if (!path(args[1], &p1) || p1.name[0]) {
            error("Invalid drive specification");
            return;
        }
        ++a;
    }
    if (argc > a + 1) {
        error("Syntax: DISKID [drive:] [id]");
        return;
    }
    if (argc == a + 1) {
        if (strlen(args[a]) != 2) {
            say("Disk ID must be two letters or digits");
            return;
        }
        filename(args[a], id);
    } else {
        outs("New disk ID (2 letters or digits): ");
        if (!input(line, LINE, 0))
            return;
        if (strlen(line) != 2) {
            say("Disk ID must be two letters or digits");
            return;
        }
        filename(line, id);
    }
    if (!isalnum(id[0]) || !isalnum(id[1])) {
        error("Invalid disk ID");
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
        say("Disk ID changed.");
}

__noinline void bank_diskcopycmd(void)
{
    unsigned char tr, se, sectors, ok = 1, type, other, tracks;
    char id[2];
    if (argc != 3 || !path(args[1], &p1) || !path(args[2], &p2)) {
        error("Syntax: DISKCOPY source: destination:");
        return;
    }
    if (p1.dev == p2.dev) {
        say("Two different drives required");
        return;
    }
    if (p1.name[0] || p2.name[0]) {
        error("Invalid drive specification");
        return;
    }
    type = bank_drivetype(p1.dev, 1);
    other = bank_drivetype(p2.dev, 1);
    if (!type || !other)
        return;
    if (type != other) {
        error("Incompatible drive type");
        return;
    }
    if (!bank_bam(p1.dev))
        return;
    tracks = disktracks;
    id[0] = io[idoff];
    id[1] = io[idoff + 1];
    say("Destination disk will be overwritten.");
    if (!yesno("Proceed with disk copy"))
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
        print("Copying track %u of %u\n", tr, tracks);
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
    say(ok ? "Copy complete." : "Disk copy not completed.");
}
#pragma code(code)
#pragma data(data)
