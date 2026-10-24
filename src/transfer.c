/* File transfers own their buffers and close writers in the location in
 * which they were opened. No drive selection is assumed to preserve a writer. */
#include "core.h"
#pragma code(transfer_code)
#pragma data(transfer_data)

__noinline unsigned char bank_fileentry(const Path *p);

/* Iterative depth-first listing reuses DIR's path and order workspace. The
 * last child name resumes its parent after the shared directory cache changes;
 * CMD virtual-root children use stable partition numbers for that cursor. */
__noinline void bank_dirwalk(unsigned char flags, unsigned char filter)
{
    unsigned int boundary = strlen(p1.dir), i, j, next, previous, tmp;
    unsigned int *order = (unsigned int *)workspace;
    char pattern[17], *slash;
    unsigned char root;
    int result;
    strcpy(pattern, p1.name);
    p1.name[0] = 0;
    pagelines = 0;
    while (!aborted) {
        if (stop())
            return;
        if (!location_list(p1.dev, p1.dir))
            return;
        root = location_root(p1.dev, p1.dir);
        if (!p1.name[0]) {
            for (i = 0; i < count; ++i)
                order[i] = i;
            if (flags & 4)
                for (i = 1; i < count; ++i) {
                    tmp = order[i];
                    j = i;
                    while (j > ((flags & 128) ? 1 : 0)) {
                        next = order[j - 1];
                        result = 0;
                        if (flags & 16)
                            result = strcmp(typename(directory_entries[next].type),
                                            typename(directory_entries[tmp].type));
                        else if ((flags & 32) && directory_entries[next].blocks != directory_entries[tmp].blocks)
                            result = directory_entries[next].blocks < directory_entries[tmp].blocks ? -1 : 1;
                        if (!result)
                            result = strcmp(directory_entries[next].name, directory_entries[tmp].name);
                        if (flags & 64)
                            result = -result;
                        if (result <= 0)
                            break;
                        order[j--] = next;
                    }
                    order[j] = tmp;
                }
            for (i = 0; i < count; ++i) {
                j = order[i];
                if (directory_entries[j].type == CBM_T_DIR || directory_entries[j].type == CBM_T_CBM ||
                    (filter != 255 && directory_entries[j].type != filter) ||
                    !match(pattern, directory_entries[j].name))
                    continue;
                displaypath(p1.dev, p1.dir, diskcmd);
                snprintf(io, sizeof(io), SYSOUT_FULL_PATH, drivename(p1.dev), 0x5c,
                         diskcmd, p1.dir[0] ? "\\" : "", directory_entries[j].name);
                if (!(flags & 2))
                    uppername(io, io);
                say(io);
                if (!page())
                    return;
            }
        }
        next = count;
        previous = root && p1.name[0] == '@' ? atoi(p1.name + 1) : 0;
        for (i = 0; i < count; ++i) {
            if (directory_entries[i].type != CBM_T_DIR ||
                !strcmp(directory_entries[i].name, ".") || !strcmp(directory_entries[i].name, ".."))
                continue;
            if (root ? directory_entries[i].blocks <= previous : strcmp(directory_entries[i].name, p1.name) <= 0)
                continue;
            if (next == count || (root ? directory_entries[i].blocks < directory_entries[next].blocks :
                strcmp(directory_entries[i].name, directory_entries[next].name) < 0))
                next = i;
        }
        if (next < count) {
            if (root)
                snprintf(p1.name, sizeof(p1.name), "@%u", directory_entries[next].blocks);
            else
                strcpy(p1.name, directory_entries[next].name);
            if (!path_join(&p1))
                return;
        } else {
            if (strlen(p1.dir) == boundary)
                return;
            slash = strrchr(p1.dir, 0x5c);
            strcpy(p1.name, slash ? slash + 1 : p1.dir);
            if (slash)
                *slash = 0;
            else
                p1.dir[0] = 0;
        }
    }
}

/* Read bounded chunks from the source chain, retaining its next sector as a
 * continuation. Neither a raw reader nor a writer survives a location switch.
 * This avoids both the 1581 WRITE FILE OPEN restriction and prefix rescanning. */
