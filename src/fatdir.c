/* Native Ultimate directory enumeration with command-local packed FAT names.
 * The ordinary DIR array is borrowed until this listing finishes. */
#include "core.h"
#pragma code(fatdir_code)
#pragma data(fatdir_data)

static unsigned char softiec_files, softiec_drive_id;
#include "softiec-io.h"

#define FAT_ROWS 86
#define FAT_PENDING 65535U
#define FAT_LAST 65534U
typedef struct FatRow {
    HostRecord file;
    unsigned int offset;
} FatRow;
typedef struct FatWork {
    FatRow rows[FAT_ROWS + 2];
    char last[256];
    char names[sizeof(directory_entries) - (FAT_ROWS + 2) * sizeof(FatRow) - 256];
} FatWork;
typedef char FatWorkFits[sizeof(FatWork) <= sizeof(directory_entries) ? 1 : -1];
#define FAT_WORK ((FatWork *)directory_entries)
#define FAT_CURSOR (&FAT_WORK->rows[FAT_ROWS])
#define FAT_FIXED (&FAT_WORK->rows[FAT_ROWS + 1])

typedef struct FatListing {
    unsigned long bytes, after;
    unsigned int files, dirs, names;
    unsigned char flags, filter, recursive, native, used, limit, col;
    unsigned char partial, have, fixed, fixed_pending, ended;
} FatListing;

/* Legacy SoftIEC uses SEQ for FAT files without a recognized CBM suffix. */
static unsigned char fat_type(const char *name, unsigned char attr)
{
    const char *dot = strrchr(name, '.');
    unsigned char a, b, c;
    if (attr & 16) return CBM_T_DIR;
    if (dot && strlen(dot) == 4) {
        a = dot[1] & 0x5f; b = dot[2] & 0x5f; c = dot[3] & 0x5f;
        if (a == 80 && b == 82 && c == 71) return CBM_T_PRG;
        if (a == 85 && b == 83 && c == 82) return CBM_T_USR;
        if (a == 82 && b == 69 && c == 76) return CBM_T_REL;
    }
    return CBM_T_SEQ;
}
static unsigned char fat_fold(unsigned char c)
{
    c &= 127;
    return c >= 97 && c <= 122 ? c - 32 : c;
}
static int fat_compare_text(const char *a, const char *b)
{
    unsigned char x, y;
    do {
        x = fat_fold(*a++); y = fat_fold(*b++);
        if (x != y) return (int)x - (int)y;
    } while (x);
    return 0;
}
static unsigned int fat_match(const char *pattern, const char *name)
{
    const char *star = 0, *retry = 0;
    while (*name) {
        if (*pattern == '*') { star = ++pattern; retry = name; }
        else if (*pattern && (*pattern == '?' || fat_fold(*pattern) == fat_fold(*name))) {
            ++pattern; ++name;
        } else if (star) { pattern = star; name = ++retry; }
        else return 0;
    }
    while (*pattern == '*') ++pattern;
    return !*pattern;
}
static const char *fat_fullname(const FatRow *row)
{
    if (row->offset == FAT_PENDING) return workspace + 512;
    if (row->offset == FAT_LAST) return FAT_WORK->last;
    return FAT_WORK->names + row->offset;
}
static int fat_compare(const FatRow *a, const FatRow *b, const FatListing *listing)
{
    const char *first, *second;
    int order = 0;
    if (listing->flags & 16)
        order = strcmp(a->file.kind ? imageformat(a->file.kind) : typename(a->file.type),
                       b->file.kind ? imageformat(b->file.kind) : typename(b->file.type));
    if (!order) {
        first = listing->native ? fat_fullname(a) : a->file.name;
        second = listing->native ? fat_fullname(b) : b->file.name;
        order = listing->native ? fat_compare_text(first, second) : strcmp(first, second);
        if (!order && listing->native) order = strcmp(first, second);
    }
    if (order) return listing->flags & 64 ? -order : order;
    return a->file.ordinal < b->file.ordinal ? -1 : a->file.ordinal != b->file.ordinal;
}
static void fat_swap(unsigned char a, unsigned char b)
{
    FatRow saved = FAT_WORK->rows[a];
    FAT_WORK->rows[a] = FAT_WORK->rows[b];
    FAT_WORK->rows[b] = saved;
}
static void fat_down(unsigned char at, unsigned char count, const FatListing *listing)
{
    unsigned char child;
    while ((unsigned int)at * 2 + 1 < count) {
        child = at * 2 + 1;
        if (child + 1 < count &&
            fat_compare(&FAT_WORK->rows[child], &FAT_WORK->rows[child + 1], listing) < 0) ++child;
        if (fat_compare(&FAT_WORK->rows[at], &FAT_WORK->rows[child], listing) >= 0) break;
        fat_swap(at, child);
        at = child;
    }
}
static void fat_sort(FatListing *listing)
{
    unsigned char count = listing->used;
    while (count > 1) {
        fat_swap(0, --count);
        fat_down(0, count, listing);
    }
}
/* Return 2 when the selected full names require a smaller sorted batch.
 * Restarting selection preserves the global ordering without an entry ceiling. */
