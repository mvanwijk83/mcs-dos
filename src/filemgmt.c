/* Directory-based file commands. There is one shared directory cache, so
 * reading another device replaces it; retain names rather than stale indices. */
#include "core.h"
#pragma code(filemgmt_code)
#pragma data(filemgmt_data)
__noinline unsigned char bank_directory(unsigned char dev);
__noinline int bank_findfile(const Path *p);
__noinline unsigned char bank_preparewrite(const Path *p);
__noinline unsigned char bank_openreadtype(const Path *p, unsigned char lfn, unsigned char type);
__noinline unsigned char bank_openread(const Path *p, unsigned char lfn);
__noinline unsigned char bank_openwrite(const Path *p, unsigned char type);
__noinline unsigned char bank_scratch(const Path *p);
__noinline unsigned char bank_diroption(const char *s, unsigned char *flags);
__noinline unsigned char bank_dirdefaults(const char *s, unsigned char *flags);
__noinline int bank_dircompare(unsigned int a, unsigned int b, unsigned char flags);
__noinline void bank_dircmd(void);
__noinline unsigned char bank_copyfile(unsigned char moving);
__noinline void bank_copycmd(unsigned char moving);
__noinline unsigned char bank_deletable(const Path *p);
__noinline void bank_delcmd(void);
__noinline void bank_attribcmd(void);
__noinline void bank_concatcmd(void);
__noinline void bank_renamecmd(void);

/* Compare cached entries without disturbing physical directory order.
 *
 * Compare cached directory entries for sorting; return negative, zero or positive.
 *
 * a: First entry index.
 * b: Second entry index.
 * flags: DIR sort flags, including reverse order. */
__noinline int bank_dircompare(unsigned int a, unsigned int b, unsigned char flags)
{
    int result = 0;
    if (flags & 16)
        result = strcmp(typename(directory_entries[a].type), typename(directory_entries[b].type));
    else if ((flags & 32) && directory_entries[a].blocks != directory_entries[b].blocks)
        result = directory_entries[a].blocks < directory_entries[b].blocks ? -1 : 1;
    if (!result)
        result = strcmp(directory_entries[a].name, directory_entries[b].name);
    return flags & 64 ? -result : result;
}

/* Parse DIR options, build a bounded directory order, and print the selected listing. */
__noinline void bank_dircmd(void)
{
    unsigned char bare = 0, lower = 0, sort = 0, wide = 0, col = 0;
    unsigned int i, j, total = 0, tmp;
    unsigned int *order = (unsigned int *)workspace;
    unsigned int usedblocks = 0;
    char shown[17];
    unsigned char flags = 0, explicit = 0;
    char *defaults = envready ? envget("DIRCMD") : (char *)0;
    for (i = 1; i < argc; ++i)
        if (args[i][0] == '/')
            explicit = 1;
    if (!explicit && defaults)
        bank_dirdefaults(defaults, &flags);
    p1.dev = drive;
    strcpy(p1.name, "*");
    for (i = 1; i < argc; ++i) {
        if (args[i][0] == '/') {
            if (!bank_diroption(args[i], &flags)) {
                error(SYSOUT_INVALID_SWITCH);
                return;
            }
        } else if (!path(args[i], &p1))
            return;
    }
    bare = flags & 1;
    lower = flags & 2;
    sort = flags & 4;
    wide = flags & 8;
    if (!p1.name[0])
        strcpy(p1.name, "*");
    if (!bank_directory(p1.dev))
        return;
    if (!bare) {
        volumeheader(p1.dev);
        print(SYSOUT_DIR_HEADER, drivename(p1.dev));
    }
    /* Sort an index rather than the shared entries, preserving lookup and completion order. */
    for (i = 0; i < count; ++i)
        order[i] = i;
    if (sort)
        for (i = 1; i < count; ++i) {
            tmp = order[i];
            j = i;
            while (j > ((flags & 128) ? 1 : 0) && bank_dircompare(order[j - 1], tmp, flags) > 0) {
                order[j] = order[j - 1];
                --j;
            }
            order[j] = tmp;
        }
    pagelines = 5;
    for (i = 0; i < count; ++i) {
        j = order[i];
        if (!match(p1.name, directory_entries[j].name))
            continue;
        ++total;
        usedblocks += directory_entries[j].blocks;
        if (lower)
            strcpy(shown, directory_entries[j].name);
        else
            uppername(directory_entries[j].name, shown);
        if (bare)
            say(shown);
        else if (wide) {
            print(SYSOUT_DIR_WIDE_ENTRY, shown);
            if (++col == 2) {
                newline();
                col = 0;
            }
        } else {
            print(SYSOUT_DIR_ENTRY, shown, typename(directory_entries[j].type),
                  allocated(directory_entries[j].blocks));
            print(SYSOUT_DIR_BLOCKS, decimal(directory_entries[j].blocks));
            /* Short block labels also fit four-digit free-block counts. */
            if (redirected ? outputcol : ox)
                newline();
        }
        if ((!wide || bare || !col) && !page())
            break;
    }
    if (col)
        newline();
    if (!bare && !aborted) {
        print(SYSOUT_DIR_TOTAL, total, allocated(usedblocks));
        print(SYSOUT_DIR_BLOCKS_LINE, decimal(usedblocks));
        print(SYSOUT_DIR_FREE, allocated(freeblocks));
        print(SYSOUT_DIR_BLOCKS_LINE, decimal(freeblocks));
    }
}

