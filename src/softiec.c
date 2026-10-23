/* Legacy Software IEC directory rename compatibility. The original DOS target
 * avoids the IEC R command's erroneous directory type-extension suffix. */
#include "core.h"
#pragma code(host_code)
#pragma data(host_data)

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
        if (length > 1 && (io[0] & 16) && softiec_matches(io + 1, length - 1, name)) {
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
