#include "core.h"
#pragma code(hostdir_code)
#pragma data(hostdir_data)

/* A directory count is a reporting unit, not FAT allocation. 0/1 link bytes
 * carry no exact length; a saturated count cannot be repaired by its remainder. */
static unsigned long host_bytes(const struct DirectoryEntry *entry, unsigned char model, unsigned char *known)
{
    unsigned long bytes = (unsigned long)entry->size * 254;
    unsigned char rest;
    *known = 0;
    if (entry->type == CBM_T_DIR) { *known = 1; return 0; }
    if (entry->size >= (model == DRIVE_SOFTIEC ? 9999U : 65535U)) {
        *known = 2; return 0;
    }
    if (entry->remainder >= 2) {
        rest = entry->remainder - 2;
        if (rest) {
            if (!entry->size) { *known = 2; return 0; }
            bytes -= 254 - rest;
        }
        *known = 1;
    }
    return bytes;
}

static void host_number(unsigned long bytes, unsigned char known, char *shown)
{
    if (known == 2) strcpy(shown, SYSOUT_HOST_SIZE_UNKNOWN);
    else strcpy(shown, decimal(bytes));
}

/* Root metadata comes from the filesystem's own listing, never a BAM probe. */
__noinline void bank_host_volume(const Path *p)
{
    Path root;
    struct DirectoryEntry header;
    char shown[17], *slash;
    root = *p;
    root.name[0] = 0;
    slash = strchr(root.dir, 0x5c);
    if (slash) *slash = 0;
    if (location_root(root.dev, root.dir)) {
        strcpy(shown, SYSOUT_PARTITIONS_VOLUME);
    } else {
        if (!location_select(root.dev, root.dir)) return;
        if (directory_open(6, root.dev) || directory_read(6, &header)) {
            channel_close(6); error(SYSOUT_ERR_READING_BANK_DIR); return;
        }
        channel_close(6); uppername(header.name, shown);
        if (!location_select(p->dev, p->dir)) return;
    }
    print(SYSOUT_VOL_HEADER, drivename(p->dev));
    if ((redirected ? outputcol : ox) + strlen(shown) > 40) newline();
    say(shown);
}

static void host_row(const struct DirectoryEntry *entry, unsigned char model, unsigned char flags,
                     unsigned char partitions, unsigned char *col)
{
    char shown[17], amount[14], blocks[14];
    unsigned char known;
    unsigned long bytes;
    if (flags & 2) strcpy(shown, entry->name);
    else uppername(entry->name, shown);
    if (flags & 1) say(shown);
    else if (flags & 8) {
        print(SYSOUT_DIR_WIDE_ENTRY, shown);
        if (++*col == 2) { if (redirected ? outputcol : ox) newline(); *col = 0; }
    } else {
        if (entry->type == CBM_T_DIR) {
            print(SYSOUT_DIR_SUBDIR_ENTRY, shown);
            if (partitions) {
                snprintf(amount, sizeof(amount), SYSOUT_PARTITION_BRACKETS, SYSOUT_PARTITION_FAT);
                print(SYSOUT_DIR_PARTITION, amount);
            }
        } else {
            bytes = host_bytes(entry, model, &known);
            host_number(bytes, known, amount);
            print(SYSOUT_DIR_ENTRY, shown, typename(entry->type), amount);
            host_number((bytes + 255) / 256, known, blocks);
            if (known != 2 && strlen(blocks) <= 6)
                print(strlen(blocks) > 3 ? SYSOUT_DIR_BLOCKS_SHORT : SYSOUT_DIR_BLOCKS, blocks);
        }
        if (redirected ? outputcol : ox) newline();
    }
}

