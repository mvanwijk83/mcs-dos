/* Ultimate-only, command-scoped DIR buffering. IEC remains the enumerator.
 * The shared CBM array is idle during host DIR; output/navigation helpers do
 * not populate it. All cursors close before redirected output changes path. */
#include "core.h"
#pragma code(ultdir_code)
#pragma data(ultdir_data)
#define ULT_CHUNK 12
#define ULT_TOP 86
typedef struct UltimateScratch {
    HostRecord sorted[ULT_TOP + 2], input[ULT_CHUNK];
    char names[ULT_CHUNK * 256];
} UltimateScratch;
typedef char UltimateScratchFits[sizeof(UltimateScratch) <= sizeof(directory_entries) ? 1 : -1];
#define ULT_SCRATCH ((UltimateScratch *)directory_entries)
typedef struct UltimateTotals {
    unsigned long bytes;
    unsigned int files, dirs;
    unsigned char summary, col, ok;
} UltimateTotals;

static void ultimate_record(HostRecord *r, const struct DirectoryEntry *e, unsigned long ordinal)
{
    unsigned char rest;
    strcpy(r->name, e->name); r->type = e->type; r->ordinal = ordinal;
    r->kind = e->type == CBM_T_DIR ? 0 : imagekind(e->name);
    r->known = 0; r->bytes = (unsigned long)e->size * 254;
    if (e->type == CBM_T_DIR) { r->bytes = 0; r->known = 1; }
    else if (e->size >= 9999) { r->bytes = 0; r->known = 2; }
    else if (e->remainder >= 2) {
        rest = e->remainder - 2;
        if (rest) {
            if (!e->size) { r->bytes = 0; r->known = 2; return; }
            r->bytes -= 254 - rest;
        }
        r->known = 1;
    }
}

/* Every sort key is already in RAM. Ordinal breaks duplicate IEC aliases
 * without losing entries or reversing their physical order on equal keys. */
static int ultimate_compare(const HostRecord *a, const HostRecord *b, unsigned char flags)
{
    int result = 0;
    if (flags & 16)
        result = strcmp(a->kind ? imageformat(a->kind) : typename(a->type),
                        b->kind ? imageformat(b->kind) : typename(b->type));
    else if (flags & 32) {
        if ((a->known == 2) != (b->known == 2)) result = a->known == 2 ? 1 : -1;
        else if (a->bytes != b->bytes) result = a->bytes < b->bytes ? -1 : 1;
    }
    if (!result) result = strcmp(a->name, b->name);
    if (result) return flags & 64 ? -result : result;
    return a->ordinal < b->ordinal ? -1 : a->ordinal != b->ordinal;
}
static void ultimate_swap(HostRecord *a, HostRecord *b)
{
    HostRecord tmp = *a; *a = *b; *b = tmp;
}
static void ultimate_down(unsigned char at, unsigned char count, unsigned char flags)
{
    unsigned char child;
    HostRecord *heap = ULT_SCRATCH->sorted;
    while ((unsigned int)at * 2 + 1 < count) {
        child = at * 2 + 1;
        if (child + 1 < count && ultimate_compare(&heap[child], &heap[child + 1], flags) < 0) ++child;
        if (ultimate_compare(&heap[at], &heap[child], flags) >= 0) break;
        ultimate_swap(&heap[at], &heap[child]); at = child;
    }
}
static void ultimate_keep(const HostRecord *r, unsigned char *count, unsigned char flags)
{
    unsigned char at, parent;
    HostRecord *heap = ULT_SCRATCH->sorted;
    if (*count == ULT_TOP) {
        if (ultimate_compare(r, heap, flags) >= 0) return;
        heap[0] = *r; ultimate_down(0, *count, flags); return;
    }
    at = (*count)++; heap[at] = *r;
    while (at) {
        parent = (at - 1) / 2;
        if (ultimate_compare(&heap[parent], &heap[at], flags) >= 0) break;
        ultimate_swap(&heap[parent], &heap[at]); at = parent;
    }
}
static void ultimate_sort(unsigned char count, unsigned char flags)
{
    while (count > 1) {
        ultimate_swap(&ULT_SCRATCH->sorted[0], &ULT_SCRATCH->sorted[--count]);
        ultimate_down(0, count, flags);
    }
}
static unsigned char ultimate_enrich(HostRecord *r, unsigned char count, unsigned char flags, unsigned char recursive)
{
    if (!(flags & (16 | 32)) && (recursive || (flags & 1))) return 1;
    return softiec_list(&p1, r, count, ULT_SCRATCH->names);
}
/* Keep the output status in the caller-owned totals: the linked optimizer
 * mishandles a byte return across this helper's banked row call. */
