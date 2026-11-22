/* Physical RTC access. Nothing here advances a staged initialization value. */
#include "core.h"
#pragma code(clock_code)
#pragma data(clock_data)
static unsigned char softiec_drive_id, softiec_files;
#include "softiec-io.h"
#define RTC_NONE 0
#define RTC_OK 1
#define RTC_UNSET 2
#define RTC_ERROR 3
#define RTC_DENIED 4
#define RTC_ULTIMATE 255
static unsigned char pendingparts, pendingdevice;
static DateTime pending;

static unsigned int clock_number(const unsigned char *s, unsigned char n)
{
    unsigned int v = 0;
    while (n--) {
        if (*s < 48 || *s > 57) return 65535U;
        v = v * 10 + *s++ - 48;
    }
    return v;
}

/* Read-only probing distinguishes unsupported commands from uninitialized RTCs. */
static unsigned char clock_read(unsigned char device, DateTime *dt)
{
    unsigned char more, lfn, n = 0, c;
    unsigned int length, v;
    if (device == RTC_ULTIMATE) {
        if (!ultimatebase) return RTC_NONE;
        if (!softiec_dos(0x26, 0, 0, io, sizeof(io), &length, &more)) return RTC_ERROR;
        if (length != 19 || more || io[4] != 47 || io[7] != 47 || io[10] != 32 ||
            io[13] != 58 || io[16] != 58) return RTC_ERROR;
        v = clock_number(io, 4); dt->year = v;
        v = clock_number(io + 5, 2); if (v > 12) return RTC_UNSET; dt->month = v;
        v = clock_number(io + 8, 2); if (v > 31) return RTC_UNSET; dt->day = v;
        v = clock_number(io + 11, 2); if (v > 23) return RTC_UNSET; dt->hour = v;
        v = clock_number(io + 14, 2); if (v > 59) return RTC_UNSET; dt->minute = v;
        v = clock_number(io + 17, 2); if (v > 59) return RTC_UNSET; dt->second = v;
        return datetime_valid(dt) ? RTC_OK : RTC_UNSET;
    }
    lfn = statuschannel(device);
    if (!lfn) return RTC_ERROR;
    if (channel_write(lfn, "t-ra\r", 5) != 5) return RTC_ERROR;
    do {
        if (channel_read(lfn, &c, 1) != 1) return RTC_ERROR;
        if (n == 63) return RTC_ERROR;
        statusbuf[n++] = c;
    } while (c != 13);
    statusbuf[n - 1] = 0;
    if (n > 3 && statusbuf[0] == '3' && statusbuf[2] == ',') {
        if (statusbuf[1] == '0') return RTC_NONE;
        if (statusbuf[1] == '1') return RTC_UNSET;
    }
    return n == 26 && cmd_datetime(statusbuf + 5, dt, 1) ? RTC_OK : RTC_ERROR;
}

__noinline void bank_clock_config(const char *value)
{
    char type[12], *comma, *end;
    unsigned int number = 0;
    unsigned char i = 0;
    pendingparts = clockkind = clockdevice = 0;
    while (*value == ' ') ++value;
    while (*value && *value != ',' && i < 11) type[i++] = *value++;
    type[i] = 0;
    while (i && type[i - 1] == ' ') type[--i] = 0;
    if (!stricmp(type, "ultimate")) clockkind = 1;
    else if (!stricmp(type, "sd2iec")) clockkind = 2;
    else if (!stricmp(type, "cmdhd")) clockkind = 3;
    else return;
    if (*value == ',') {
        number = strtoul(value + 1, &end, 10);
        while (*end == ' ') ++end;
        if (*end || number < 8 || number > 30 || clockkind == 1) { clockkind = 0; return; }
        clockdevice = number;
    } else if (*value) clockkind = 0;
}

static unsigned char clock_select(unsigned char explicit, unsigned char *device, DateTime *dt)
{
    unsigned char dev, model, result;
    if (explicit) {
        model = drivemodel(*device, 0);
        if (model == DRIVE_SOFTIEC) *device = RTC_ULTIMATE;
        else if (model != DRIVE_SD2IEC && model != DRIVE_CMD_HD && model != DRIVE_CMD_FD) return RTC_NONE;
        return clock_read(*device, dt);
    }
    if (clockkind == 1 || (!clockkind && ultimatebase)) {
        *device = RTC_ULTIMATE;
        result = clock_read(*device, dt);
        if (clockkind || result == RTC_OK || result == RTC_UNSET) return result;
    }
    for (dev = clockdevice ? clockdevice : 8; dev <= (clockdevice ? clockdevice : 30); ++dev) {
        model = drivemodel(dev, 0);
        if ((clockkind == 2 && model != DRIVE_SD2IEC) || (clockkind == 3 && model != DRIVE_CMD_HD)) continue;
        if (model != DRIVE_SD2IEC && model != DRIVE_CMD_HD && model != DRIVE_CMD_FD) continue;
        result = clock_read(dev, dt);
        if (result == RTC_OK || result == RTC_UNSET || clockdevice) { *device = dev; return result; }
    }
    return RTC_NONE;
}