static int host_compare(const struct DirectoryEntry *a, const struct DirectoryEntry *b,
                        unsigned char flags, unsigned char model)
{
    int result = 0;
    unsigned char ka, kb;
    unsigned long sa, sb;
    if (flags & 16) result = strcmp(typename(a->type), typename(b->type));
    else if (flags & 32) {
        sa = host_bytes(a, model, &ka); sb = host_bytes(b, model, &kb);
        if ((ka == 2) != (kb == 2)) result = ka == 2 ? 1 : -1;
        else if (sa != sb) result = sa < sb ? -1 : 1;
    }
    if (!result) result = strcmp(a->name, b->name);
    return flags & 64 ? -result : result;
}

/* Sorted DIR is a sequence of scans, retaining only the previous and next
 * entry. Unsorted DIR keeps one stream open and reads each entry once. */
static unsigned char host_ordered(const Path *p, const struct DirectoryEntry *previous,
                                 struct DirectoryEntry *selected, unsigned char flags, unsigned char first)
{
    HostCursor cursor;
    struct DirectoryEntry entry;
    unsigned char found = 0, r, head = 1;
    if (!host_open(p, &cursor, 4, 0)) return 1;
    while (!(r = host_next(&cursor, &entry))) {
        if ((flags & 128) && head) {
            head = 0;
            if (first) { *selected = entry; channel_close(4); return 0; }
            continue;
        }
        head = 0;
        if (previous && host_compare(&entry, previous, flags, cursor.model) <= 0) continue;
        if (!found || host_compare(&entry, selected, flags, cursor.model) < 0) {
            *selected = entry; found = 1;
        }
    }
    return r == 2 && found ? 0 : r == 2 ? 2 : 1;
}

static unsigned char host_flat(unsigned char flags, unsigned char filter, unsigned char recursive)
{
    HostCursor cursor;
    struct DirectoryEntry entry, previous;
    unsigned char r, known, summary = 1, have = 0, col = 0, first = 1;
    unsigned int files = 0, dirs = 0, ordinal = 0, skipped;
    unsigned long bytes, total = 0;
    char amount[14];
    if (!recursive && !(flags & 1)) {
        if (!location_root(p1.dev, p1.dir)) bank_host_volume(&p1);
        uppername(p1.dir, io);
        print(SYSOUT_DIR_HEADER, drivename(p1.dev), 0x5c, io);
        pagelines = 5;
    }
    if (!host_open(&p1, &cursor, 4, 0)) return 0;
    if (redirected) { channel_close(4); cursor.done = 1; }
    if (!recursive && p1.dir[0] && filter == 255) {
        strcpy(entry.name, "."); entry.type = CBM_T_DIR;
        if (match(p1.name, entry.name)) { host_row(&entry, cursor.model, flags, 0, &col); ++dirs; }
        strcpy(entry.name, "..");
        if (match(p1.name, entry.name)) { host_row(&entry, cursor.model, flags, 0, &col); ++dirs; }
    }
    if (flags & 4) { channel_close(4); cursor.done = 1; }
    for (;;) {
        if (!(flags & 4) && redirected) {
            if (!host_open(&p1, &cursor, 4, 0)) return 0;
            skipped = 0;
            do { r = host_next(&cursor, &entry); } while (!r && skipped++ < ordinal);
            ++ordinal;
            channel_close(4); cursor.done = 1;
        } else
            r = flags & 4 ? host_ordered(&p1, have ? &previous : (const struct DirectoryEntry *)0, &entry, flags, first) : host_next(&cursor, &entry);
        if (r) break;
        if ((flags & 128) && first) have = 0;
        else { previous = entry; have = 1; }
        first = 0;
        if ((filter != 255 && entry.type != filter) || !match(p1.name, entry.name)) continue;
        if (entry.type == CBM_T_DIR) ++dirs;
        else {
            ++files; bytes = host_bytes(&entry, cursor.model, &known);
            if (total > 4294967295UL - bytes) known = 2;
            else total += bytes;
            if (known == 2) summary = 2;
            else if (!known && summary != 2) summary = 0;
        }
        if (recursive) {
            if (entry.type == CBM_T_DIR) continue;
            snprintf(io, sizeof(io), SYSOUT_FULL_PATH, drivename(p1.dev), 0x5c,
                     p1.dir, p1.dir[0] ? "\\" : "", entry.name);
            if (!(flags & 2)) uppername(io, io);
            say(io);
        } else host_row(&entry, cursor.model, flags, cursor.partitions, &col);
        if ((!col || recursive || (flags & 1)) && (!page() || stop())) {
            channel_close(4); return 0;
        }
    }
    channel_close(4);
    if (r != 2) return 0;
    if (col) newline();
    if (!recursive && !(flags & 1)) {
        host_number(total, summary, amount); print(SYSOUT_DIR_TOTAL, files, amount); newline();
        print(SYSOUT_DIR_COUNT, dirs); newline();
    }
    return 1;
}