static unsigned int fat_keep(FatListing *listing, const FatRow *row)
{
    const char *name = fat_fullname(row);
    unsigned int length = strlen(name) + 1, offset, removed;
    unsigned char replacing = listing->used == listing->limit, i, at, parent;
    if (replacing) {
        if (fat_compare(row, FAT_WORK->rows, listing) >= 0) return 1;
        offset = FAT_WORK->rows[0].offset;
        removed = strlen(FAT_WORK->names + offset) + 1;
        memmove(FAT_WORK->names + offset, FAT_WORK->names + offset + removed,
                listing->names - offset - removed);
        listing->names -= removed;
        for (i = 1; i < listing->used; ++i)
            if (FAT_WORK->rows[i].offset > offset) FAT_WORK->rows[i].offset -= removed;
    }
    if (listing->names + length > sizeof(FAT_WORK->names)) {
        listing->limit = replacing ? listing->used - 1 : listing->used;
        return 2;
    }
    at = replacing ? 0 : listing->used++;
    FAT_WORK->rows[at] = *row;
    FAT_WORK->rows[at].offset = listing->names;
    strcpy(FAT_WORK->names + listing->names, name);
    listing->names += length;
    if (replacing) fat_down(0, listing->used, listing);
    else while (at) {
        parent = (at - 1) / 2;
        if (fat_compare(&FAT_WORK->rows[parent], &FAT_WORK->rows[at], listing) >= 0) break;
        fat_swap(parent, at);
        at = parent;
    }
    return 1;
}
static unsigned int fat_begin(unsigned char *saved)
{
    unsigned int length;
    unsigned char more, used;
    char component[17];
    const char *q = p1.dir;
    softiec_files = 0;
    if (!ultimatebase || PEEK(ultimatebase + 1) != 0xc9 ||
        !softiec_dos(0x12, 0, 0, (unsigned char *)workspace, 508, &length, &more)) return 0;
    workspace[length] = 0;
    *saved = 1;
    if (!softiec_dos(0x11, "/", 0, io, sizeof(io), &length, &more)) return 0;
    while (*q) {
        used = 0;
        while (*q && (unsigned char)*q != 0x5c && used < 16) component[used++] = *q++;
        component[used] = 0;
        if (!softiec_resolve(component) ||
            !softiec_dos(0x11, workspace + 512, 0, io, sizeof(io), &length, &more)) return 0;
        if (*q) ++q;
    }
    return 1;
}
static void fat_stat(FatRow *row)
{
    unsigned int length;
    unsigned char more;
    unsigned char *reply = (unsigned char *)workspace + 512;
    if (row->file.type == CBM_T_DIR) return;
    row->file.bytes = 0;
    row->file.known = 2;
    if (softiec_dos(0x08, fat_fullname(row), 0, reply, sizeof(workspace) - 512, &length, &more) &&
        length >= 12 && !(reply[11] & 16)) {
        row->file.bytes = (unsigned long)reply[0] | ((unsigned long)reply[1] << 8) |
            ((unsigned long)reply[2] << 16) | ((unsigned long)reply[3] << 24);
        row->file.known = 1;
    }
}
static unsigned int fat_write_name(const char *name, unsigned char flags)
{
    unsigned char c;
    while (*name) {
        c = *name++;
        if (flags & 2) {
            if (c >= 97 && c <= 122) c -= 32;
        } else if (c >= 65 && c <= 90) c += 128;
        else if (c >= 97 && c <= 122) c -= 32;
        outc(c);
        if (!redirected && !ox && !page()) return 0;
        if (aborted || stop()) return 0;
    }
    if (redirected || ox) {
        newline();
        return page();
    }
    return !aborted;
}
static unsigned int fat_emit(FatListing *listing, const FatRow *row, const char *name)
{
    struct DirectoryEntry entry;
    HostInfo info;
    if (row->file.type == CBM_T_DIR) ++listing->dirs;
    else {
        ++listing->files;
        if (row->file.known == 2 || listing->bytes > 4294967295UL - row->file.bytes)
            listing->partial = 1;
        else listing->bytes += row->file.bytes;
    }
    if (listing->native) return fat_write_name(name, listing->flags);
    if (listing->recursive) {
        snprintf(io, sizeof(io), SYSOUT_FULL_PATH, drivename(p1.dev), 0x5c,
                 p1.dir, p1.dir[0] ? "\\" : "", row->file.name);
        if (!(listing->flags & 2)) uppername(io, io);
        say(io);
    } else {
        strcpy(entry.name, row->file.name);
        entry.type = row->file.type;
        info.bytes = row->file.bytes; info.known = row->file.known; info.kind = row->file.kind;
        host_row(&entry, DRIVE_SOFTIEC, listing->flags, 0, &listing->col, &info);
    }
    if ((!listing->col || listing->recursive || (listing->flags & 1)) && !page()) return 0;
    return !stop();
}
static unsigned int fat_selected(const FatListing *listing, const FatRow *row)
{
    return strcmp(row->file.name, ".") && strcmp(row->file.name, "..") &&
        (listing->filter == 255 || row->file.type == listing->filter) &&
        (!listing->recursive || row->file.type != CBM_T_DIR) &&
        fat_match(listing->native ? p2.dir : p1.name,
                  listing->native ? fat_fullname(row) : row->file.name);
}
/* A native READ_DIR response owns the UCI transport until consumed or aborted.
 * Size queries and redirected output therefore use closed, packed batches. */
