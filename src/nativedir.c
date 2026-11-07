/* Full FAT names are a presentation mode, not a second shell namespace.
 * All working storage is command-scoped in the existing directory array. */
#include "core.h"
#pragma code(nativedir_code)
#pragma data(nativedir_data)
static unsigned char softiec_files, softiec_drive_id;
#include "softiec-io.h"

#define NATIVE_TOP 8
typedef struct NativeRow {
    char name[256];
    unsigned long bytes, ordinal;
    unsigned char type, known;
} NativeRow;
typedef struct NativeWork {
    NativeRow rows[16], last, entry;
    unsigned long sizes[256];
    unsigned char valid[32], known[32];
} NativeWork;
typedef char NativeWorkFits[sizeof(NativeWork) <= sizeof(directory_entries) ? 1 : -1];
#define NW ((NativeWork *)directory_entries)
typedef struct NativeState {
    unsigned long bytes, skip;
    unsigned int files, dirs;
    unsigned char flags, filter, recursive, partial, used, pending, more, have, limit;
    volatile unsigned char ok;
} NativeState;

static unsigned char native_fold(unsigned char c)
{
    c &= 127;
    return c >= 97 && c <= 122 ? c - 32 : c;
}
static int native_compare_text(const char *a, const char *b)
{
    unsigned char x, y;
    do {
        x = native_fold(*a++); y = native_fold(*b++);
        if (x != y) return (int)x - y;
    } while (x);
    return 0;
}
static int native_name_order(const char *a, const char *b)
{
    int result = native_compare_text(a, b);
    return result ? result : strcmp(a, b);
}
static unsigned int native_match(const char *pattern, const char *name)
{
    const char *star = 0, *retry = 0;
    while (*name) {
        if (*pattern == '*') { star = ++pattern; retry = name; }
        else if (*pattern && (*pattern == '?' || native_fold(*pattern) == native_fold(*name))) { ++pattern; ++name; }
        else if (star) { pattern = star; name = ++retry; }
        else return 0;
    }
    while (*pattern == '*') ++pattern;
    return !*pattern;
}
static unsigned char native_type(const char *name, unsigned char attr)
{
    const char *dot;
    if (attr & 16) return CBM_T_DIR;
    dot = strrchr(name, '.');
    if (dot) {
        if (!native_compare_text(dot, ".PRG")) return CBM_T_PRG;
        if (!native_compare_text(dot, ".REL")) return CBM_T_REL;
        if (!native_compare_text(dot, ".USR")) return CBM_T_USR;
    }
    return CBM_T_SEQ;
}
static unsigned int native_cached(NativeRow *r)
{
    unsigned int i;
    unsigned char mask;
    if (r->type == CBM_T_DIR) { r->bytes = 0; r->known = 1; return 1; }
    if (!r->ordinal || r->ordinal > 256) return 0;
    i = r->ordinal - 1; mask = 1 << (i & 7);
    if (!(NW->valid[i >> 3] & mask)) return 0;
    r->known = 0;
    if (NW->known[i >> 3] & mask) r->known = 1;
    r->bytes = NW->sizes[i];
    return 1;
}
static void native_stat(NativeRow *r)
{
    unsigned int length, i;
    unsigned char more, mask;
    if (native_cached(r)) return;
    r->bytes = 0; r->known = 0;
    if (softiec_dos(0x08, r->name, 0, io, sizeof(io), &length, &more) && length >= 12 && !(io[11] & 16)) {
        r->bytes = (unsigned long)io[0] | ((unsigned long)io[1] << 8) |
            ((unsigned long)io[2] << 16) | ((unsigned long)io[3] << 24);
        r->known = 1;
    }
    if (r->ordinal && r->ordinal <= 256) {
        i = r->ordinal - 1; mask = 1 << (i & 7);
        NW->sizes[i] = r->bytes; NW->valid[i >> 3] |= mask;
        if (r->known) NW->known[i >> 3] |= mask;
    }
}
static int native_compare(const NativeRow *a, const NativeRow *b, unsigned char flags)
{
    unsigned char ka, kb;
    int result = 0;
    if (!(flags & 4)) return a->ordinal < b->ordinal ? -1 : a->ordinal != b->ordinal;
    if (flags & 16) {
        ka = a->type == CBM_T_DIR ? 0 : imagekind(a->name);
        kb = b->type == CBM_T_DIR ? 0 : imagekind(b->name);
        result = native_compare_text(ka ? imageformat(ka) : typename(a->type), kb ? imageformat(kb) : typename(b->type));
    } else if (flags & 32) {
        if (a->known && !b->known) result = -1;
        else if (!a->known && b->known) result = 1;
        else if (a->bytes != b->bytes) result = a->bytes < b->bytes ? -1 : 1;
    }
    if (!result) result = native_compare_text(a->name, b->name);
    if (!result) result = strcmp(a->name, b->name);
    if (result) return flags & 64 ? -result : result;
    return a->ordinal < b->ordinal ? -1 : a->ordinal != b->ordinal;
}
static void native_swap(NativeRow *a, NativeRow *b)
{
    unsigned int i;
    unsigned char t, *x = (unsigned char *)a, *y = (unsigned char *)b;
    for (i = 0; i < sizeof(NativeRow); ++i) { t = x[i]; x[i] = y[i]; y[i] = t; }
}
static void native_keep(NativeState *s, const NativeRow *r)
{
    unsigned char i;
    if (s->skip == r->ordinal || (s->have && native_compare(r, &NW->last, s->flags) <= 0)) return;
    if (s->used < s->limit) NW->rows[s->used++] = *r;
    else if (native_compare(r, NW->rows, s->flags) < 0) NW->rows[0] = *r;
    else return;
    /* The small retained batch keeps insertion order cheap and makes the largest
     * selected key available at index zero without any filesystem calls. */
    for (i = s->used - 1; i && native_compare(&NW->rows[i], &NW->rows[i - 1], s->flags) > 0; --i)
        native_swap(&NW->rows[i], &NW->rows[i - 1]);
    for (i = 0; i + 1 < s->used && native_compare(&NW->rows[i], &NW->rows[i + 1], s->flags) < 0; ++i)
        native_swap(&NW->rows[i], &NW->rows[i + 1]);
}
static unsigned int native_selected(NativeState *s, NativeRow *r)
{
    return strcmp(r->name, ".") && strcmp(r->name, "..") &&
        (s->filter == 255 || r->type == s->filter) &&
        (!s->recursive || r->type != CBM_T_DIR) && native_match(p2.dir, r->name);
}
static unsigned int native_start(unsigned int *length, unsigned char *more)
{
    if (softiec_dos(0x13, 0, 0, io, sizeof(io), length, more) &&
        softiec_dos(0x14, 0, 0, io, sizeof(io), length, more)) return 1;
    if (statusbuf[0] == 48 && statusbuf[1] == 49) { *length = 0; *more = 0; return 1; }
    return 0;
}
static void native_row(unsigned int length, unsigned long ordinal)
{
    memcpy(NW->entry.name, io + 1, length - 1); NW->entry.name[length - 1] = 0;
    NW->entry.type = native_type(NW->entry.name, io[0]);
    NW->entry.ordinal = ordinal; NW->entry.known = 0; NW->entry.bytes = 0;
}
static unsigned int native_write(const char *name, unsigned char flags, unsigned char upper)
{
    unsigned char c;
    while (*name) {
        c = *name++;
        if (flags & 2) { if (c >= 97 && c <= 122) c -= 32; }
        else if (upper) { c = native_fold(c); if (c >= 65 && c <= 90) c += 128; }
        else if (c >= 65 && c <= 90) c += 128;
        else if (c >= 97 && c <= 122) c -= 32;
        if (upper && c == '/') c = 0x5c;
        outc(c);
        if (!redirected && !ox && !page()) return 0;
        if (aborted || stop()) return 0;
    }
    return 1;
}
static unsigned int native_line(void)
{
    if (redirected || ox) { newline(); return page(); }
    return !aborted;
}
static unsigned int native_emit(NativeState *s, NativeRow *r)
{
    if (r->type == CBM_T_DIR) ++s->dirs;
    else {
        ++s->files;
        if (!r->known || s->bytes > 4294967295UL - r->bytes) s->partial = 1;
        else s->bytes += r->bytes;
    }
    if (s->recursive) {
        outs(drivename(p1.dev)); outc(':');
        if (!native_write(p1.dir, s->flags, 1)) return 0;
        if (strlen(p1.dir) > 1) outc(0x5c);
    }
    return native_write(r->name, s->flags, s->recursive) && native_line();
}