/* Copy p1 to p2 with overwrite confirmation and I/O checks; return nonzero on success.
 *
 * moving: Nonzero removes the source after a successful copy. */
__noinline unsigned char bank_copyfile(unsigned char moving)
{
    int n, i;
    unsigned char type, ok = 1;
    if (!p2.name[0])
        strcpy(p2.name, p1.name);
    if (p1.dev == p2.dev && !strcmp(p1.name, p2.name)) {
        say(SYSOUT_FILE_COPY_ON_SELF);
        return 0;
    }
    cachevalid = 0;
    i = bank_findfile(&p1);
    if (i < 0) {
        error(SYSOUT_FILE_NOT_FOUND);
        return 0;
    }
    type = directory_entries[i].type;
    if (type == CBM_T_REL) {
        ok = copyrel();
    } else {
        if (type != CBM_T_PRG && type != CBM_T_SEQ && type != CBM_T_USR) {
            error(SYSOUT_UNSUPPORTED_FILE_TYPE);
            return 0;
        }
        if (!bank_preparewrite(&p2))
            return 0;
        /* Same-disk copies can run inside DOS; cross-device copies must stream through RAM. */
        if (p1.dev && p1.dev == p2.dev) {
            snprintf(diskcmd, sizeof(diskcmd), "c0:%s=0:%s", p2.name, p1.name);
            ok = command(p1.dev, diskcmd);
        } else {
            if (!bank_openreadtype(&p1, 2, type))
                return 0;
            if (!bank_openwrite(&p2, type)) {
                channel_close(2);
                return 0;
            }
            uppername(p1.name, statusbuf);
            outs(statusbuf);
            while ((n = readio(2, io, sizeof(io))) > 0) {
                if (channel_write(3, io, n) != n || stop()) {
                    ok = 0;
                    break;
                }
            }
            if (n < 0)
                ok = 0;
            /* An unsuccessful cartridge copy must discard its unfinished record rather than commit it. */
            if (!ok)
                channel_abort(3);
            channel_close(2);
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
    if (moving && !bank_scratch(&p1))
        return 0;
    return 1;
}

/* Execute COPY or MOVE, including wildcard expansion and concatenation handling.
 *
 * moving: Nonzero selects MOVE; zero selects COPY. */
__noinline void bank_copycmd(unsigned char moving)
{
    unsigned int i, limit, total = 0;
    char *source = 0, *destination = 0;
    char pattern[17];
    copysuppress = 0;
    for (i = 1; i < argc; ++i) {
        if (!stricmp(args[i], "/P"))
            copysuppress = 1;
        else if (args[i][0] == '/' || (source && destination))
            break;
        else if (!source)
            source = args[i];
        else
            destination = args[i];
    }
    if (i < argc || !source || !destination) {
        error(moving ? SYSOUT_SYNTAX_MOVE : SYSOUT_SYNTAX_COPY);
        return;
    }
    args[1] = source;
    args[2] = destination;
    if (!moving && strchr(source, '+')) {
        bank_concatcmd();
        return;
    }
    if (!path(source, &p1) || !path(destination, &p2))
        return;
    if (!moving && strpbrk(p1.name, "*?")) {
        if (p2.name[0]) {
            error(SYSOUT_WILDCARDS_DEST_DRV);
            return;
        }
        if (p1.dev == p2.dev) {
            say(SYSOUT_FILE_COPY_ON_SELF);
            return;
        }
        strcpy(pattern, p1.name);
        if (!bank_directory(p1.dev))
            return;
        limit = count;
        /* Destination checks replace the shared bank_directory cache. Reload the
         * unchanged source before using the next source bank_directory index. */
        for (i = 0; i < limit && !aborted; ++i) {
            if (!cachevalid || cachedev != p1.dev)
                if (!bank_directory(p1.dev))
                    return;
            if (i >= count)
                break;
            if (!match(pattern, directory_entries[i].name))
                continue;
            if (directory_entries[i].type != CBM_T_PRG && directory_entries[i].type != CBM_T_SEQ &&
                directory_entries[i].type != CBM_T_USR && directory_entries[i].type != CBM_T_REL)
                continue;
            strcpy(p1.name, directory_entries[i].name);
            strcpy(p2.name, p1.name);
            if (!bank_copyfile(0))
                return;
            ++total;
            if (stop())
                break;
        }
        if (!total && !aborted) {
            error(SYSOUT_FILE_NOT_FOUND);
            return;
        }
        print(SYSOUT_FILES_COPIED, total);
    } else if (bank_copyfile(moving))
        say(moving ? SYSOUT_ONE_FILE_MOVED : SYSOUT_ONE_FILE_COPIED);
}

/* Check every match before scratching: DOS silently skips locked files.
 *
 * Check a file can be deleted; return zero for an unreadable or read-only file.
 *
 * p: Path or wildcard selection to inspect. */
__noinline unsigned char bank_deletable(const Path *p)
{
    struct DirectoryEntry ent;
    unsigned char r;
    if (directory_open(2, p->dev) != 0) {
        channel_close(2);
        error(SYSOUT_DRIVE_NOT_READY);
        return 0;
    }
    r = directory_read(2, &ent);
    if (!r)
        while (!(r = directory_read(2, &ent))) {
            if (ent.access == CBM_A_RO && match(p->name, ent.name)) {
                channel_close(2);
                error(SYSOUT_FILE_IS_LOCKED);
                return 0;
            }
        }
    channel_close(2);
    if (r != 2) {
        error(SYSOUT_ERR_READING_BANK_DIR);
        return 0;
    }
    return 1;
}

/* Expand DEL wildcards and confirm the complete selection before deleting files. */
__noinline void bank_delcmd(void)
{
    unsigned char i, suppress = 0;
    unsigned int entry, matches = 0;
    char *name = 0;
    char pattern[17], shown[17], request[24];
    for (i = 1; i < argc; ++i) {
        if (!stricmp(args[i], "/P"))
            suppress = 1;
        else if (args[i][0] == '/' || name)
            break;
        else
            name = args[i];
    }
    if (i < argc || !name || !path(name, &p1) || !p1.name[0]) {
        error(SYSOUT_SYNTAX_DEL);
        return;
    }
    if (!bank_deletable(&p1))
        return;
    if (!suppress && strpbrk(p1.name, "*?")) {
        strcpy(pattern, p1.name);
        if (!bank_directory(p1.dev))
            return;
        /* Scratch invalidates the cache but does not replace its entries.
         * Keep this snapshot so deleted entries cannot shift later matches. */
        for (entry = 0; entry < count && !aborted; ++entry) {
            if (!match(pattern, directory_entries[entry].name))
                continue;
            ++matches;
            strcpy(p1.name, directory_entries[entry].name);
            uppername(p1.name, shown);
            snprintf(request, sizeof(request), SYSOUT_DELETE_FILE, shown);
            if (yesno(request) && !bank_scratch(&p1))
                return;
        }
        if (!matches)
            error(SYSOUT_FILE_NOT_FOUND);
        return;
    }
    if (suppress || yesno(SYSOUT_DELETE_THIS_FILE))
        bank_scratch(&p1);
}

/* Native lock bit: preserve every other directory byte.
 *
 * Read or change cartridge file attributes for the selected names. */
__noinline void bank_attribcmd(void)
{
    unsigned char a = 1, mode = 0, track, sector, n, dirty, found = 0, visited[5];
    unsigned int offset;
    char name[17], shown[17];
    if (argc > 1 && (!stricmp(args[1], "+L") || !stricmp(args[1], "-L"))) {
        mode = args[1][0] == '+' ? 1 : 2;
        ++a;
    }
    if (argc > a + 1 ||
        (argc > a && (args[a][0] == '/' || args[a][0] == '+' || args[a][0] == '-'))) {
        error(SYSOUT_INVALID_PARAM);
        return;
    }
    if (!path(argc > a ? args[a] : "", &p1))
        return;
    if (!p1.name[0])
        strcpy(p1.name, "*");
    if (!p1.dev) {
        if (!bank_directory(0))
            return;
        for (offset = 0; offset < count; ++offset)
            if (match(p1.name, directory_entries[offset].name)) {
                found = 1;
                n = cart_attribute(directory_entries[offset].name, mode);
                if (diskstatus(0, 1) >= 20)
                    break;
                /* Swapping a disk with an open output file would write to the wrong disk. */
                if (!mode) {
                    uppername(directory_entries[offset].name, shown);
                    print(SYSOUT_ATTR_ENTRY, n ? 'L' : ' ', shown);
                }
            }
        cachevalid = 0;
        if (!found)
            error(SYSOUT_FILE_NOT_FOUND);
        return;
    }
    if (!bam(p1.dev))
        return;
    track = io[0];
    sector = io[1];
    memset(visited, 0, sizeof(visited));
    pagelines = 0;
    if (!rawopen(p1.dev))
        return;
    while (track) {
        if (track != headertrack || sector < (headertrack == 40 ? 3 : 1) ||
            sector >= tracksectors(track, disktracks) ||
            (visited[sector / 8] & (1 << (sector % 8)))) {
            error(SYSOUT_INVALID_BANK_DIR_CHAIN);
            break;
        }
        visited[sector / 8] |= 1 << (sector % 8);
        if (!blockio(p1.dev, track, sector, 0))
            break;
        dirty = 0;
        for (offset = 2; offset < 256; offset += 32) {
            if (!(io[offset] & 7))
                continue;
            for (n = 0; n < 16 && io[offset + 3 + n] != 0xa0; ++n)
                name[n] = io[offset + 3 + n];
            name[n] = 0;
            if (!match(p1.name, name))
                continue;
            found = 1;
            if (mode) {
                n = mode == 1 ? io[offset] | 0x40 : io[offset] & 0xbf;
                if (n != io[offset]) {
                    io[offset] = n;
                    dirty = 1;
                }
            } else {
                uppername(name, shown);
                print(SYSOUT_ATTR_ENTRY, io[offset] & 0x40 ? 'L' : ' ', shown);
                if (!page())
                    goto done;
            }
        }
        if (dirty && !blockio(p1.dev, track, sector, 1))
            break;
        track = io[0];
        sector = io[1];
    }
done:
    channel_close(2);
    cachevalid = 0;
    if (!found && !track)
        error(SYSOUT_FILE_NOT_FOUND);
}

/* Build a bounded device-side concatenation command from COPY arguments. */
__noinline void bank_concatcmd(void)
{
    unsigned char len, first = 1;
    char *source = args[1], *next;
    char request[41];
    if (!path(args[2], &p1))
        return;
    if (!p1.name[0] || strpbrk(p1.name, "*?=@")) {
        error(SYSOUT_INVALID_DEST);
        return;
    }
    strcpy(request, "c0:");
    strcat(request, p1.name);
    strcat(request, "=");
    do {
        next = strchr(source, '+');
        if (next)
            *next++ = 0;
        if (!path(source, &p2))
            return;
        if (!strchr(source, ':'))
            p2.dev = p1.dev;
        if (p2.dev != p1.dev) {
            error(SYSOUT_FILES_SAME_DISK);
            return;
        }
        if (!p2.name[0] || strpbrk(p2.name, "*?=")) {
            error(SYSOUT_INVALID_FILE_NAME);
            return;
        }
        len = strlen(request);
        if (len + strlen(p2.name) + !first > 40) {
            error(SYSOUT_FILE_LIST_TOO_LONG);
            return;
        }
        if (!first)
            strcat(request, ",");
        strcat(request, p2.name);
        first = 0;
        source = next;
    } while (source);
    if (bank_preparewrite(&p1) && command(p1.dev, request))
        say(SYSOUT_ONE_FILE_COPIED);
}

/* Validate two paths and rename within one device, checking the destination first. */
__noinline void bank_renamecmd(void)
{
    if (argc != 3 || !path(args[1], &p1) || !path(args[2], &p2)) {
        error(SYSOUT_SYNTAX_REN);
        return;
    }
    if (!strchr(args[2], ':'))
        p2.dev = p1.dev;
    if (p1.dev != p2.dev) {
        say(SYSOUT_CANNOT_RENAME_ACROSS_DRIVES);
        return;
    }
    if (!strcmp(p1.name, p2.name))
        return;
    cachevalid = 0;
    if (bank_findfile(&p1) < 0) {
        error(SYSOUT_FILE_NOT_FOUND);
        return;
    }
    if (!bank_preparewrite(&p2))
        return;
    snprintf(diskcmd, sizeof(diskcmd), "r0:%s=%s", p2.name, p1.name);
    command(p1.dev, diskcmd);
    return;
}

/* Replace the shared directory cache; publish it only after a complete successful read.
 *
 * dev: Device to enumerate; return nonzero on success. */
__noinline unsigned char bank_directory(unsigned char dev)
{
    struct DirectoryEntry ent;
    unsigned char r;
    count = 0;
    cachevalid = 0;
    cachedev = dev;
    freeblocks = 0;
    if (drivetype(dev, 0) == 2 && !command(dev, "u0>m1"))
        return 0;
    if (directory_open(2, dev) != 0) {
        channel_close(2);
        error(SYSOUT_DRIVE_NOT_READY);
        return 0;
    }
    r = directory_read(2, &ent);
    if (r) {
        channel_close(2);
        error(SYSOUT_ERR_READING_BANK_DIR);
        return 0;
    }
    strcpy(volume, ent.name);
    while (!(r = directory_read(2, &ent))) {
        if (count == MAXFILES) {
            channel_close(2);
            error(SYSOUT_DIR_TOO_LARGE);
            return 0;
        }
        strcpy(directory_entries[count].name, ent.name);
        directory_entries[count].blocks = ent.size;
        directory_entries[count].type = ent.type;
        ++count;
    }
    channel_close(2);
    if (r != 2) {
        error(SYSOUT_ERR_READING_BANK_DIR);
        return 0;
    }
    /* Publish a cache only after the free-block footer confirms complete enumeration. */
    freeblocks = ent.size;
    cachevalid = 1;
    return 1;
}

/* Find an exact cached filename, refreshing the directory when needed.
 *
 * p: File path; return its index, -1 if absent, or -2 if directory reading fails. */
__noinline int bank_findfile(const Path *p)
{
    unsigned int i;
    if (!cachevalid || cachedev != p->dev)
        if (!bank_directory(p->dev))
            return -2;
    for (i = 0; i < count; ++i)
        if (!strcmp(directory_entries[i].name, p->name))
            return i;
    return -1;
}

/* Validate a destination and ask before replacement; disks scratch the old file first.
 *
 * p: Exact destination path; return nonzero when writing may proceed. */
__noinline unsigned char bank_preparewrite(const Path *p)
{
    int i;
    if (!p->name[0] || strchr(p->name, '*') || strchr(p->name, '?')) {
        error(SYSOUT_INVALID_DEST);
        return 0;
    }
    cachevalid = 0;
    i = bank_findfile(p);
    if (i == -2)
        return 0;
    if (i >= 0) {
        if (!copysuppress && !yesno(SYSOUT_OVERWRITE_FILE))
            return 0;
        if (editprompt)
            editsaving();
        if (p->dev && !bank_scratch(p))
            return 0;
    }
    return 1;
}

/* Reuse metadata already obtained during this operation.
 *
 * Open a file using already-known metadata and clear its per-channel EOF state.
 *
 * p: Source path.
 * lfn: Logical file number to open.
 * type: Supported CBM_T_SEQ, CBM_T_PRG or CBM_T_USR type; return nonzero on success. */
__noinline unsigned char bank_openreadtype(const Path *p, unsigned char lfn, unsigned char type)
{
    char t = 's';
    if (type == CBM_T_PRG)
        t = 'p';
    else if (type == CBM_T_USR)
        t = 'u';
    else if (type != CBM_T_SEQ) {
        error(SYSOUT_UNSUPPORTED_FILE_TYPE);
        return 0;
    }
    snprintf(diskcmd, sizeof(diskcmd), "0:%s,%c,r", p->name, t);
    if (channel_open(lfn, p->dev, 2, diskcmd) != 0) {
        channel_close(lfn);
        error(SYSOUT_FILE_NOT_FOUND);
        return 0;
    }
    if (diskstatus(p->dev, 1) >= 20) {
        channel_close(lfn);
        return 0;
    }
    eof[lfn] = 0;
    return 1;
}

/* Look up the file type and open a read channel; return nonzero on success.
 *
 * p: Source path.
 * lfn: Logical file number to open. */
__noinline unsigned char bank_openread(const Path *p, unsigned char lfn)
{
    int i = bank_findfile(p);
    if (i < 0) {
        if (i == -1)
            error(SYSOUT_FILE_NOT_FOUND);
        return 0;
    }
    return bank_openreadtype(p, lfn, directory_entries[i].type);
}

/* Open the destination on logical file 3; replacement must already be approved.
 *
 * p: Destination path.
 * type: Commodore file type; return nonzero on success. */
__noinline unsigned char bank_openwrite(const Path *p, unsigned char type)
{
    char t = 's';
    if (type == CBM_T_PRG)
        t = 'p';
    else if (type == CBM_T_USR)
        t = 'u';
    snprintf(diskcmd, sizeof(diskcmd), "0:%s,%c,w", p->name, t);
    if (channel_open(3, p->dev, 3, diskcmd) != 0) {
        channel_close(3);
        error(SYSOUT_WRITE_FAULT_ERR);
        return 0;
    }
    if (diskstatus(p->dev, 1) >= 20) {
        channel_close(3);
        return 0;
    }
    return 1;
}

/* Delete the specified native filename through its device command interface.
 *
 * p: Path to scratch; return nonzero on success. */
__noinline unsigned char bank_scratch(const Path *p)
{
    snprintf(diskcmd, sizeof(diskcmd), "s0:%s", p->name);
    return command(p->dev, diskcmd);
}

/* Apply one DIR switch to the accumulated flags; return zero for an invalid switch.
 *
 * s: Terminated switch beginning with a slash.
 * flags: Input/output listing and sort flags. */
__noinline unsigned char bank_diroption(const char *s, unsigned char *flags)
{
    if (!stricmp(s, "/B"))
        *flags |= 1;
    else if (!stricmp(s, "/L"))
        *flags |= 2;
    else if (s[0] == '/' && toupper(s[1]) == 'O') {
        unsigned char mode = 4;
        s += 2;
        if (*s == '-') {
            mode |= 64;
            ++s;
        }
        if (toupper(*s) == 'N')
            ++s;
        else if (toupper(*s) == 'T') {
            mode |= 16;
            ++s;
        } else if (toupper(*s) == 'S') {
            mode |= 32;
            ++s;
        } else if (*s || (mode & 64))
            return 0;
        if (toupper(*s) == 'F') {
            mode |= 128;
            ++s;
        }
        if (*s)
            return 0;
        *flags = (*flags & 11) | mode;
    } else if (!stricmp(s, "/W"))
        *flags |= 8;
    else if (stricmp(s, "/P"))
        return 0;
    return 1;
}

/* Parse the DIRCMD switch string into listing flags; return zero for invalid input.
 *
 * s: Terminated defaults, with optional spaces between switches.
 * flags: Input/output listing and sort flags. */
__noinline unsigned char bank_dirdefaults(const char *s, unsigned char *flags)
{
    char option[6];
    unsigned char n;
    while (*s) {
        while (*s == ' ')
            ++s;
        if (!*s)
            break;
        n = 0;
        if (*s != '/')
            return 0;
        option[n++] = *s++;
        while (*s && *s != ' ' && *s != '/') {
            if (n == 5)
                return 0;
            option[n++] = *s++;
        }
        option[n] = 0;
        if (!bank_diroption(option, flags))
            return 0;
    }
    return 1;
}

#pragma code(code)
#pragma data(data)
