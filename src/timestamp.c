/* Last-modification metadata is independent of the selected current-time source. */
#include "core.h"
#pragma code(timestamp_code)
#pragma data(timestamp_data)
static unsigned char softiec_drive_id, softiec_files;
#include "softiec-io.h"

static unsigned char timestamp_fat(const char *name, DateTime *dt)
{
    unsigned int length, date, time;
    unsigned char more;
    if (!softiec_dos(0x08, name, 0, io, sizeof(io), &length, &more) || length < 12 || more) return 0;
    date = io[4] | ((unsigned int)io[5] << 8);
    time = io[6] | ((unsigned int)io[7] << 8);
    dt->year = 1980 + (date >> 9); dt->month = (date >> 5) & 15; dt->day = date & 31;
    dt->hour = time >> 11; dt->minute = (time >> 5) & 63; dt->second = (time & 31) * 2;
    return datetime_valid(dt);
}

/* Resolve an IEC alias without changing any of DIR's workspace or sort buffers.
 * Duplicate aliases deliberately produce no stamp rather than another file's stamp. */
static unsigned char timestamp_resolve(const char *alias, char *native)
{
    unsigned int length;
    unsigned char more, found = 0;
    if (!softiec_dos(0x13, 0, 0, io, sizeof(io), &length, &more) ||
        !softiec_dos(0x14, 0, 0, io, sizeof(io), &length, &more)) return 0;
    for (;;) {
        if (length > 1 && softiec_matches(io + 1, length - 1, alias)) {
            if (found) found = 2;
            else { memcpy(native, io + 1, length - 1); native[length - 1] = 0; found = 1; }
        }
        if (!more) break;
        if (stop()) { POKE(ultimatebase, 4); return 0; }
        if (!softiec_reply(io, sizeof(io), &length, &more)) return 0;
    }
    return found == 1;
}

/* The FAT listing fast path has already selected DOS target 2's directory.
 * Other listings temporarily follow p1 and restore the original UCI path. */
static unsigned char timestamp_ultimate(const char *name, unsigned char native, DateTime *dt)
{
    char saved[512], resolved[256], part[17];
    const char *q;
    unsigned int length;
    unsigned char more, n, ok = 0;
    if (!ultimatebase) return 0;
    if (native) return timestamp_fat(name, dt);
    if (!softiec_dos(0x12, 0, 0, (unsigned char *)saved, sizeof(saved) - 1, &length, &more)) return 0;
    saved[length] = 0;
    if (!softiec_dos(0x11, "/", 0, io, sizeof(io), &length, &more)) goto done;
    q = p1.dir;
    while (*q) {
        n = 0;
        while (*q && (unsigned char)*q != 0x5c && n < 16) part[n++] = *q++;
        part[n] = 0;
        softiec_files = 0;
        if (!timestamp_resolve(part, resolved) ||
            !softiec_dos(0x11, resolved, 0, io, sizeof(io), &length, &more)) goto done;
        if (*q) ++q;
    }
    softiec_files = 1;
    if (timestamp_resolve(name, resolved)) ok = timestamp_fat(resolved, dt);
done:
    softiec_files = 0;
    if (!softiec_dos(0x11, saved, 0, io, sizeof(io), &length, &more)) ok = 0;
    return ok;
}

/* Decode one CMD/SD2IEC long directory line, retaining its own timestamp.
 * Ordinary entries from image formats remain valid but have no timestamp. */
__noinline unsigned char bank_timestamp_read(unsigned char lfn, struct DirectoryEntry *entry)
{
    unsigned char h[4], c, n = 0, used = 0, quoted = 0, seen = 0, t = 0, second = 0, i;
    char tail[64];
    entry->modified.year = 0;
    if (channel_read(lfn, h, 4) != 4) return 1;
    entry->size = h[2] | ((unsigned int)h[3] << 8);
    entry->remainder = h[0]; entry->type = CBM_T_OTHER; entry->access = CBM_A_RW;
    do {
        if (channel_read(lfn, &c, 1) != 1) return 1;
        if (c == '"') { quoted = !quoted; seen = 1; }
        else if (quoted) { if (used < 16) entry->name[used++] = c; }
        else if (seen && c) {
            if (n < sizeof(tail) - 1) tail[n++] = c;
            if (c == '<') entry->access = CBM_A_RO;
            else if (c != ' ' && c != '*') {
                if (!t) t = c;
                else if (!second) second = c;
            }
        }
    } while (c);
    tail[n] = 0;
    while (used && (entry->name[used - 1] == ' ' || (unsigned char)entry->name[used - 1] == 160)) --used;
    entry->name[used] = 0;
    if (!seen) return 2;
    if (t == 0x44) entry->type = second == 0x49 ? CBM_T_DIR : CBM_T_DEL;
    else if (t == 0x43) entry->type = CBM_T_CBM;
    else if (t == 0x50) entry->type = CBM_T_PRG;
    else if (t == 0x53) entry->type = CBM_T_SEQ;
    else if (t == 0x55) entry->type = CBM_T_USR;
    else if (t == 0x52) entry->type = CBM_T_REL;
    for (i = 0; i + 17 <= n; ++i)
        if (tail[i + 2] == '/' && tail[i + 5] == '/' && cmd_datetime(tail + i, &entry->modified, 0))
            return 0;
    entry->modified.year = 0;
    return 0;
}

/* CMD's cached/native directory path still obtains metadata by name. */
static unsigned char timestamp_iec(const char *name, DateTime *dt)
{
    char request[32];
    struct DirectoryEntry entry;
    unsigned char address[2], row, ok = 0;
    snprintf(request, sizeof(request), "$=t:%s=l", name);
    if (channel_open(6, p1.dev, 0, request)) { channel_close(6); return 0; }
    if (channel_read(6, address, 2) != 2) goto done;
    for (row = 0; row < 8; ++row) {
        if (bank_timestamp_read(6, &entry)) break;
        if (!stricmp(entry.name, name) && entry.modified.year) {
            *dt = entry.modified; ok = 1; break;
        }
    }
done:
    channel_close(6);
    return ok;
}

__noinline void bank_timestamp_print(const DateTime *dt)
{
    char date[11], time[7];
    if (!dt->year) return;
    date_format(dt, date); time_format(dt, time);
    print(SYSOUT_DIR_TIMESTAMP_SUFFIX, date, time);
}

/* Emit only a timestamp suffix. Callers own filename/type columns and newline. */
__noinline void bank_file_timestamp(const char *name, unsigned char native)
{
    DateTime dt;
    unsigned char model, ok = 0;
    if (!strcmp(name, ".") || !strcmp(name, "..") || !p1.dev) return;
    model = drivemodel(p1.dev, 0);
    if (model == DRIVE_SOFTIEC) ok = timestamp_ultimate(name, native, &dt);
    else if (model == DRIVE_SD2IEC || model == DRIVE_CMD_HD || model == DRIVE_CMD_FD)
        ok = timestamp_iec(name, &dt);
    if (!ok) return;
    bank_timestamp_print(&dt);
}
