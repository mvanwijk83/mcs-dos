/* Legacy Software IEC directory rename compatibility. The original DOS target
 * avoids the IEC R command's erroneous directory type-extension suffix. */
#include "core.h"
#pragma code(softiec_code)
#pragma data(softiec_data)
static unsigned char softiec_files, softiec_drive_id;
unsigned long softiec_file_size;
unsigned char softiec_file_kind;
static unsigned char list_tried, list_saved, list_valid;
__noinline unsigned char bank_softiec_long_mount(MountRecord *record);

#include "softiec-io.h"

/* Restrict explicit device numbers to powered Ultimate emulated drives.
 * Never use the firmware's implicit "last mounted drive" destination. */
__noinline unsigned char bank_ultimate_drive(unsigned char dev)
{
    unsigned int length, at;
    unsigned char more;
    if (!ultimatebase || PEEK(ultimatebase + 1) != 0xc9 || !softiec_wait(0xfd, 0)) return 0;
    POKE(ultimatebase + 1, 4); POKE(ultimatebase + 1, 0x29); POKE(ultimatebase + 1, 1);
    POKE(ultimatebase, 1);
    if (!softiec_reply(io, sizeof(io), &length, &more) || more) return 0;
    for (at = 1; at + 2 < length; at += 3)
        if (io[at] < 15 && io[at + 1] == dev && io[at + 2]) return 1;
    return 0;
}

/* Resolve actual FAT names with the original DOS target, independently of
 * the Software IEC drive's own path. No 3.15-only command is required. */
static unsigned char softiec_file(const Path *p, const char *name, unsigned char dev, unsigned char unmount)
{
    unsigned int length;
    unsigned char more, ok = 0, saved = 0, n;
    const char *q;
    char component[17];
    softiec_drive_id = dev; softiec_files = 0;
    if (!ultimatebase || PEEK(ultimatebase + 1) != 0xc9) return 0;
    if (unmount == 1) return softiec_dos(0x24, 0, 0, io, sizeof(io), &length, &more);
    if (!softiec_dos(0x12, 0, 0, (unsigned char *)workspace, 508, &length, &more)) return 0;
    workspace[length] = 0; saved = 1;
    if (!softiec_dos(0x11, "/", 0, io, sizeof(io), &length, &more)) goto finished;
    q = p->dir;
    while (*q) {
        n = 0;
        while (*q && (unsigned char)*q != 0x5c && n < 16) component[n++] = *q++;
        component[n] = 0;
        if (!softiec_resolve(component) ||
            !softiec_dos(0x11, workspace + 512, 0, io, sizeof(io), &length, &more)) goto finished;
        if (*q) ++q;
    }
    softiec_files = 1;
    ok = softiec_resolve(name);
    softiec_files = 0;
    if (!ok) goto finished;
    if (unmount == 3) {
        softiec_file_kind = imagekind(workspace + 512);
        /* FILE_STAT returns directory metadata, without opening or reading
         * the file. It exists in the original DOS target, before 3.15. */
        if (softiec_dos(0x08, workspace + 512, 0, io, sizeof(io), &length, &more) &&
            length >= 12 && !(io[11] & 16)) {
            softiec_file_size = (unsigned long)io[0] | ((unsigned long)io[1] << 8) |
                ((unsigned long)io[2] << 16) | ((unsigned long)io[3] << 24);
            component[0] = '.'; memcpy(component + 1, io + 8, 3); component[4] = 0;
            softiec_file_kind = imagekind(component);
            ok = 3;
        } else ok = 1;
    } else if (unmount == 2) ok = imagekind(workspace + 512);
    else ok = softiec_dos(0x23, workspace + 512, 0, io, sizeof(io), &length, &more);
finished:
    softiec_files = 0;
    /* Restoring the DOS path replaces statusbuf; retain a resolution failure
     * so the caller can distinguish an ambiguous file from a mount error. */
    if (!ok) strcpy(workspace + 832, statusbuf);
    if (saved && !softiec_dos(0x11, workspace, 0, io, sizeof(io), &length, &more)) ok = 0;
    else if (!ok) strcpy(statusbuf, workspace + 832);
    return ok;
}

