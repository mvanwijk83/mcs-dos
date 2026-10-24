/* Legacy Software IEC directory rename compatibility. The original DOS target
 * avoids the IEC R command's erroneous directory type-extension suffix. */
#include "core.h"
#pragma code(softiec_code)
#pragma data(softiec_data)
static unsigned char softiec_files, softiec_drive_id;
unsigned long softiec_file_size;
unsigned char softiec_file_kind;
static unsigned char list_tried, list_saved, list_valid;

static unsigned char softiec_wait(unsigned char mask, unsigned char value)
{
    clock_t started = clock();
    while ((PEEK(ultimatebase) & mask) != value)
        if ((clock_t)(clock() - started) >= 2 * CLOCKS_PER_SEC) return 0;
    return 1;
}

/* Every MMIO byte is stored: unused reads can be removed by Oscar64. A reply
 * is acknowledged only after both FIFOs have been consumed. */
static unsigned char softiec_reply(unsigned char *data, unsigned int capacity,
                                  unsigned int *length, unsigned char *more)
{
    unsigned int n = 0;
    unsigned char s = 0, c;
    if (!softiec_wait(0x22, 0x20)) goto failed;
    *more = !!(PEEK(ultimatebase) & 0x10);
    while (PEEK(ultimatebase) & 128) {
        if (n == capacity) goto failed;
        data[n++] = PEEK(ultimatebase + 2);
    }
    *length = n;
    while (PEEK(ultimatebase) & 64) {
        if (s == sizeof(statusbuf) - 1) goto failed;
        c = PEEK(ultimatebase + 3);
        statusbuf[s++] = c;
    }
    statusbuf[s] = 0;
    POKE(ultimatebase, 2);
    if ((!s && *more) || (s >= 2 && statusbuf[0] == 48 && statusbuf[1] == 48)) return 1;
    if (!s) strcpy(statusbuf, SYSOUT_ULTIMATE_DOS_FAILED);
    return 0;
failed:
    POKE(ultimatebase, 4);
    strcpy(statusbuf, SYSOUT_ULTIMATE_DOS_FAILED);
    return 0;
}

/* DOS target 2 has a separate path from the Software IEC drive. Original
 * commands only: GET_PATH, CHANGE_DIR, OPEN_DIR, READ_DIR and RENAME_FILE. */
static unsigned char softiec_dos(unsigned char command, const char *first, const char *second,
                                unsigned char *data, unsigned int capacity,
                                unsigned int *length, unsigned char *more)
{
    const char *s;
    if (!softiec_wait(0xfd, 0)) {
        strcpy(statusbuf, SYSOUT_ULTIMATE_DOS_FAILED);
        return 0;
    }
    POKE(ultimatebase + 1, 2);
    POKE(ultimatebase + 1, command);
    if (command == 0x23 || command == 0x24) POKE(ultimatebase + 1, softiec_drive_id);
    s = first;
    if (s) do { POKE(ultimatebase + 1, *s); } while (*s++);
    s = second;
    if (s) do { POKE(ultimatebase + 1, *s); } while (*s++);
    POKE(ultimatebase, 1);
    if (!softiec_reply(data, capacity, length, more)) return 0;
    if (command != 0x14 && *more) {
        POKE(ultimatebase, 4);
        strcpy(statusbuf, SYSOUT_ULTIMATE_DOS_FAILED);
        return 0;
    }
    return 1;
}

static unsigned char softiec_hex(unsigned char c)
{
    if (c >= 48 && c <= 57) return c - 48;
    if (c >= 65 && c <= 70) return c - 55;
    if (c >= 97 && c <= 102) return c - 87;
    return 255;
}

/* Match the original firmware's FAT-to-IEC rendering: {hex} escapes, ASCII
 * upper case, sixteen displayed bytes, and the parser's trailing-space trim.
 * Enumerating actual names avoids guessing from truncated IEC aliases. */
static unsigned char softiec_matches(const unsigned char *native, unsigned int length, const char *name)
{
    char shown[17];
    unsigned int at = 0;
    unsigned char used = 0, escape = 0, c, h, l;
    /* IEC presents these as CBM types and omits their FAT suffix. */
    if (softiec_files && length >= 4 && native[length - 4] == 46) {
        c = native[length - 3] & 0x5f; h = native[length - 2] & 0x5f; l = native[length - 1] & 0x5f;
        if ((c == 80 && h == 82 && l == 71) || (c == 83 && h == 69 && l == 81) ||
            (c == 82 && h == 69 && l == 76) || (c == 85 && h == 83 && l == 82)) length -= 4;
    }
    while (at < length && used < 16) {
        c = native[at];
        if (c == 123) { escape = 1; if (++at == length) break; c = native[at]; }
        if (escape) {
            if (at + 1 == length) break;
            h = softiec_hex(native[at]); l = softiec_hex(native[at + 1]);
            if (h != 255 && l != 255) { shown[used++] = (h << 4) | l; at += 2; }
            else escape = 0;
        } else if (c == 125) { escape = 0; ++at; }
        else {
            shown[used++] = c >= 97 && c <= 122 ? c - 32 : c;
            ++at;
        }
    }
    while (used && shown[used - 1] == ' ') --used;
    shown[used] = 0;
    return !stricmp(shown, name);
}

/* workspace[512..767] receives the unique actual directory name. */
static unsigned char softiec_resolve(const char *name)
{
    unsigned int length;
    unsigned char more, found = 0, duplicate = 0;
    if (!softiec_dos(0x13, 0, 0, io, sizeof(io), &length, &more)) {
        if (statusbuf[0] == 48 && statusbuf[1] == 49) strcpy(statusbuf, SYSOUT_DIRECTORY_NOT_FOUND);
        return 0;
    }
    if (!softiec_dos(0x14, 0, 0, io, sizeof(io), &length, &more)) return 0;
    for (;;) {
        if (length > 1 && (!!(io[0] & 16) != !!softiec_files) && softiec_matches(io + 1, length - 1, name)) {
            if (found) duplicate = 1;
            else {
                memcpy(workspace + 512, io + 1, length - 1);
                workspace[512 + length - 1] = 0;
                found = 1;
            }
        }
        if (!more) break;
        if (stop()) { POKE(ultimatebase, 4); return 0; }
        if (!softiec_reply(io, sizeof(io), &length, &more)) return 0;
    }
    if (duplicate) strcpy(statusbuf, SYSOUT_AMBIGUOUS_DIRECTORY);
    else if (!found) strcpy(statusbuf, SYSOUT_DIRECTORY_NOT_FOUND);
    return found && !duplicate;
}

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
    if (saved && !softiec_dos(0x11, workspace, 0, io, sizeof(io), &length, &more)) ok = 0;
    return ok;
}

__noinline unsigned char bank_softiec_mount(const Path *p, unsigned char dev, unsigned char unmount)
{
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
