/* Bank-local legacy UCI DOS protocol helpers. Include after core.h and the
 * bank pragmas; each backend owns its own two small protocol flags. */
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
static void softiec_alias(const unsigned char *native, unsigned int length, char *shown)
{
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
}
static unsigned char softiec_matches(const unsigned char *native, unsigned int length, const char *name)
{
    char shown[17];
    softiec_alias(native, length, shown);
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
    if (duplicate) strcpy(statusbuf, softiec_files ? SYSOUT_AMBIGUOUS_FILE_NAME : SYSOUT_AMBIGUOUS_DIRECTORY);
    else if (!found) strcpy(statusbuf, SYSOUT_DIRECTORY_NOT_FOUND);
    return found && !duplicate;
}

