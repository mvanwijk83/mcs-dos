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

/* CMD and SD2IEC long timestamp listings, including directories. Older/native
 * image formats may return ordinary entries: those simply have no stamp. */
static unsigned char timestamp_iec(const char *name, DateTime *dt)
{
    char request[32], actual[17], *text = (char *)io;
    unsigned char address[4], c, n, used, quoted, i, row;
    unsigned char ok = 0;
    snprintf(request, sizeof(request), "$=t:%s=l", name);
    if (channel_open(6, p1.dev, 0, request)) { channel_close(6); return 0; }
    if (channel_read(6, address, 2) != 2) goto done;
    /* Header plus a matching entry; a few extra rows tolerate firmware filters. */
    for (row = 0; row < 8; ++row) {
        if (channel_read(6, address, 4) != 4) break;
        n = used = quoted = 0;
        do {
            if (channel_read(6, &c, 1) != 1) goto done;
            if (c == '"') quoted = !quoted;
            else if (quoted && used < 16) actual[used++] = c;
            if (n < 95) text[n++] = c;
            else goto done;
        } while (c);
        actual[used] = 0;
        while (used && (actual[used - 1] == ' ' || (unsigned char)actual[used - 1] == 160)) actual[--used] = 0;
        if (stricmp(actual, name)) continue;
        for (i = 0; i + 17 < n; ++i)
            if (text[i + 2] == '/' && text[i + 5] == '/' && cmd_datetime(text + i, dt, 0)) {
                ok = 1; goto done;
            }
    }
done:
    channel_close(6);
    return ok;
}

/* Emit only a timestamp suffix. Callers own filename/type columns and newline. */
__noinline void bank_file_timestamp(const char *name, unsigned char native)
{
    DateTime dt;
    unsigned char model, ok = 0;
    char date[11], time[7];
    if (!strcmp(name, ".") || !strcmp(name, "..") || !p1.dev) return;
    model = drivemodel(p1.dev, 0);
    if (model == DRIVE_SOFTIEC) ok = timestamp_ultimate(name, native, &dt);
    else if (model == DRIVE_SD2IEC || model == DRIVE_CMD_HD || model == DRIVE_CMD_FD)
        ok = timestamp_iec(name, &dt);
    if (!ok) return;
    date_format(&dt, date); time_format(&dt, time);
    print(SYSOUT_DIR_TIMESTAMP_SUFFIX, date, time);
}