/* Each size key is queried once while it fits the command-local ordinal
 * cache. Beyond that cache, bounded metadata batches keep the listing open
 * ended rather than imposing an entry-count limit. */
static __noinline void native_scan(NativeState *s, unsigned char first, unsigned long after)
{
    unsigned int length;
    unsigned char more = 0, known;
    unsigned long ordinal = 0;
    s->ok = 0;
    s->pending = s->more = 0;
    if (!native_start(&length, &more)) goto finish;
    for (;;) {
        ++ordinal;
        if (length > 1) {
            native_row(length, ordinal);
            if (native_selected(s, &NW->entry) && s->skip != ordinal) {
                known = native_cached(&NW->entry);
                if ((s->flags & 36) == 36 && !known) {
                    if (ordinal > after) {
                        if (s->pending < NATIVE_TOP) NW->rows[8 + s->pending++] = NW->entry;
                        else s->more = 1;
                    }
                } else if (first) native_keep(s, &NW->entry);
            }
        }
        if (!more) { s->ok = 1; goto finish; }
        if (stop()) { POKE(ultimatebase, 4); goto finish; }
        if (!softiec_reply(io, sizeof(io), &length, &more)) goto finish;
    }
finish:
    return;
}
static __noinline void native_flat(NativeState *s)
{
    unsigned char i, again, first;
    unsigned long after;
    memset(NW->valid, 0, 32); memset(NW->known, 0, 32);
    s->have = 0; s->skip = 0;
    s->limit = (s->flags & 36) == 36 ? 8 : 16;
    if (s->flags & 128) {
        /* Preserve the first matching physical entry independently of sort. */
        unsigned char order = s->flags;
        s->flags = 0; s->used = 0;
        native_scan(s, 1, 0); if (!s->ok) goto finish;
        if (s->used) {
            NW->entry = NW->rows[s->used - 1];
            if (!s->recursive) native_stat(&NW->entry);
            s->flags = order;
            if (!native_emit(s, &NW->entry)) { s->ok = 0; goto finish; }
            s->skip = NW->entry.ordinal;
        }
        s->flags = order;
    }
    for (;;) {
        s->used = 0; first = 1; after = 0;
        do {
            native_scan(s, first, after); if (!s->ok) goto finish;
            again = s->more;
            for (i = 0; i < s->pending; ++i) {
                native_stat(&NW->rows[8 + i]); native_keep(s, &NW->rows[8 + i]);
                after = NW->rows[8 + i].ordinal;
            }
            first = 0;
        } while (again);
        if (!s->used) { s->ok = 1; goto finish; }
        NW->last = NW->rows[0]; s->have = 1;
        for (i = s->used; i; ) {
            --i;
            if (!s->recursive) native_stat(&NW->rows[i]);
            if (!native_emit(s, &NW->rows[i])) { s->ok = 0; goto finish; }
        }
        if (s->used < s->limit) { s->ok = 1; goto finish; }
    }
finish:
    return;
}