static void clock_two(char *s, unsigned char value)
{
    s[0] = '0' + value / 10; s[1] = '0' + value % 10;
}

static unsigned char clock_write(unsigned char device, const DateTime *dt)
{
    unsigned char lfn, i, more;
    unsigned int length;
    char request[31];
    static const char weekdays[] = "sun.mon.tueswed.thurfri.sat.";
    if (!datetime_valid(dt)) return RTC_ERROR;
    if (device == RTC_ULTIMATE) {
        if (!softiec_wait(0xfd, 0)) return RTC_ERROR;
        POKE(ultimatebase + 1, 2); POKE(ultimatebase + 1, 0x27);
        POKE(ultimatebase + 1, dt->year - 1900);
        POKE(ultimatebase + 1, dt->month); POKE(ultimatebase + 1, dt->day);
        POKE(ultimatebase + 1, dt->hour); POKE(ultimatebase + 1, dt->minute);
        POKE(ultimatebase + 1, dt->second); POKE(ultimatebase, 1);
        if (softiec_reply(io, sizeof(io), &length, &more) && !more) return RTC_OK;
        return statusbuf[0] == 57 && statusbuf[1] == 56 ? RTC_DENIED : RTC_ERROR;
    }
    if (dt->year < 1980 || dt->year > 2079) return RTC_ERROR;
    strcpy(request, "t-wa");
    memcpy(request + 4, weekdays + date_weekday(dt) * 4, 4); request[8] = ' ';
    clock_two(request + 9, dt->month); request[11] = '/';
    clock_two(request + 12, dt->day); request[14] = '/';
    clock_two(request + 15, dt->year % 100); request[17] = ' ';
    clock_two(request + 18, dt->hour % 12 ? dt->hour % 12 : 12); request[20] = ':';
    clock_two(request + 21, dt->minute); request[23] = ':';
    clock_two(request + 24, dt->second); request[26] = ' ';
    request[27] = dt->hour < 12 ? 'a' : 'p'; request[28] = 'm'; request[29] = 13;
    lfn = statuschannel(device);
    if (!lfn || channel_write(lfn, request, 30) != 30) return RTC_ERROR;
    i = 0;
    do {
        if (channel_read(lfn, request + i, 1) != 1) return RTC_ERROR;
    } while (request[i++] != 13 && i < 30);
    return i >= 3 && request[0] == '0' && request[1] == '0' ? RTC_OK : RTC_ERROR;
}

static void clock_error(unsigned char result)
{
    error(result == RTC_NONE ? SYSOUT_NO_CLOCK_DEVICE : result == RTC_UNSET ? SYSOUT_CLOCK_NOT_SET :
          result == RTC_DENIED ? SYSOUT_CANNOT_SET_CLOCK : SYSOUT_CLOCK_DEVICE_ERROR);
}

/* Use CLOCK directive notation; retain a requested number, but do not invent
 * one for automatic type selection. SoftIEC aliases name the shared Ultimate. */
static void clock_device(unsigned char device, unsigned char explicit, char *out)
{
    unsigned char model = device == RTC_ULTIMATE ? DRIVE_SOFTIEC : drivemodel(device, 0);
    const char *name = model == DRIVE_SOFTIEC ? SYSOUT_CLOCK_ULTIMATE :
        model == DRIVE_SD2IEC ? SYSOUT_CLOCK_SD2IEC : SYSOUT_CLOCK_CMDHD;
    if (device != RTC_ULTIMATE && (explicit || clockdevice))
        snprintf(out, 13, SYSOUT_CLOCK_SOURCE_NUMBER, name, device);
    else strcpy(out, name);
}