static unsigned char switchedcopy(unsigned char type)
{
    unsigned char track, sector, writing = 0, ok = 1, next, nextsector;
    unsigned int used, bytes, guard = 0;
    char letter = type == CBM_T_PRG ? 'p' : type == CBM_T_USR ? 'u' : 's';
    if (!bank_fileentry(&p1))
        return 0;
    track = io[entryoffset + 3]; sector = io[entryoffset + 4];
    do {
        used = 0;
        if (!location_file(p1.dev, p1.dir) || !rawopen(p1.dev))
            return 0;
        while (track && used + 254 <= sizeof(workspace)) {
            if (++guard == 65535U || !blockio(p1.dev, track, sector, 0)) {
                channel_close(2); return 0;
            }
            next = io[0]; nextsector = io[1];
            if (!next && !nextsector) { channel_close(2); return 0; }
            bytes = next ? 254 : nextsector - 1;
            memcpy(workspace + used, io + 2, bytes);
            used += bytes;
            track = next; sector = nextsector;
        }
        channel_close(2);
        if (!location_file(p2.dev, p2.dir))
            return 0;
        snprintf(diskcmd, sizeof(diskcmd), "0:%s,%c,%c", p2.name, letter, writing ? 'a' : 'w');
        if (channel_open(3, p2.dev, 3, diskcmd) || diskstatus(p2.dev, 1) >= 20) {
            channel_close(3); return 0;
        }
        if (used && channel_write(3, workspace, used) != used)
            ok = 0;
        channel_close(3);
        if (diskstatus(p2.dev, 1) >= 20 || stop())
            ok = 0;
        if (!ok)
            return 0;
        writing = 1;
    } while (track);
    return 1;
}

__noinline unsigned char bank_copyfile(unsigned char moving)
{
    int n = -1, i;
    unsigned char type, ok = 1, sourcehost = host_device(p1.dev), targethost = host_device(p2.dev);
    if (!p2.name[0])
        strcpy(p2.name, p1.name);
    if (sameplace(&p1, &p2) && !strcmp(p1.name, p2.name)) {
        say(SYSOUT_FILE_COPY_ON_SELF);
        return 0;
    }
    cachevalid = 0;
    i = findfile(&p1);
    if (i < 0) {
        error(SYSOUT_FILE_NOT_FOUND);
        return 0;
    }
    type = directory_entries[i].type;
    if (type == CBM_T_REL && (sourcehost || targethost)) {
        error(SYSOUT_UNSUPPORTED_FILE_TYPE);
        return 0;
    }
    if (moving && !deletable(&p1))
        return 0;
    if (type == CBM_T_REL) {
        ok = copyrel();
    } else {
        if (type != CBM_T_PRG && type != CBM_T_SEQ && type != CBM_T_USR) {
            error(SYSOUT_UNSUPPORTED_FILE_TYPE);
            return 0;
        }
        if (!preparewrite(&p2))
            return 0;
        /* Same-disk copies can run inside DOS; cross-device copies must stream through RAM. */
        if (p1.dev && sameplace(&p1, &p2)) {
            snprintf(diskcmd, sizeof(diskcmd), "c0:%s=0:%s", p2.name, p1.name);
            ok = command(p1.dev, diskcmd);
        } else if (p1.dev && p1.dev == p2.dev && !sourcehost) {
            ok = switchedcopy(type);
        } else {
            if (!openreadtype(&p1, 2, type))
                return 0;
            if (!openwrite(&p2, type)) {
                channel_close(2);
                return 0;
            }
            uppername(p1.name, statusbuf);
            outs(statusbuf);
            for (;;) {
                if (!sourcehost && !location_select(p1.dev, p1.dir)) {
                    ok = 0;
                    break;
                }
                n = readio(2, io, sizeof(io));
                if (n <= 0)
                    break;
                if ((!targethost && !location_select(p2.dev, p2.dir)) || channel_write(3, io, n) != n || stop()) {
                    ok = 0;
                    break;
                }
            }
            if (n < 0)
                ok = 0;
            /* An unsuccessful cartridge copy must discard its unfinished record rather than commit it. */
            if (!ok)
                channel_abort(3);
            location_select(p1.dev, p1.dir);
            channel_close(2);
            location_select(p2.dev, p2.dir);
            channel_close(3);
            newline();
            if (diskstatus(p2.dev, 1) >= 20)
                ok = 0;
        }
    }
    cachevalid = 0;
    if (!ok) {
        say(SYSOUT_COPY_NOT_COMPLETED);
        return 0;
    }
    /* MOVE deletes the source only after the destination closes successfully. */
    if (moving && !scratch(&p1))
        return 0;
    return 1;
}


#pragma code(code)
#pragma data(data)

