/* SD2IEC and legacy SoftIEC host filesystems. No raw sectors, image entry,
 * or persistent directory cache is used by this backend. */
#include "core.h"
#pragma code(host_code)
#pragma data(host_data)

/* IDENTIFY is the original Software IEC Target command, not a 3.15 extension. */
__noinline unsigned char bank_softiec_target(void)
{
    static unsigned int verified;
    static const unsigned char identity[] = {83,79,70,84,87,65,82,69,32,73,69,67,32,84,65,82,71,69,84,32,86,49,46,48};
    static const unsigned char success[] = {48,48,44,79,75};
    unsigned int base = ultimatebase;
    unsigned char n = 0, c, ok = 1, status = 0, first = 255;
    clock_t started;
    if (!base || PEEK(base + 1) != 0xc9)
        return 0;
    if (verified == base)
        return 1;
    if (PEEK(base) & 0xfd)
        return 0;
    POKE(base + 1, 5); POKE(base + 1, 1); POKE(base, 1);
    started = clock();
    while (!(PEEK(base) & 0x20))
        if (clock() - started >= CLOCKS_PER_SEC / 4) {
            POKE(base, 4);
            return 0;
        }
    if (PEEK(base) & 0x10)
        ok = 0;
    while ((PEEK(base) & 128) && n < 25) {
        c = PEEK(base + 2);
        if (n >= sizeof(identity) || c != identity[n])
            ok = 0;
        ++n;
    }
    if (n != sizeof(identity) || (PEEK(base) & 128))
        ok = 0;
    while ((PEEK(base) & 64) && status < 80) {
        c = PEEK(base + 3);
        if (!status) first = c;
        /* Validate every byte: Oscar64 otherwise discards unused MMIO reads,
         * leaving the rest of an ASCII status reply in the hardware FIFO. */
        if (first == 48) {
            if (status >= sizeof(success) || c != success[status]) ok = 0;
        } else if (status || c) ok = 0;
        ++status;
    }
    if ((first == 48 ? status != sizeof(success) : status != 1) || (PEEK(base) & 64))
        ok = 0;
    POKE(base, ok ? 2 : 4);
    if (ok) verified = base;
    return ok;
}

/* Read the special two-byte end marker of $=P, retaining its partition number. */
static unsigned char host_partition(unsigned char lfn, struct DirectoryEntry *entry)
{
    unsigned char h[2], c, quoted = 0, n = 0;
    if (channel_read(lfn, h, 2) != 2)
        return 1;
    if (!h[0] && !h[1])
        return 2;
    if (channel_read(lfn, h, 2) != 2)
        return 1;
    entry->size = h[0] | ((unsigned int)h[1] << 8);
    do {
        if (channel_read(lfn, &c, 1) != 1)
            return 1;
        if (c == '"') quoted = !quoted;
        else if (quoted && n < 16) entry->name[n++] = c;
    } while (c);
    while (n && (entry->name[n-1] == ' ' || (unsigned char)entry->name[n-1] == 160)) --n;
    entry->name[n] = 0;
    entry->type = CBM_T_DIR; entry->access = CBM_A_RO; entry->remainder = 1;
    return 0;
}

/* Open in the already selected physical directory; never select while probing
 * a component, since selection itself uses these probes to exclude images. */
static unsigned char host_begin(unsigned char dev, unsigned char lfn, unsigned char partitions, unsigned char hidden)
{
    struct DirectoryEntry header;
    unsigned char address[2];
    char request[8];
    strcpy(request, partitions ? "$=p" : hidden && drivemodel(dev, 0) == DRIVE_SD2IEC ? "$*=h" : "$");
    if (channel_open(lfn, dev, 0, request)) {
        channel_close(lfn);
        error(SYSOUT_ERR_READING_BANK_DIR);
        return 0;
    }
    channel_buffer(lfn, 1);
    if (channel_read(lfn, address, 2) != 2 ||
        directory_read(lfn, &header)) {
        channel_close(lfn);
        error(SYSOUT_ERR_READING_BANK_DIR);
        return 0;
    }
    return 1;
}