__noinline unsigned char bank_softiec_mount(const Path *p, unsigned char dev, unsigned char unmount)
{
    if (unmount == SOFTIEC_MOUNT_NATIVE) return bank_softiec_long_mount((MountRecord *)p);
    return softiec_file(p, p ? p->name : (const char *)0, dev, unmount);
}
/* bit 0: resolved native filename; bit 1: exact byte size available. */
__noinline unsigned char bank_softiec_metadata(const Path *p, const char *name)
{
    softiec_file_size = 0; softiec_file_kind = 0;
    return softiec_file(p, name, 0, 3);
}

/* One DOS-target path transaction per DIR. workspace's saved path is owned
 * until listing cleanup closes it, including abort/error exits. */
static void softiec_list_begin(const Path *p)
{
    unsigned int length;
    unsigned char more, n;
    char component[17];
    const char *q = p->dir;
    list_tried = 1; list_saved = list_valid = softiec_files = 0;
    if (!ultimatebase || PEEK(ultimatebase + 1) != 0xc9 ||
        !softiec_dos(0x12, 0, 0, (unsigned char *)workspace, 508, &length, &more)) return;
    workspace[length] = 0; list_saved = 1;
    if (!softiec_dos(0x11, "/", 0, io, sizeof(io), &length, &more)) return;
    while (*q) {
        n = 0;
        while (*q && (unsigned char)*q != 0x5c && n < 16) component[n++] = *q++;
        component[n] = 0;
        if (!softiec_resolve(component) ||
            !softiec_dos(0x11, workspace + 512, 0, io, sizeof(io), &length, &more)) return;
        if (*q) ++q;
    }
    list_valid = 1;
}

/* Whole-name comparison is independent of the compiler's PETSCII case map. */
static unsigned char softiec_long_equal(const unsigned char *native, unsigned int size, const char *typed)
{
    unsigned int i;
    unsigned char a, b;
    if (strlen(typed) != size) return 0;
    for (i = 0; i < size; ++i) {
        a = native[i] & 127; b = (unsigned char)typed[i] & 127;
        if (a >= 97 && a <= 122) a -= 32;
        if (b >= 97 && b <= 122) b -= 32;
        if (a != b) return 0;
    }
    return 1;
}

/* Native records reuse dir for the complete shell parent/leaf specification.
 * Canonical FAT spelling replaces the leaf only after a unique exact match. */