/* No new metadata lookups for plain /N or /N /L: retain the old IEC totals
 * and stream full native names once. Saturated sizes use existing batches. */
static unsigned int native_summary(NativeState *s)
{
    HostCursor cursor;
    struct DirectoryEntry e;
    HostRecord *records = (HostRecord *)directory_entries;
    unsigned char count, i, rest, r = 0, ok = 0;
    if (!host_open(&p1, &cursor, 4, 0)) return 0;
    do {
        count = 0;
        while (count < 12 && !(r = host_next(&cursor, &e))) {
            if (stop()) goto finish;
            strcpy(records[count].name, e.name); records[count].type = e.type; records[count].kind = 255;
            records[count].bytes = (unsigned long)e.size * 254; records[count].known = 0;
            if (e.type == CBM_T_DIR) { records[count].bytes = 0; records[count].known = 1; }
            else if (e.size >= 9999) { records[count].bytes = 0; records[count].known = 2; }
            else if (e.remainder >= 2) {
                rest = e.remainder - 2; records[count].known = 1;
                if (rest && e.size) records[count].bytes -= 254 - rest;
                else if (rest) { records[count].bytes = 0; records[count].known = 2; }
            }
            ++count;
        }
        if (!softiec_list(&p1, records, count, (char *)(records + 12))) goto finish;
        for (i = 0; i < count; ++i) {
            if (records[i].type == CBM_T_DIR) ++s->dirs;
            else {
                ++s->files;
                if (records[i].known == 2 || s->bytes > 4294967295UL - records[i].bytes) s->partial = 1;
                else s->bytes += records[i].bytes;
            }
        }
    } while (!r);
    ok = r == 2;
finish:
    channel_close(4);
    if (!softiec_list(0, 0, 0, 0)) ok = 0;
    return ok;
}
static unsigned int native_stream(NativeState *s)
{
    unsigned int length;
    unsigned char more = 0;
    if (!native_start(&length, &more)) return 0;
    for (;;) {
        if (length > 1) {
            native_row(length, 0);
            if (strcmp(NW->entry.name, ".") && strcmp(NW->entry.name, "..") &&
                (!native_write(NW->entry.name, s->flags, 0) || !native_line())) {
                if (more) POKE(ultimatebase, 4);
                return 0;
            }
        }
        if (!more) return 1;
        if (!softiec_reply(io, sizeof(io), &length, &more)) return 0;
    }
}
static unsigned int native_begin(unsigned char *saved)
{
    unsigned int length;
    unsigned char more, n;
    char component[17];
    const char *q = p1.dir;
    softiec_files = 0;
    if (!ultimatebase || PEEK(ultimatebase + 1) != 0xc9 ||
        !softiec_dos(0x12, 0, 0, (unsigned char *)workspace, 508, &length, &more)) return 0;
    workspace[length] = 0; *saved = 1;
    if (!softiec_dos(0x11, "/", 0, io, sizeof(io), &length, &more)) return 0;
    while (*q) {
        n = 0;
        while (*q && (unsigned char)*q != 0x5c && n < 16) component[n++] = *q++;
        component[n] = 0;
        if (!softiec_resolve(component) || !softiec_dos(0x11, workspace + 512, 0, io, sizeof(io), &length, &more)) return 0;
        if (*q) ++q;
    }
    return 1;
}
/* Iterative native traversal; only the current path and the last child are
 * retained, so nesting is bounded by PATHSIZE rather than a depth constant. */
