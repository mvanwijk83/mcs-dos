/* Compact locale records and calendar arithmetic. No CLDR parser runs on the C64. */
#include "core.h"
#pragma code(locale_code)
#pragma data(locale_data)

static unsigned char ascii_upper(unsigned char c)
{
    c &= 127;
    return c >= 97 && c <= 122 ? c - 32 : c;
}

static void iso_locale(void)
{
    locale.order = 2; locale.thousands = 0; locale.decimal = '.';
    locale.datesep = '-'; locale.timesep = ':'; locale.hours = 1;
    strcpy(locale_code, "iso");
}

/* Input is bounded and normalized to ASCII, independent of PETSCII case. */
static unsigned char locale_id(const char *s, char *out)
{
    unsigned char n = 0, c;
    while (*s) {
        c = ascii_upper(*s++);
        if (n == 6 || !((c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c == 45)) return 0;
        out[n++] = c;
    }
    out[n] = 0;
    return n == 2 || (n == 3 && out[0] == 73 && out[1] == 83 && out[2] == 79) ||
        ((n == 5 || n == 6) && out[2] == 45);
}

/* Return 0 on success, 1 missing file, 2 malformed file, 3 unknown selector.
 * Fixed 13-byte records: seven-byte ASCII/NUL identifier, six formatting bytes.
 * Header: MCN, version 1, record size 13, reserved 0, little-endian count. */
static unsigned char locale_load(const char *code, const char *file)
{
    Path source;
    unsigned char header[8], record[13], result = 2, i, status;
    unsigned int records;
    char id[7], request[24];
    iso_locale();
    if (!locale_id(code, id)) return 3;
    if (!file || !*file) {
        source.dev = 0; source.dir[0] = 0;
        filename("country.sys", source.name);
    } else if (!path(file, &source)) return 1;
    if (!source.name[0] || strpbrk(source.name, "*?")) return 1;
    if (!location_file(source.dev, source.dir)) return 1;
    snprintf(request, sizeof(request), "%s,r", source.name);
    if (channel_open(2, source.dev, 2, request)) {
        channel_close(2); return 1;
    }
    /* KERNAL OPEN can succeed while the drive reports FILE NOT FOUND. */
    if (source.dev) {
        status = diskstatus(source.dev, 0);
        if (status >= 20) {
            channel_close(2);
            return status == 62 || status == 74 || status == 255 ? 1 : 2;
        }
    }
    if (channel_read(2, header, 8) != 8 || header[0] != 77 || header[1] != 67 ||
        header[2] != 78 || header[3] != 1 || header[4] != 13 || header[5]) goto done;
    records = header[6] | ((unsigned int)header[7] << 8);
    if (!records || records > 512) goto done;
    while (records--) {
        if (channel_read(2, record, 13) != 13) goto done;
        if (!memchr(record, 0, 7)) goto done;
        if (strcmp((char *)record, id)) continue;
        if (record[7] > 2 || record[12] > 1) goto done;
        for (i = 8; i < 12; ++i)
            if ((record[i] < 32 || record[i] > 126) && !(i == 8 && !record[i])) goto done;
        if (record[10] != '-' && record[10] != '/' && record[10] != '.') goto done;
        if (record[11] != ':' && record[11] != '.') goto done;
        memcpy(&locale, record + 7, 6);
        strcpy(locale_code, id);
        result = 0; goto done;
    }
    result = 3;
done:
    channel_close(2);
    return result;
}

static void locale_error(unsigned char result)
{
    if (result) error(result == 1 ? SYSOUT_COUNTRY_NOT_FOUND :
                      result == 2 ? SYSOUT_INVALID_COUNTRY : SYSOUT_INVALID_LOCALE);
}

/* NLSFUNC [locale] [file], also accepting the traditional file-first form.
 * With no locale, retain the current selector; no file means cartridge COUNTRY.SYS. */
__noinline void bank_nlscmd(void)
{
    char code[7], trial[7];
    const char *file = 0;
    unsigned char i, have = 0;
    strcpy(code, locale_code);
    for (i = 1; i < argc; ++i) {
        if (locale_id(args[i], trial)) {
            if (have) { error(SYSOUT_INVALID_PARAM); return; }
            strcpy(code, trial); have = 1;
        } else if (!file) file = args[i];
        else { error(SYSOUT_INVALID_PARAM); return; }
    }
    locale_error(locale_load(code, file));
}

/* CONFIG.SYS stays on the cartridge. Preserve path spaces and case here;
 * the driver independently reads its legacy startup/printer directives. */
__noinline void bank_locale_startup(void)
{
    char text[128], country[128], clocksource[32], *s, *eq, *end;
    unsigned char c, used = 0, overflow = 0;
    int got;
    iso_locale();
    country[0] = clocksource[0] = 0;
    if (!skipautoexec && !resume_requested && !cart_open(2, 2, "config.sys,r")) {
        do {
            got = cart_read(2, &c, 1);
            if (got <= 0) c = 13;
            if (c == 13 || c == 10) {
                text[used] = 0;
                s = text; while (*s == ' ' || *s == 9) ++s;
                eq = strchr(s, '=');
                if (!overflow && eq) {
                    *eq++ = 0;
                    end = eq - 1;
                    while (end > s && (end[-1] == ' ' || end[-1] == 9)) *--end = 0;
                    while (*eq == ' ' || *eq == 9) ++eq;
                    end = eq + strlen(eq);
                    while (end > eq && (end[-1] == ' ' || end[-1] == 9)) *--end = 0;
                    if (!stricmp(s, "country")) strcpy(country, eq);
                    if (!stricmp(s, "clock") && strlen(eq) < sizeof(clocksource)) strcpy(clocksource, eq);
                }
                used = overflow = 0;
            } else if (used < 127) text[used++] = c;
            else overflow = 1;
        } while (got > 0);
    }
    channel_close(2);
    clock_config(clocksource);
    if (country[0]) {
        eq = strchr(country, ',');
        if (eq) {
            *eq++ = 0;
            while (*eq == ' ') ++eq;
            if (*eq == '"') { ++eq; end = strrchr(eq, '"'); if (end) *end = 0; }
        }
        end = country + strlen(country);
        while (end > country && end[-1] == ' ') *--end = 0;
        locale_error(locale_load(country, eq));
    }
}

static unsigned char leap(unsigned int year)
{
    return !(year % 4) && (year % 100 || !(year % 400));
}

__noinline unsigned char bank_datetime_valid(const DateTime *dt)
{
    static const unsigned char days[] = {31,28,31,30,31,30,31,31,30,31,30,31};
    unsigned char limit;
    if (dt->year < 1900 || dt->year > 2155 || !dt->month || dt->month > 12) return 0;
    limit = days[dt->month - 1];
    if (dt->month == 2 && leap(dt->year)) ++limit;
    return dt->day >= 1 && dt->day <= limit && dt->hour < 24 && dt->minute < 60 && dt->second < 60;
}

static unsigned int digits(const char *s, unsigned char n)
{
    unsigned int value = 0;
    while (n--) {
        if (*s < '0' || *s > '9') return 65535U;
        value = value * 10 + *s++ - '0';
    }
    return value;
}

__noinline unsigned char bank_date_parse(const char *s, DateTime *dt)
{
    unsigned int a, b, c;
    unsigned char ymd = locale.order == 2, first = ymd ? 4 : 2;
    if (strlen(s) != 10 || s[first] != locale.datesep || s[first + 3] != locale.datesep) return 0;
    a = digits(s, first); b = digits(s + first + 1, 2);
    c = digits(s + first + 4, ymd ? 2 : 4);
    if (a == 65535U || b == 65535U || c == 65535U) return 0;
    dt->year = ymd ? a : c;
    if (ymd) { dt->month = b; dt->day = c; }
    else if (locale.order) { dt->day = a; dt->month = b; }
    else { dt->month = a; dt->day = b; }
    return bank_datetime_valid(dt);
}

__noinline unsigned char bank_time_parse(const char *s, DateTime *dt)
{
    unsigned char n = strlen(s), suffix = !locale.hours, hour, minute, second = 0, ap = 0;
    unsigned int value;
    if (n != 5 + suffix && n != 8 + suffix) return 0;
    if (s[2] != locale.timesep) return 0;
    value = digits(s, 2); if (value > 23) return 0; hour = value;
    value = digits(s + 3, 2); if (value > 59) return 0; minute = value;
    if (n == 8 + suffix) {
        if (s[5] != locale.timesep) return 0;
        value = digits(s + 6, 2); if (value > 59) return 0; second = value;
    }
    if (suffix) {
        ap = ascii_upper(s[n - 1]);
        if ((ap != 65 && ap != 80) || !hour || hour > 12) return 0;
        hour = hour % 12 + (ap == 80 ? 12 : 0);
    }
    dt->hour = hour; dt->minute = minute; dt->second = second;
    return 1;
}

static void two(char *out, unsigned char value)
{
    out[0] = '0' + value / 10; out[1] = '0' + value % 10;
}

__noinline void bank_date_format(const DateTime *dt, char *out)
{
    char year[4];
    unsigned int value = dt->year;
    signed char i;
    for (i = 3; i >= 0; --i) { year[i] = '0' + value % 10; value /= 10; }
    if (locale.order == 2) {
        memcpy(out, year, 4); out[4] = locale.datesep;
        two(out + 5, dt->month); out[7] = locale.datesep; two(out + 8, dt->day);
    } else {
        two(out, locale.order ? dt->day : dt->month); out[2] = locale.datesep;
        two(out + 3, locale.order ? dt->month : dt->day); out[5] = locale.datesep;
        memcpy(out + 6, year, 4);
    }
    out[10] = 0;
}

__noinline void bank_time_format(const DateTime *dt, char *out)
{
    unsigned char hour = dt->hour;
    if (!locale.hours) { hour %= 12; if (!hour) hour = 12; }
    two(out, hour); out[2] = locale.timesep; two(out + 3, dt->minute);
    if (!locale.hours) { out[5] = dt->hour < 12 ? SYSOUT_TIME_AM : SYSOUT_TIME_PM; out[6] = 0; }
    else out[5] = 0;
}

/* CMD ASCII clock or long-directory stamp. Century interpretation: 1980..2079. */
__noinline unsigned char bank_cmd_datetime(const char *s, DateTime *dt, unsigned char seconds)
{
    unsigned char hour, ap;
    unsigned int y, m, d, h, min, sec;
    const char *time;
    if (strlen(s) < 17 || s[2] != '/' || s[5] != '/' || s[8] != ' ') return 0;
    m = digits(s, 2); d = digits(s + 3, 2); y = digits(s + 6, 2);
    /* Long SD2IEC directory rows pad the date/time gap to three spaces,
     * and some firmwares render midnight as 00 AM in directory stamps. */
    time = s + 8; while (*time == ' ') ++time;
    if (strlen(time) < (seconds ? 11 : 8) || (time[2] != ':' && time[2] != '.') ||
        (seconds && time[5] != ':' && time[5] != '.') ||
        time[seconds ? 8 : 5] != ' ' || ascii_upper(time[seconds ? 10 : 7]) != 77) return 0;
    h = digits(time, 2); min = digits(time + 3, 2);
    sec = seconds ? digits(time + 6, 2) : 0;
    ap = ascii_upper(time[seconds ? 9 : 6]);
    if (m > 12 || d > 31 || y > 99 || (seconds && !h) || h > 12 || min > 59 || sec > 59 ||
        (!h && ap != 65) ||
        (ap != 65 && ap != 80)) return 0;
    hour = h % 12 + (ap == 80 ? 12 : 0);
    dt->year = y < 80 ? 2000 + y : 1900 + y; dt->month = m; dt->day = d;
    dt->hour = hour; dt->minute = min; dt->second = sec;
    return bank_datetime_valid(dt);
}

/* Sakamoto's Gregorian weekday, 0=Sunday. Also needed when device DATE omits weekday. */
__noinline unsigned char bank_date_weekday(const DateTime *dt)
{
    static const unsigned char offsets[] = {0,3,2,5,0,3,5,1,4,6,2,4};
    unsigned int y = dt->year - (dt->month < 3);
    return (y + y / 4 - y / 100 + y / 400 + offsets[dt->month - 1] + dt->day) % 7;
}