static __noinline void ultimate_emit(const HostRecord *r, unsigned char flags, unsigned char recursive, UltimateTotals *total)
{
    struct DirectoryEntry entry;
    HostInfo info;
    total->ok = 1;
    if (r->type == CBM_T_DIR) ++total->dirs;
    else {
        ++total->files;
        if (r->known == 2 || total->bytes > 4294967295UL - r->bytes) total->summary = 2;
        else total->bytes += r->bytes;
    }
    if (recursive) {
        if (r->type != CBM_T_DIR) {
            snprintf(io, sizeof(io), SYSOUT_FULL_PATH, drivename(p1.dev), 0x5c,
                     p1.dir, p1.dir[0] ? "\\" : "", r->name);
            if (!(flags & 2)) uppername(io, io);
            say(io);
        }
    } else {
        strcpy(entry.name, r->name); entry.type = r->type;
        info.bytes = r->bytes; info.known = r->known; info.kind = r->kind;
        host_row(&entry, DRIVE_SOFTIEC, flags, 0, &total->col, &info);
    }
    if ((!recursive || r->type != CBM_T_DIR) &&
        (!total->col || recursive || (flags & 1))) {
        total->ok = page();
        if (stop()) total->ok = 0;
    }
}

/* Ordinary output keeps one IEC stream. Redirection borrows the sort buffer
 * too, reopening/skipping once per 86 matches rather than once per entry. */
static __noinline unsigned char ultimate_unsorted(unsigned char flags, unsigned char filter, unsigned char recursive, UltimateTotals *total)
{
    HostCursor cursor;
    struct DirectoryEntry entry;
    unsigned long ordinal = 0, skip;
    unsigned char count, i, j, n, r = 0, capacity = redirected ? ULT_TOP : ULT_CHUNK;
    HostRecord *records = redirected ? ULT_SCRATCH->sorted : ULT_SCRATCH->input;
    if (!host_open(&p1, &cursor, 4, 0)) return 0;
    for (;;) {
        count = 0;
        while (count < capacity && !(r = host_next(&cursor, &entry))) {
            if (stop()) goto failed;
            ++ordinal;
            if ((filter != 255 && entry.type != filter) || !match(p1.name, entry.name)) continue;
            ultimate_record(&records[count++], &entry, ordinal);
        }
        if (redirected) { channel_close(4); cursor.done = 1; }
        for (i = 0; i < count; i += ULT_CHUNK) {
            n = count - i < ULT_CHUNK ? count - i : ULT_CHUNK;
            if (!ultimate_enrich(records + i, n, flags, recursive)) goto failed;
            for (j = i; j < i + n; ++j) {
                ultimate_emit(&records[j], flags, recursive, total);
                if (!total->ok) goto failed;
            }
        }
        if (r) break;
        if (redirected) {
            if (!host_open(&p1, &cursor, 4, 0)) return 0;
            for (skip = 0; skip < ordinal; ++skip)
                if (host_next(&cursor, &entry)) goto failed;
        }
    }
    channel_close(4); return r == 2;
failed:
    channel_close(4); return 0;
}

/* Retain the next 86 records per pass, with no entry-count ceiling. Name
 * sorting resolves only selected records. Size/type overflow passes enrich
 * candidate batches before selection; comparisons themselves never do I/O. */