__noinline void bank_host_dir(unsigned char flags, unsigned char filter, unsigned char recursive)
{
    HostCursor cursor;
    struct DirectoryEntry entry, next;
    unsigned int boundary = strlen(p1.dir), number, previous;
    unsigned char found, r;
    char pattern[17], after[17], *slash;
    strcpy(pattern, p1.name); after[0] = 0;
    pagelines = 0;
    for (;;) {
        if (!after[0]) {
            strcpy(p1.name, pattern);
            if (!host_flat(flags, filter, recursive) || !recursive) return;
        }
        found = 0; number = 65535; previous = after[0] == '@' ? atoi(after + 1) : 0;
        if (!host_open(&p1, &cursor, 4, 0)) return;
        while (!(r = host_next(&cursor, &entry))) {
            if (entry.type != CBM_T_DIR) continue;
            if (cursor.partitions) {
                if (entry.size > previous && entry.size < number) { next = entry; number = entry.size; found = 1; }
            } else if (strcmp(entry.name, after) > 0 && (!found || strcmp(entry.name, next.name) < 0)) {
                next = entry; found = 1;
            }
        }
        if (r != 2) return;
        if (found) {
            if (cursor.partitions) snprintf(p1.name, sizeof(p1.name), "@%u", next.size);
            else strcpy(p1.name, next.name);
            if (!path_join(&p1)) return;
            after[0] = 0;
        } else {
            if (strlen(p1.dir) == boundary) return;
            slash = strrchr(p1.dir, 0x5c);
            strcpy(after, slash ? slash + 1 : p1.dir);
            if (slash) *slash = 0; else p1.dir[0] = 0;
        }
        if (stop()) return;
    }
}

/* Iterative post-order removal keeps no tree or per-depth stack. Hidden files
 * participate in emptiness checks and recursive deletion. */
__noinline unsigned char bank_host_remove(Path *p, unsigned char recursive)
{
    HostCursor cursor;
    struct DirectoryEntry entry;
    unsigned int boundary;
    unsigned char r, last;
    char request[24], *slash;
    if (!path_join(p)) return 0;
    boundary = strlen(p->dir);
    for (;;) {
        if (!host_open(p, &cursor, 4, 1)) return 0;
        r = host_next(&cursor, &entry); channel_close(4);
        if (r == 1) return 0;
        if (!r) {
            if (!recursive) { error(SYSOUT_DIRECTORY_NOT_EMPTY); return 0; }
            strcpy(p->name, entry.name);
            if (entry.type == CBM_T_DIR) {
                if (!path_join(p)) return 0;
            } else {
                if (entry.access == CBM_A_RO) { error(SYSOUT_FILE_IS_LOCKED); return 0; }
                if (!scratch(p)) return 0;
            }
        } else {
            last = strlen(p->dir) == boundary;
            slash = strrchr(p->dir, 0x5c);
            strcpy(p->name, slash ? slash + 1 : p->dir);
            if (slash) *slash = 0; else p->dir[0] = 0;
            if (!location_file(p->dev, p->dir)) return 0;
            snprintf(request, sizeof(request), "rd:%s", p->name);
            if (!command(p->dev, request)) return 0;
            if (host_find(p) != -1) { error(SYSOUT_DIRECTORY_NOT_EMPTY); return 0; }
            if (last) return 1;
        }
        if (stop()) return 0;
    }
}