__noinline unsigned char bank_softiec_long_mount(MountRecord *record)
{
    unsigned int length, prefix, leafsize;
    unsigned char more = 0, n, found = 0, duplicate = 0, saved = 0, ok = 0;
    char component[17], *leaf = strrchr(record->dir, 0x5c), *q = record->dir;
    leaf = leaf ? leaf + 1 : record->dir;
    prefix = leaf - record->dir;
    softiec_files = 0;
    if (!ultimatebase || PEEK(ultimatebase + 1) != 0xc9) goto finished;
    if (!softiec_dos(0x12, 0, 0, (unsigned char *)workspace, 508, &length, &more)) goto finished;
    workspace[length] = 0; saved = 1;
    if (!softiec_dos(0x11, "/", 0, io, sizeof(io), &length, &more)) goto finished;
    while (q < leaf) {
        n = 0;
        while (*q && (unsigned char)*q != 0x5c && n < 16) component[n++] = *q++;
        component[n] = 0;
        if (!softiec_resolve(component) || !softiec_dos(0x11, workspace + 512, 0, io, sizeof(io), &length, &more)) goto finished;
        if (*q) ++q;
    }
    if (!softiec_dos(0x13, 0, 0, io, sizeof(io), &length, &more) ||
        !softiec_dos(0x14, 0, 0, io, sizeof(io), &length, &more)) goto finished;
    for (;;) {
        if (length > 1 && !(io[0] & 16) && softiec_long_equal(io + 1, length - 1, leaf)) {
            if (found) duplicate = 1;
            else { memcpy(workspace + 512, io + 1, length - 1); workspace[511 + length] = 0; found = 1; }
        }
        if (!more) break;
        if (stop()) { POKE(ultimatebase, 4); goto finished; }
        if (!softiec_reply(io, sizeof(io), &length, &more)) goto finished;
    }
    if (duplicate) { strcpy(statusbuf, SYSOUT_AMBIGUOUS_FILE_NAME); goto finished; }
    if (!found) {
        /* A short comma-containing IEC alias still gets the usual ambiguity
         * diagnostic, while full native names never fall back to truncation. */
        if (strlen(leaf) > 16) { strcpy(statusbuf, SYSOUT_FILE_NOT_FOUND); goto finished; }
        softiec_files = 1;
        found = softiec_resolve(leaf); softiec_files = 0;
        if (!found) goto finished;
    }
    leafsize = strlen(workspace + 512);
    if (prefix + leafsize >= sizeof(record->dir)) { strcpy(statusbuf, SYSOUT_PATH_TOO_LONG); goto finished; }
    record->type = MOUNT_NATIVE | imagekind(workspace + 512);
    if (!(record->type & 127)) { strcpy(statusbuf, SYSOUT_UNSUPPORTED_DRIVE_TYPE); goto finished; }
    softiec_files = 1;
    softiec_alias((const unsigned char *)workspace + 512, leafsize, record->name);
    softiec_files = 0;
    softiec_drive_id = record->dev;
    ok = softiec_dos(0x23, workspace + 512, 0, io, sizeof(io), &length, &more);
    if (ok) strcpy(record->dir + prefix, workspace + 512);
finished:
    softiec_files = 0;
    if (!ok) strcpy(workspace + 832, statusbuf);
    if (saved && !softiec_dos(0x11, workspace, 0, io, sizeof(io), &length, &more)) ok = 0;
    else if (!ok) strcpy(statusbuf, workspace + 832);
    return ok;
}

/* Resolve all pending aliases with one native directory stream. Only capped
 * sizes require STAT. Each caller supplies twelve 256-byte native-name slots,
 * so even maximum FAT names fit; no per-file directory rescans are needed. */
__noinline unsigned char bank_softiec_list(const Path *p, HostRecord *records, unsigned char count, char *names)
{
    unsigned int length;
    unsigned char more, i, pending = 0, ok = 1;
    char *native;
    if (!p) {
        if (list_saved && !softiec_dos(0x11, workspace, 0, io, sizeof(io), &length, &more)) {
            error(SYSOUT_ULTIMATE_DOS_RESTORE_FAILED); ok = 0;
        }
        list_tried = list_saved = list_valid = softiec_files = 0;
        return ok;
    }
    for (i = 0; i < count; ++i) {
        if (records[i].type != CBM_T_DIR && (records[i].known == 2 ||
            (strlen(records[i].name) == 16 && !records[i].kind))) {
            records[i].known |= 16; pending = 1;
        }
    }
    if (!pending) return 1;
    if (!list_tried) softiec_list_begin(p);
    if (!list_valid) goto finished;
    if (!softiec_dos(0x13, 0, 0, io, sizeof(io), &length, &more) ||
        !softiec_dos(0x14, 0, 0, io, sizeof(io), &length, &more)) goto failed;
    softiec_files = 1;
    for (;;) {
        if (length > 1 && !(io[0] & 16)) {
            for (i = 0; i < count; ++i)
                if ((records[i].known & 16) && softiec_matches(io + 1, length - 1, records[i].name)) {
                    if (records[i].known & 32) records[i].known |= 64;
                    else {
                        native = names + (unsigned int)i * 256;
                        memcpy(native, io + 1, length - 1); native[length - 1] = 0;
                        records[i].known |= 32;
                    }
                }
        }
        if (!more) break;
        if (stop()) { POKE(ultimatebase, 4); ok = 0; goto finished; }
        if (!softiec_reply(io, sizeof(io), &length, &more)) goto failed;
    }
    softiec_files = 0;
    for (i = 0; i < count; ++i) {
        if ((records[i].known & 112) != 48) continue;
        native = names + (unsigned int)i * 256;
        records[i].kind = imagekind(native);
        if ((records[i].known & 3) != 2) continue;
        if (stop()) { ok = 0; goto finished; }
        if (softiec_dos(0x08, native, 0, io, sizeof(io), &length, &more) &&
            length >= 12 && !(io[11] & 16)) {
            records[i].bytes = (unsigned long)io[0] | ((unsigned long)io[1] << 8) |
                ((unsigned long)io[2] << 16) | ((unsigned long)io[3] << 24);
            records[i].known = 1;
        }
    }
    goto finished;
failed:
    list_valid = 0;
finished:
    softiec_files = 0;
    for (i = 0; i < count; ++i) records[i].known &= 3;
    return ok;
}