static unsigned int native_tree(NativeState *s)
{
    unsigned int length, boundary, parent;
    unsigned char more, found;
    char *after = workspace + 768, *slash;
    if (!softiec_dos(0x12, 0, 0, io, sizeof(io), &length, &more)) return 0;
    if (length >= sizeof(p1.dir)) { error(SYSOUT_PATH_TOO_LONG); return 0; }
    memcpy(p1.dir, io, length); p1.dir[length] = 0;
    while (length > 1 && p1.dir[length - 1] == '/') p1.dir[--length] = 0;
    boundary = length; after[0] = 0;
    for (;;) {
        if (!after[0]) { native_flat(s); if (!s->ok) return 0; }
        found = 0;
        if (!native_start(&length, &more)) return 0;
        for (;;) {
            if (length > 1 && (io[0] & 16)) {
                native_row(length, 0);
                if (strcmp(NW->entry.name, ".") && strcmp(NW->entry.name, "..") &&
                    native_name_order(NW->entry.name, after) > 0 &&
                    (!found || native_name_order(NW->entry.name, NW->last.name) < 0)) {
                    NW->last = NW->entry; found = 1;
                }
            }
            if (!more) break;
            if (stop()) { POKE(ultimatebase, 4); return 0; }
            if (!softiec_reply(io, sizeof(io), &length, &more)) return 0;
        }
        if (found) {
            parent = strlen(p1.dir);
            if (parent + (parent > 1) + strlen(NW->last.name) >= sizeof(p1.dir)) { error(SYSOUT_PATH_TOO_LONG); return 0; }
            if (!softiec_dos(0x11, NW->last.name, 0, io, sizeof(io), &length, &more)) return 0;
            if (parent > 1) p1.dir[parent++] = '/';
            strcpy(p1.dir + parent, NW->last.name); after[0] = 0;
        } else {
            if (strlen(p1.dir) == boundary) return 1;
            slash = strrchr(p1.dir, '/'); strcpy(after, slash + 1);
            if (slash == p1.dir) slash[1] = 0; else *slash = 0;
            if (!softiec_dos(0x11, p1.dir, 0, io, sizeof(io), &length, &more)) return 0;
        }
    }
}
__noinline void bank_native_dir(unsigned char flags, unsigned char filter, unsigned char recursive)
{
    NativeState state;
    unsigned int length;
    unsigned char saved = 0, more, ok = 0, fast;
    memset(&state, 0, sizeof(state)); state.flags = flags; state.filter = filter; state.recursive = recursive;
    cachevalid = 0; pagelines = 0;
    fast = !recursive && !(flags & 4) && filter == 255 && !strcmp(p2.dir, "*");
    if (!recursive) {
        if (!location_root(p1.dev, p1.dir)) host_volume(&p1);
        uppername(p1.dir, io); print(SYSOUT_DIR_HEADER, drivename(p1.dev), 0x5c, io); pagelines = 5;
    }
    if (fast && !native_summary(&state)) goto finish;
    if (!native_begin(&saved)) goto finish;
    if (!recursive && p1.dir[0] && filter == 255) {
        if (native_match(p2.dir, ".")) { outc('.'); if (!native_line()) goto finish; ++state.dirs; }
        if (native_match(p2.dir, "..")) { outc('.'); outc('.'); if (!native_line()) goto finish; ++state.dirs; }
    }
    if (recursive) ok = native_tree(&state);
    else if (fast) ok = native_stream(&state);
    else { native_flat(&state); ok = state.ok; }
    if (ok && !recursive) host_footer(state.files, state.dirs, state.bytes, state.partial ? 2 : 1);
finish:
    if (!ok && !aborted) error(SYSOUT_ULTIMATE_DOS_FAILED);
    if (saved && !softiec_dos(0x11, workspace, 0, io, sizeof(io), &length, &more)) error(SYSOUT_ULTIMATE_DOS_RESTORE_FAILED);
    cachevalid = 0;
}