/* DATE/TIME bypass generic slash tokenization because dates can contain '/'. */
__noinline void bank_clockcmd(unsigned char time, const char *tail)
{
    DateTime current, entered;
    unsigned char device = 0, explicit = 0, result, bit = time ? 2 : 1, display = 0, only = 0;
    char value[128], shown[12], pattern[16], source[13], *s, *end, *argument = 0, *option;
    Path target;
    if (strlen(tail) >= sizeof(value)) { error(SYSOUT_INVALID_PARAM); return; }
    strcpy(value, tail); s = value;
    /* Split on spaces only: embedded date slashes and time colons are data.
     * Switches can precede/follow operands and may be joined as /D/T. */
    while (*s) {
        while (*s == ' ') ++s;
        if (!*s) break;
        end = s; while (*end && *end != ' ') ++end;
        if (*end) *end++ = 0;
        if (*s == '/') {
            option = s;
            while (*option) {
                if (*option++ != '/') { error(SYSOUT_INVALID_PARAM); return; }
                if (toupper(*option) == 'D') display = 1;
                else if (toupper(*option) == 'T') only = 1;
                else { error(SYSOUT_INVALID_PARAM); return; }
                ++option;
            }
        } else if (s[strlen(s) - 1] == ':') {
            if (explicit) { error(SYSOUT_INVALID_PARAM); return; }
            if (!path(s, &target) || target.name[0]) return;
            device = target.dev; explicit = 1;
        } else {
            if (argument) { error(SYSOUT_INVALID_PARAM); return; }
            argument = s;
        }
        s = end;
    }
    if (only && argument) { error(SYSOUT_INVALID_PARAM); return; }
    if (argument) s = argument;
    else { s = value; *s = 0; }
    result = clock_select(explicit, &device, &current);
    if (display && result == RTC_NONE) { say(SYSOUT_NO_CLOCK_AVAILABLE); return; }
    if (result != RTC_OK && result != RTC_UNSET) { clock_error(result); return; }
    if (display) clock_device(device, explicit, source);
    if (only) {
        if (result != RTC_OK) { clock_error(result); return; }
        if (time) time_format(&current, shown); else date_format(&current, shown);
        if (display) { print(SYSOUT_CLOCK_VALUE_DEVICE, shown, source); newline(); }
        else say(shown);
        return;
    }
    if (display) {
        print(SYSOUT_CLOCK_DEVICE, source); newline();
    }
    if (!*s) {
        if (result == RTC_OK) {
            if (time) time_format(&current, shown); else date_format(&current, shown);
            print(time ? SYSOUT_CURRENT_TIME : SYSOUT_CURRENT_DATE, shown); newline();
        } else say(SYSOUT_CLOCK_NOT_SET);
        if (time) {
            strcpy(pattern, SYSOUT_TIME_PATTERN); pattern[2] = pattern[6] = locale.timesep;
            if (!locale.hours) strcat(pattern, SYSOUT_TIME_PERIOD_HINT);
        } else {
            strcpy(pattern, locale.order == 2 ? SYSOUT_DATE_PATTERN_YMD : locale.order ? SYSOUT_DATE_PATTERN_DMY : SYSOUT_DATE_PATTERN_MDY);
            if (locale.order == 2) pattern[4] = pattern[7] = locale.datesep;
            else pattern[2] = pattern[5] = locale.datesep;
        }
        print(time ? SYSOUT_ENTER_TIME : SYSOUT_ENTER_DATE, pattern);
        if (!input(value, sizeof(value), 0)) { pendingparts = 0; return; }
        s = value; if (!*s) return;
    }
    memset(&entered, 0, sizeof(entered)); entered.year = 2000; entered.month = entered.day = 1;
    if (!(time ? time_parse(s, &entered) : date_parse(s, &entered))) {
        error(time ? SYSOUT_INVALID_TIME : SYSOUT_INVALID_DATE); return;
    }
    if (!time && device != RTC_ULTIMATE && (entered.year < 1980 || entered.year > 2079)) {
        error(SYSOUT_INVALID_DATE); return;
    }
    /* Read preserved fields only after interactive input and its validation. */
    result = clock_read(device, &current);
    if (result != RTC_OK && result != RTC_UNSET) { clock_error(result); return; }
    if (result == RTC_UNSET) {
        if (pendingparts && pendingdevice != device) pendingparts = 0;
        pendingdevice = device;
        current = pending;
    } else pendingparts = 0;
    if (time) { current.hour = entered.hour; current.minute = entered.minute; current.second = entered.second; }
    else { current.year = entered.year; current.month = entered.month; current.day = entered.day; }
    if (result == RTC_UNSET) {
        pending = current; pendingparts |= bit;
        if (pendingparts != 3) {
            say(time ? SYSOUT_INIT_CLOCK_DATE : SYSOUT_INIT_CLOCK_TIME); return;
        }
    }
    result = clock_write(device, &current);
    if (result != RTC_OK) clock_error(result);
    else pendingparts = 0;
}