__noinline unsigned char bank_host_open(const Path *p, HostCursor *cursor, unsigned char lfn, unsigned char hidden)
{
    cursor->dev = p->dev; cursor->lfn = lfn; cursor->done = 0;
    cursor->model = drivemodel(p->dev, 0);
    cursor->partitions = cursor->model == DRIVE_SD2IEC && !p->dir[0];
    cachevalid = 0;
    if (!location_select(p->dev, p->dir) ||
        !host_begin(p->dev, lfn, cursor->partitions, hidden)) {
        cursor->done = 1;
        return 0;
    }
    return 1;
}

__noinline unsigned char bank_host_next(HostCursor *cursor, struct DirectoryEntry *entry)
{
    unsigned char r;
    if (cursor->done) return 2;
    do {
        r = cursor->partitions ? host_partition(cursor->lfn, entry) : directory_read(cursor->lfn, entry);
        if (!r && cursor->partitions && (!entry->name[0] || strpbrk(entry->name, "\\:,\"*?/@") ||
            !strcmp(entry->name, ".") || !strcmp(entry->name, "..")))
            snprintf(entry->name, sizeof(entry->name), "@%u", entry->size);
    } while (!r && (!strcmp(entry->name, ".") || !strcmp(entry->name, "..") ||
             (cursor->partitions && (!entry->size || entry->size > 254))));
    if (r) {
        channel_close(cursor->lfn); cursor->done = 1;
        if (r != 2) error(SYSOUT_ERR_READING_BANK_DIR);
    }
    return r;
}

__noinline unsigned char bank_host_isdir(unsigned char dev, const char *name)
{
    struct DirectoryEntry entry;
    unsigned char r;
    if (!host_begin(dev, 6, 0, 1)) return 0;
    while (!(r = directory_read(6, &entry)))
        if (!strcmp(entry.name, name)) {
            channel_close(6);
            return entry.type == CBM_T_DIR;
        }
    channel_close(6);
    return 0;
}

__noinline unsigned char bank_host_partfind(unsigned char dev, const char *name, PartitionInfo *info)
{
    struct DirectoryEntry entry;
    unsigned char number = 0, r;
    unsigned int value;
    const char *s;
    if (name[0] == '@') {
        value = 0; s = name + 1;
        if (!*s) goto absent;
        while (isdigit(*s)) {
            value = value * 10 + *s++ - '0';
            if (value > 254) goto absent;
        }
        if (*s || !value) goto absent;
        if (!partition_info(dev, value, info)) return 0;
        if (!info->type || info->type == 255) goto absent;
        return 1;
    }
    if (!host_begin(dev, 6, 1, 0)) return 0;
    while (!(r = host_partition(6, &entry)))
        if (entry.size && entry.size <= 254 && !stricmp(entry.name, name)) {
            if (number) {
                channel_close(6); error(SYSOUT_AMBIGUOUS_PARTITION); return 0;
            }
            number = entry.size;
        }
    channel_close(6);
    if (r != 2) { error(SYSOUT_ERR_READING_BANK_DIR); return 0; }
    if (number) return partition_info(dev, number, info);
absent:
    error(SYSOUT_PARTITION_NOT_FOUND);
    return 0;
}

__noinline unsigned char bank_host_select(unsigned char dev, const char *dir, unsigned char model)
{
    PartitionInfo info;
    char request[24], name[17];
    const char *q = dir;
    unsigned char n;
    if (model == DRIVE_SD2IEC) {
        if (!*q) return drivepresent(dev);
        n = 0;
        while (*q && (unsigned char)*q != 0x5c && n < 16) name[n++] = *q++;
        name[n] = 0;
        if (!bank_host_partfind(dev, name, &info)) return 0;
        snprintf(request, sizeof(request), "cp%u", info.number);
        if (!command(dev, request)) return 0;
        if (*q) ++q;
    }
    /* Both spellings select an absolute root. Legacy SoftIEC requires ':'
     * before its path, unlike CMD/SD2IEC's optional-colon directory syntax. */
    strcpy(request, model == DRIVE_SD2IEC ? "cd//" : "cd:/");
    if (!command(dev, request)) return 0;
    while (*q) {
        n = 0;
        while (*q && (unsigned char)*q != 0x5c && n < 16) name[n++] = *q++;
        name[n] = 0;
        if (!bank_host_isdir(dev, name)) {
            error(SYSOUT_DIRECTORY_NOT_FOUND); return 0;
        }
        snprintf(request, sizeof(request), "cd:%s", name);
        if (!command(dev, request)) return 0;
        if (*q) ++q;
    }
    return 1;
}