#pragma code(transfer_code)
#pragma data(transfer_data)

/* Find a native entry beneath a directory header. Reads are bounded even for
 * damaged directory chains; no BAM interpretation is needed for native CMD. */
static unsigned char scanentry(unsigned char dev, unsigned char track,
                               unsigned char sector, const char *name)
{
    unsigned int off, guard = 0;
    char found[17];
    unsigned char n;
    if (!rawopen(dev))
        return 0;
    if (!blockio(dev, track, sector, 0))
        goto failed;
    track = io[0]; sector = io[1];
    while (track && ++guard < 4096) {
        if (!blockio(dev, track, sector, 0))
            goto failed;
        for (off = 0; off < 256; off += 32) {
            if (!(io[off + 2] & 7))
                continue;
            for (n = 0; n < 16 && io[off + 5 + n] != 160; ++n)
                found[n] = io[off + 5 + n];
            found[n] = 0;
            if (!strcmp(found, name)) {
                entrytrack = track; entrysector = sector; entryoffset = off;
                channel_close(2); return 1;
            }
        }
        track = io[0]; sector = io[1];
    }
failed:
    channel_close(2);
    error(SYSOUT_FILE_NOT_FOUND);
    return 0;
}

/* Resolve a raw directory entry while retaining partition-relative sector
 * addresses. Native directory headers are followed from the partition root. */
__noinline unsigned char bank_fileentry(const Path *p)
{
    unsigned char track, sector, kind, n;
    const char *q;
    char name[17];
    if (!location_file(p->dev, p->dir))
        return 0;
    kind = location_kind();
    track = kind == 1 ? 1 : kind == 4 ? location_header() : 18;
    sector = kind == 1 ? 1 : 0;
    if (kind == 1) {
        q = strchr(p->dir, 0x5c);
        if (q) ++q;
        while (q && *q) {
            n = 0;
            while (*q && (unsigned char)*q != 0x5c && n < 16)
                name[n++] = *q++;
            name[n] = 0;
            if (!scanentry(p->dev, track, sector, name) || (io[entryoffset + 2] & 7) != 6)
                return 0;
            track = io[entryoffset + 3]; sector = io[entryoffset + 4];
            if (*q) ++q;
        }
    }
    return scanentry(p->dev, track, sector, p->name);
}

/* One record per open/close makes REL writes independent of directory changes. */
static unsigned char writerecord(unsigned char len, unsigned int record)
{
    unsigned char lfn, code, ok = 1;
    char position[5];
    if (!location_file(p2.dev, p2.dir))
        return 0;
    snprintf(diskcmd, sizeof(diskcmd), "0:%s,l,%c", p2.name, len);
    if (channel_open(3, p2.dev, 3, diskcmd) || diskstatus(p2.dev, 1) >= 20) {
        channel_close(3); return 0;
    }
    lfn = statuschannel(p2.dev);
    position[0] = 'p'; position[1] = 99;
    position[2] = record; position[3] = record >> 8; position[4] = 1;
    if (!lfn || channel_write(lfn, position, 5) != 5)
        ok = 0;
    code = diskstatus(p2.dev, 0);
    if (code >= 20 && code != 50)
        ok = 0;
    if (ok && (channel_write(3, workspace, len) != len || diskstatus(p2.dev, 1) >= 20))
        ok = 0;
    channel_close(3);
    return diskstatus(p2.dev, 1) < 20 && ok;
}

/* Copy REL data chains, letting the target DOS build all side sectors. Source
 * sectors and destination records are never open across a location switch. */
__noinline unsigned char bank_copyrel(void)
{
    unsigned char tr, se, next, nextsector, len, pos = 0;
    unsigned int off, end, record = 1, guard = 0;
    if (!bank_fileentry(&p1))
        return 0;
    len = io[entryoffset + 23];
    tr = io[entryoffset + 3]; se = io[entryoffset + 4];
    if (!len || len == 255 || !tr || !preparewrite(&p2))
        return 0;
    while (tr && ++guard < 65535U) {
        if (!location_file(p1.dev, p1.dir) || !rawopen(p1.dev))
            return 0;
        if (!blockio(p1.dev, tr, se, 0)) { channel_close(2); return 0; }
        channel_close(2);
        next = io[0]; nextsector = io[1];
        end = next ? 256 : (unsigned int)nextsector + 1;
        if (end < 2)
            return 0;
        for (off = 2; off < end; ++off) {
            workspace[pos++] = io[off];
            if (pos == len) {
                if (!writerecord(len, record++) || stop())
                    return 0;
                pos = 0;
            }
        }
        tr = next; se = nextsector;
    }
    return !tr && !pos;
}