/* Track whether the DOS target was originally inside the directory being
 * renamed. Such a saved path must follow the rename before restoration. */
static unsigned int softiec_prefix(unsigned int offset, const char *name)
{
    unsigned int n = strlen(name);
    if (!offset || strnicmp(workspace + offset, name, n) ||
        (workspace[offset + n] && workspace[offset + n] != '/')) return 0;
    return offset + n + (workspace[offset + n] == '/');
}

/* Original firmware FAT spelling for a new CBM name: lowercase ASCII and
 * escaped PETSCII bytes. Sixteen CBM bytes fit within this 64-byte scratch. */
static void softiec_native(const char *name, char *native)
{
    static const unsigned char hex[] = {48,49,50,51,52,53,54,55,56,57,65,66,67,68,69,70};
    unsigned char c, escape = 0;
    while ((c = *name++)) {
        if (c < 32 || c >= 96 || c == ':' || c == '/' || c == 0x5c ||
            c == '*' || c == '"' || c == '<' || c == '>' || c == '?') {
            if (!escape) { *native++ = 123; escape = 1; }
            *native++ = hex[c >> 4]; *native++ = hex[c & 15];
        } else {
            if (escape) { *native++ = 125; escape = 0; }
            *native++ = c >= 65 && c <= 90 ? c + 32 : c;
        }
    }
    if (escape) *native++ = 125;
    *native = 0;
}

/* UCI write packets carry one or two raw sectors. A null sector is zero-filled
 * here, so the image contents are independent of FAT seek-past-EOF semantics. */
static void softiec_disk_sector(volatile unsigned char *fifo, const unsigned char *data)
{
    unsigned char i = 0;
    if (data) {
        do { *fifo = data[i]; } while (++i);
    } else {
        do {
            *fifo = 0; *fifo = 0; *fifo = 0; *fifo = 0;
            i += 4;
        } while (i);
    }
}

static unsigned char softiec_disk_write(unsigned char count, const unsigned char *first,
                                        const unsigned char *second)
{
    volatile unsigned char *fifo = (volatile unsigned char *)(ultimatebase + 1);
    unsigned int length;
    unsigned char more;
    if (!softiec_wait(0xfd, 0)) {
        strcpy(statusbuf, SYSOUT_ULTIMATE_DOS_FAILED);
        return 0;
    }
    *fifo = 2; *fifo = 5; *fifo = 0; *fifo = 0;
    softiec_disk_sector(fifo, first);
    if (count == 2)
        softiec_disk_sector(fifo, second);
    POKE(ultimatebase, 1);
    return softiec_reply(io, sizeof(io), &length, &more) && !more;
}