__noinline int bank_host_find(const Path *p)
{
    HostCursor cursor;
    struct DirectoryEntry entry;
    unsigned char r;
    if (!bank_host_open(p, &cursor, 6, 1)) return -2;
    while (!(r = bank_host_next(&cursor, &entry)))
        if (!strcmp(entry.name, p->name)) {
            channel_close(6);
            strcpy(directory_entries[0].name, entry.name);
            directory_entries[0].blocks = entry.size;
            directory_entries[0].type = entry.type;
            count = 1; cachevalid = 0;
            return 0;
        }
    count = 0;
    return r == 2 ? -1 : -2;
}

__noinline unsigned char bank_host_complete(const Path *p, const char *prefix, unsigned int *index)
{
    HostCursor cursor;
    struct DirectoryEntry entry;
    unsigned int at = 0, first = 65535;
    char candidate[17];
    unsigned char r;
    if (!bank_host_open(p, &cursor, 6, 0)) return 0;
    while (!(r = bank_host_next(&cursor, &entry))) {
        if (!strncmp(entry.name, prefix, strlen(prefix))) {
            if (first == 65535) { first = at; strcpy(candidate, entry.name); }
            if (at >= *index) {
                channel_close(6); strcpy(directory_entries[0].name, entry.name);
                *index = at + 1; return 1;
            }
        }
        ++at;
    }
    if (r != 2 || first == 65535) return 0;
    strcpy(directory_entries[0].name, candidate); *index = first + 1;
    return 1;
}

/* A mutation or a legacy SoftIEC CD may invalidate an open directory stream.
 * Reopen between operations, retaining a name cursor instead of cached entries. */
static unsigned char host_match(const Path *p, const char *pattern, const char *after, struct DirectoryEntry *selected)
{
    HostCursor cursor;
    struct DirectoryEntry entry;
    unsigned char found = 0, r;
    if (!bank_host_open(p, &cursor, 4, 0)) return 1;
    while (!(r = bank_host_next(&cursor, &entry)))
        if (entry.type != CBM_T_DIR && match(pattern, entry.name) && strcmp(entry.name, after) > 0 &&
            (!found || strcmp(entry.name, selected->name) < 0)) {
            *selected = entry; found = 1;
        }
    return r == 2 && found ? 0 : r;
}

__noinline void bank_host_wildcopy(void)
{
    struct DirectoryEntry entry;
    char pattern[17], after[17];
    unsigned int total = 0;
    unsigned char r;
    if (p2.name[0]) { error(SYSOUT_WILDCARDS_DEST_DRV); return; }
    if (sameplace(&p1, &p2)) { say(SYSOUT_FILE_COPY_ON_SELF); return; }
    strcpy(pattern, p1.name); after[0] = 0;
    while (!(r = host_match(&p1, pattern, after, &entry))) {
        strcpy(after, entry.name);
        strcpy(p1.name, entry.name); strcpy(p2.name, entry.name);
        if (!copyfile(0)) return;
        ++total;
        if (stop()) return;
    }
    if (r != 2) return;
    if (!total) error(SYSOUT_FILE_NOT_FOUND);
    else print(SYSOUT_FILES_COPIED, total);
}

__noinline void bank_host_delete(unsigned char suppress)
{
    struct DirectoryEntry entry;
    char pattern[17], shown[17], request[40], after[17];
    unsigned char r, found = 0;
    strcpy(pattern, p1.name); after[0] = 0;
    while (!(r = host_match(&p1, pattern, after, &entry))) {
        strcpy(after, entry.name);
        found = 1; strcpy(p1.name, entry.name); uppername(entry.name, shown);
        snprintf(request, sizeof(request), SYSOUT_DELETE_FILE, shown);
        if ((suppress || yesno(request)) && !scratch(&p1)) return;
        if (stop()) return;
    }
    if (r == 2 && !found) error(SYSOUT_FILE_NOT_FOUND);
}

#pragma code(code)
#pragma data(data)
unsigned char host_device(unsigned char dev)
{
    return dev && drivemodel(dev, 0) >= DRIVE_SOFTIEC;
}