#pragma code(code)
#pragma data(data)
unsigned char entrytrack, entrysector, entryoffset;

#pragma code(transfer_code)
#pragma data(transfer_data)
/* Redirected output is committed in closed chunks, so a directory listing or
 * source reader can switch locations without a live destination writer. */
__noinline unsigned char bank_output_append(void)
{
    unsigned char ok;
    if (!mount_guard(&outputpath)) return 0;
    if (!outputpath.dev)
        return channel_write(5, outputbuf, outputused) == outputused;
    if (!location_file(outputpath.dev, outputpath.dir))
        return 0;
    if (!outputused && outputmode == 'a') {
        outputstarted = 1;
        return 1;
    }
    snprintf(diskcmd, sizeof(diskcmd), "0:%s,s,%c", outputpath.name, outputmode);
    if (channel_open(5, outputpath.dev, 5, diskcmd) || diskstatus(outputpath.dev, 1) >= 20) {
        channel_close(5); return 0;
    }
    ok = channel_write(5, outputbuf, outputused) == outputused;
    channel_close(5);
    outputmode = 'a';
    outputstarted = 1;
    return diskstatus(outputpath.dev, 1) < 20 && ok;
}
#pragma code(code)
#pragma data(data)

/* A 1581 reader also loses its continuation when partitions change. Redirected
 * TYPE/FIND therefore use independent file-chain cursors, without open files.
 * The result buffer keeps multi-sector reads safe when the caller uses io. */
#pragma code(transfer_code)
#pragma data(transfer_data)
typedef struct RawReader {
    unsigned char track, sector, offset;
    unsigned int sectors;
} RawReader;
static RawReader rawreaders[2];
static unsigned char rawresult[256];
unsigned char rawreadmask, rawreading;

__noinline unsigned char bank_raw_reader_open(const Path *p, unsigned char lfn)
{
    unsigned char found;
    if (lfn < 2 || lfn > 3)
        return 0;
    rawreading = 1;
    found = bank_fileentry(p);
    rawreading = 0;
    eof[2] = 0;
    if (!found)
        return 0;
    rawreaders[lfn - 2].track = io[entryoffset + 3];
    rawreaders[lfn - 2].sector = io[entryoffset + 4];
    rawreaders[lfn - 2].offset = 0;
    rawreaders[lfn - 2].sectors = 0;
    rawreadmask |= 1 << lfn;
    eof[lfn] = 0;
    return 1;
}

__noinline int bank_raw_reader_read(unsigned char lfn, void *buffer, unsigned int size)
{
    RawReader *cursor = &rawreaders[lfn - 2];
    unsigned int used = 0, available, take;
    unsigned char next, sector, ok = 1;
    if (size > sizeof(rawresult))
        size = sizeof(rawresult);
    if (!cursor->track)
        return 0;
    if (!location_file(p1.dev, p1.dir))
        return -1;
    rawreading = 1;
    if (!rawopen(p1.dev)) {
        rawreading = 0;
        return -1;
    }
    while (used < size && cursor->track) {
        if (!blockio(p1.dev, cursor->track, cursor->sector, 0)) {
            ok = 0;
            break;
        }
        eof[2] = 0;
        next = io[0]; sector = io[1];
        if (!next && !sector) { ok = 0; break; }
        available = next ? 254 : sector - 1;
        if (cursor->offset > available) { ok = 0; break; }
        take = available - cursor->offset;
        if (take > size - used)
            take = size - used;
        memcpy(rawresult + used, io + 2 + cursor->offset, take);
        used += take;
        cursor->offset += take;
        if (cursor->offset == available) {
            cursor->track = next; cursor->sector = sector; cursor->offset = 0;
            if (++cursor->sectors > 3200) { ok = 0; break; }
        }
    }
    channel_close(2);
    rawreading = 0;
    eof[2] = 0;
    if (!ok)
        return -1;
    memcpy(buffer, rawresult, used);
    return used;
}
#pragma code(code)
#pragma data(data)

/* FIND's second cursor starts at the same source, independently of the first. */
void raw_reader_clone(void)
{
    rawreaders[1] = rawreaders[0];
    rawreadmask |= 8;
    eof[3] = 0;
}