static unsigned char softiec_disk_open(const char *name, unsigned char mode)
{
    volatile unsigned char *fifo = (volatile unsigned char *)(ultimatebase + 1);
    unsigned int length;
    unsigned char more;
    if (!softiec_wait(0xfd, 0)) {
        strcpy(statusbuf, SYSOUT_ULTIMATE_DOS_FAILED);
        return 0;
    }
    *fifo = 2; *fifo = 2; *fifo = mode;
    while (*name) *fifo = *name++;
    POKE(ultimatebase, 1);
    return softiec_reply(io, sizeof(io), &length, &more) && !more;
}

/* READ_DATA may return an empty status FIFO on success. Compare the full
 * sector and consume the status before acknowledging this single reply. */
static unsigned char softiec_disk_check(unsigned int sector, const unsigned char *expected)
{
    volatile unsigned char *fifo = (volatile unsigned char *)(ultimatebase + 1);
    volatile unsigned char *data = fifo + 1, *status = fifo + 2;
    unsigned int length;
    unsigned char more, i = 0, equal = 1, count = 0, byte;
    if (!softiec_wait(0xfd, 0)) return 0;
    *fifo = 2; *fifo = 6; *fifo = 0; *fifo = sector; *fifo = sector >> 8; *fifo = 0;
    POKE(ultimatebase, 1);
    if (!softiec_reply(io, sizeof(io), &length, &more) || more) return 0;
    if (!softiec_wait(0xfd, 0)) return 0;
    *fifo = 2; *fifo = 4; *fifo = 0; *fifo = 1;
    POKE(ultimatebase, 1);
    if (!softiec_wait(0x22, 0x20) || (PEEK(ultimatebase) & 0x10)) goto failed;
    do {
        if (!(PEEK(ultimatebase) & 128)) goto failed;
        byte = *data;
        if (byte != expected[i]) equal = 0;
    } while (++i);
    if (PEEK(ultimatebase) & 128) goto failed;
    while (PEEK(ultimatebase) & 64) {
        if (count == sizeof(statusbuf) - 1) goto failed;
        byte = *status;
        if (count < 2 && byte != 48) equal = 0;
        ++count;
    }
    POKE(ultimatebase, 2);
    return equal && count != 1;
failed:
    POKE(ultimatebase, 4);
    return 0;
}

static unsigned char softiec_disk_verify(const char *name, unsigned char kind,
                                         const ImageLabel *label)
{
    const ImageLayout *layout = &image_layouts[kind - 1];
    unsigned char *expected = (unsigned char *)workspace + 512;
    unsigned int length;
    unsigned char more, index, ok;
    if (!softiec_disk_open(name, 1)) return 0;
    memset(expected, 0, 256);
    ok = softiec_disk_check(0, expected);
    for (index = 0; ok && index < layout->count; ++index) {
        image_metadata(kind, index, label, expected);
        ok = softiec_disk_check(layout->metadata[index], expected);
    }
    return softiec_dos(0x03, 0, 0, io, sizeof(io), &length, &more) && ok;
}