static unsigned int fat_collect(FatListing *listing)
{
    FatRow row;
    unsigned long ordinal = 0;
    unsigned int length, result;
    unsigned char more, streaming = !(listing->flags & 4) && !listing->native &&
        ((listing->flags & 1) || listing->recursive) && !redirected;
    char *native = workspace + 512;
    listing->used = listing->names = listing->ended = 0;
    if (!softiec_dos(0x13, 0, 0, io, sizeof(io), &length, &more)) {
        if (statusbuf[0] == 48 && statusbuf[1] == 49) { listing->ended = 1; return 1; }
        return 0;
    }
    if (!softiec_dos(0x14, 0, 0, io, sizeof(io), &length, &more)) return 0;
    for (;;) {
        ++ordinal;
        if (length > 1 && ((listing->flags & 4) || ordinal > listing->after)) {
            memcpy(native, io + 1, length - 1);
            native[length - 1] = 0;
            row.file.type = fat_type(native, io[0]);
            softiec_files = row.file.type != CBM_T_DIR;
            softiec_alias((const unsigned char *)native, length - 1, row.file.name);
            softiec_files = 0;
            row.file.ordinal = ordinal; row.file.bytes = 0;
            row.file.known = row.file.type == CBM_T_DIR ? 1 : 2;
            row.file.kind = row.file.type == CBM_T_DIR ? 0 : imagekind(native);
            row.offset = FAT_PENDING;
            if (fat_selected(listing, &row)) {
                if ((listing->flags & 128) &&
                    ((!listing->fixed && listing->native) || ordinal == 1)) {
                    if (!listing->fixed) {
                        *FAT_FIXED = row;
                        FAT_FIXED->offset = FAT_LAST;
                        strcpy(FAT_WORK->last, native);
                        listing->fixed = listing->fixed_pending = 1;
                    }
                } else if (!listing->fixed || ordinal != FAT_FIXED->file.ordinal) {
                    if (streaming) {
                        if (!fat_emit(listing, &row, native)) {
                            if (more) POKE(ultimatebase, 4);
                            return 0;
                        }
                    } else if (listing->flags & 4) {
                        if (!listing->have || fat_compare(&row, FAT_CURSOR, listing) > 0) {
                            result = fat_keep(listing, &row);
                            if (result != 1) { if (more) POKE(ultimatebase, 4); return result; }
                        }
                    } else {
                        if (listing->used == FAT_ROWS || listing->names + length > sizeof(FAT_WORK->names)) {
                            if (more) POKE(ultimatebase, 4);
                            return 1;
                        }
                        FAT_WORK->rows[listing->used] = row;
                        FAT_WORK->rows[listing->used++].offset = listing->names;
                        strcpy(FAT_WORK->names + listing->names, native);
                        listing->names += length;
                    }
                }
            }
        }
        if (!(listing->flags & 4) && ordinal > listing->after) listing->after = ordinal;
        if (!more) { listing->ended = 1; return 1; }
        if (stop()) { POKE(ultimatebase, 4); return 0; }
        if (!softiec_reply(io, sizeof(io), &length, &more)) return 0;
    }
}
static unsigned int fat_listing(FatListing *listing)
{
    unsigned int result;
    unsigned char i;
    FatRow *row;
    for (;;) {
        do {
            result = fat_collect(listing);
            if (!result || !listing->limit) return 0;
        } while (result == 2);
        if (listing->flags & 4) fat_sort(listing);
        if (listing->fixed_pending) {
            if (!(listing->flags & 1) && !listing->recursive) fat_stat(FAT_FIXED);
            if (!fat_emit(listing, FAT_FIXED, fat_fullname(FAT_FIXED))) return 0;
            listing->fixed_pending = 0;
        }
        for (i = 0; i < listing->used; ++i) {
            row = &FAT_WORK->rows[i];
            if (!(listing->flags & 1) && !listing->recursive) fat_stat(row);
            if (!fat_emit(listing, row, fat_fullname(row))) return 0;
        }
        if (!(listing->flags & 4)) {
            if (listing->ended) return 1;
        } else {
            if (listing->used < listing->limit) return 1;
            row = &FAT_WORK->rows[listing->used - 1];
            strcpy(FAT_WORK->last, fat_fullname(row));
            *FAT_CURSOR = *row;
            FAT_CURSOR->offset = FAT_LAST;
            listing->have = 1;
        }
    }
}
/* Return 2 before emitting output when the legacy IEC backend can take over. */
__noinline unsigned int bank_fat_dir(unsigned char flags, unsigned char filter, unsigned char mode)
{
    FatListing listing;
    FatRow dot;
    unsigned int length, ok;
    unsigned char saved = 0, more;
    memset(&listing, 0, sizeof(listing));
    listing.flags = flags; listing.filter = filter; listing.recursive = mode & 1;
    listing.native = mode & HOST_DIR_NATIVE; listing.limit = FAT_ROWS;
    cachevalid = 0; pagelines = 0;
    if (!fat_begin(&saved)) {
        if (saved && !softiec_dos(0x11, workspace, 0, io, sizeof(io), &length, &more)) {
            error(SYSOUT_ULTIMATE_DOS_RESTORE_FAILED);
            return 0;
        }
        return 2;
    }
    if (!listing.recursive && !(flags & 1)) {
        if (!location_root(p1.dev, p1.dir)) host_volume(&p1);
        uppername(p1.dir, io);
        print(SYSOUT_DIR_HEADER, drivename(p1.dev), 0x5c, io);
        pagelines = 5;
    }
    if (!listing.recursive && p1.dir[0] && filter == 255) {
        memset(&dot, 0, sizeof(dot)); dot.file.type = CBM_T_DIR; dot.file.known = 1;
        strcpy(dot.file.name, ".");
        if (listing.native ? fat_match(p2.dir, ".") : match(p1.name, "."))
            if (!fat_emit(&listing, &dot, ".")) goto finish_abort;
        strcpy(dot.file.name, "..");
        if (listing.native ? fat_match(p2.dir, "..") : match(p1.name, ".."))
            if (!fat_emit(&listing, &dot, "..")) goto finish_abort;
    }
    ok = fat_listing(&listing);
    if (ok && !listing.recursive && !(flags & 1)) {
        if (listing.col) newline();
        host_footer(listing.files, listing.dirs, listing.bytes, listing.partial ? 2 : 1);
    }
    if (!ok && !aborted) error(SYSOUT_ULTIMATE_DOS_FAILED);
    goto finish_restore;
finish_abort:
    ok = 0;
finish_restore:
    if (!softiec_dos(0x11, workspace, 0, io, sizeof(io), &length, &more)) {
        error(SYSOUT_ULTIMATE_DOS_RESTORE_FAILED);
        ok = 0;
    }
    cachevalid = 0;
    return ok;
}