static __noinline unsigned char ultimate_ordered(unsigned char flags, unsigned char filter, unsigned char recursive, UltimateTotals *total)
{
    HostCursor cursor;
    struct DirectoryEntry entry;
    HostRecord *last = &ULT_SCRATCH->sorted[ULT_TOP], *fixed = last + 1;
    unsigned long ordinal;
    unsigned char count, used, i, r, have = 0, first = 1, fixedrow, keyed = flags & (16 | 32);
    for (;;) {
        count = used = fixedrow = 0; ordinal = 0;
        if (!host_open(&p1, &cursor, 4, 0)) return 0;
        for (;;) {
            r = host_next(&cursor, &entry);
            if (!r) {
                ++ordinal;
                if (stop()) goto failed;
                if ((filter != 255 && entry.type != filter) || !match(p1.name, entry.name)) continue;
                if ((flags & 128) && ordinal == 1) {
                    if (first) { ultimate_record(fixed, &entry, ordinal); fixedrow = 1; }
                    continue;
                }
                ultimate_record(&ULT_SCRATCH->input[count++], &entry, ordinal);
            }
            if (count == ULT_CHUNK || r) {
                if (keyed && !ultimate_enrich(ULT_SCRATCH->input, count, flags, recursive)) goto failed;
                for (i = 0; i < count; ++i)
                    if (!have || ultimate_compare(&ULT_SCRATCH->input[i], last, flags) > 0)
                        ultimate_keep(&ULT_SCRATCH->input[i], &used, flags);
                count = 0;
            }
            if (r) break;
        }
        channel_close(4);
        if (r != 2) return 0;
        ultimate_sort(used, flags);
        if (fixedrow) {
            if (!ultimate_enrich(fixed, 1, flags, recursive)) return 0;
            ultimate_emit(fixed, flags, recursive, total);
            if (!total->ok) return 0;
        }
        for (i = 0; i < used; i += ULT_CHUNK) {
            count = used - i < ULT_CHUNK ? used - i : ULT_CHUNK;
            if (!keyed && !ultimate_enrich(&ULT_SCRATCH->sorted[i], count, flags, recursive)) return 0;
            for (r = i; r < i + count; ++r) {
                ultimate_emit(&ULT_SCRATCH->sorted[r], flags, recursive, total);
                if (!total->ok) return 0;
            }
        }
        if (used < ULT_TOP) return 1;
        *last = ULT_SCRATCH->sorted[used - 1]; have = 1; first = 0;
    }
failed:
    channel_close(4); return 0;
}

__noinline unsigned char bank_ultimate_dir(unsigned char flags, unsigned char filter, unsigned char recursive)
{
    UltimateTotals total;
    HostRecord *dot = ULT_SCRATCH->input;
    unsigned char ok = 0;
    memset(&total, 0, sizeof(total)); total.summary = 1; cachevalid = 0;
    if (!recursive && !(flags & 1)) {
        if (!location_root(p1.dev, p1.dir)) host_volume(&p1);
        uppername(p1.dir, io);
        print(SYSOUT_DIR_HEADER, drivename(p1.dev), 0x5c, io); pagelines = 5;
    }
    if (!recursive && p1.dir[0] && filter == 255) {
        dot->type = CBM_T_DIR; dot->bytes = dot->kind = 0; dot->known = 1;
        strcpy(dot->name, ".");
        if (match(p1.name, dot->name)) {
            ultimate_emit(dot, flags, 0, &total);
            if (!total.ok) goto finished;
        }
        strcpy(dot->name, "..");
        if (match(p1.name, dot->name)) {
            ultimate_emit(dot, flags, 0, &total);
            if (!total.ok) goto finished;
        }
    }
    ok = flags & 4 ? ultimate_ordered(flags, filter, recursive, &total) : ultimate_unsorted(flags, filter, recursive, &total);
    if (ok && !recursive && !(flags & 1)) {
        if (total.col) newline();
        host_footer(total.files, total.dirs, total.bytes, total.summary);
    }
finished:
    channel_close(4);
    if (!softiec_list(0, 0, 0, 0)) ok = 0;
    cachevalid = 0;
    return ok;
}