__noinline unsigned char bank_softiec_makedisk(const Path *p, unsigned char kind,
                                              const ImageLabel *label)
{
    const ImageLayout *layout = &image_layouts[kind - 1];
    unsigned int length, sector;
    unsigned char more, count, index = 0, opened = 0, ok = 0;
    unsigned char *first, *second;
    char *native = workspace + 768;

    /* Reuse the directory transaction used for native listing. */
    softiec_list_begin(p);
    if (!list_valid) goto finish;
    softiec_native(p->name, native);
    if (!softiec_disk_open(native, 6)) goto finish; /* WRITE | CREATE_NEW */
    opened = 1;
    for (sector = 0; sector < layout->sectors; sector += count) {
        if (stop()) goto finish;
        /* Legacy firmware can write garbage on aligned 512-byte UCI writes.
         * Start with 256 bytes so all 512-byte packets cross a sector boundary. */
        count = sector && layout->sectors - sector > 1 ? 2 : 1;
        first = second = 0;
        if (index < layout->count && layout->metadata[index] == sector) {
            first = io;
            image_metadata(kind, index++, label, first);
        }
        if (count == 2 && index < layout->count && layout->metadata[index] == sector + 1) {
            second = (unsigned char *)workspace + 512;
            image_metadata(kind, index++, label, second);
        }
        if (!softiec_disk_write(count, first, second)) goto finish;
    }
    ok = 1;
finish:
    if (!ok && !aborted && statusbuf[0]) error(statusbuf);
    if (opened) {
        if (!softiec_dos(0x03, 0, 0, io, sizeof(io), &length, &more)) ok = 0;
        /* The legacy write reply does not expose short writes. Verify size
         * after close before reporting success. */
        if (ok)
            ok = softiec_dos(0x08, native, 0, io, sizeof(io), &length, &more) &&
                 length >= 4 && io[0] == 0 && io[1] == (unsigned char)layout->sectors &&
                 io[2] == layout->sectors >> 8 && io[3] == 0;
        if (ok && !softiec_disk_verify(native, kind, label)) {
            ok = 0;
            error(SYSOUT_MAKEDISK_VERIFY_FAILED);
        }
        if (!ok && !softiec_dos(0x09, native, 0, io, sizeof(io), &length, &more))
            error(statusbuf);
    }
    if (!bank_softiec_list(0, 0, 0, 0)) ok = 0;
    return ok;
}

/* Reuse the idle editor workspace: saved DOS path, resolved source, error.
 * Shell paths and the Software IEC drive's own location are never changed. */
__noinline void bank_softiec_rename(void)
{
    unsigned int length, offset = 0, oldlength = 0, newlength = 0;
    unsigned char more, ok = 0, saved = 0, changed = 0, n;
    const char *q = p1.dir;
    char component[17];
    if (!ultimatebase || PEEK(ultimatebase + 1) != 0xc9 || (PEEK(ultimatebase) & 0xfd)) {
        error(SYSOUT_ULTIMATE_DOS_FAILED);
        return;
    }
    if (!softiec_dos(0x12, 0, 0, (unsigned char *)workspace, 508, &length, &more)) goto finish;
    workspace[length] = 0;
    if (!length || workspace[0] != '/') {
        strcpy(statusbuf, SYSOUT_ULTIMATE_DOS_FAILED); goto finish;
    }
    saved = 1;
    if (workspace[0] == '/') offset = 1;
    changed = 1;
    if (!softiec_dos(0x11, "/", 0, io, sizeof(io), &length, &more)) goto finish;
    while (*q) {
        n = 0;
        while (*q && (unsigned char)*q != 0x5c && n < 16) component[n++] = *q++;
        component[n] = 0;
        if (!softiec_resolve(component)) goto finish;
        offset = softiec_prefix(offset, workspace + 512);
        if (!softiec_dos(0x11, workspace + 512, 0, io, sizeof(io), &length, &more)) goto finish;
        if (*q) ++q;
    }
    if (!softiec_resolve(p1.name)) goto finish;
    softiec_native(p2.name, workspace + 768);
    if (softiec_prefix(offset, workspace + 512)) {
        oldlength = strlen(workspace + 512);
        newlength = strlen(workspace + 768);
        if (strlen(workspace) - oldlength + newlength > 508) {
            strcpy(statusbuf, SYSOUT_PATH_TOO_LONG); goto finish;
        }
    } else offset = 0;
    ok = softiec_dos(0x0a, workspace + 512, workspace + 768, io, sizeof(io), &length, &more);
    if (ok && offset) {
        memmove(workspace + offset + newlength, workspace + offset + oldlength,
                strlen(workspace + offset + oldlength) + 1);
        memcpy(workspace + offset, workspace + 768, newlength);
    }
finish:
    /* Preserve the operation's status while restoring the DOS target's path. */
    strcpy(workspace + 832, statusbuf);
    if (saved && changed && !softiec_dos(0x11, workspace, 0, io, sizeof(io), &length, &more))
        error(SYSOUT_ULTIMATE_DOS_RESTORE_FAILED);
    if (!ok && !aborted) error(workspace + 832);
}
