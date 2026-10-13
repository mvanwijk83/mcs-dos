// Exercise the production UCI transport and report against a register-level fake.
const fs = require('fs'), {functions} = require('./source');
require('./setup');
const harness = `

static unsigned char io[256], mode, pushed, commands[3], commandcount;
static unsigned char replypos, statuspos, polls, control, writes, id, revision = 3;
static unsigned char c128, vdc, rasterreads;
static unsigned char mega, unlocked, key, sprite = 17, palette = 23;
static unsigned int window;
static unsigned long ticks;
static const char *reply, *status;
static char output[1024];
typedef long clock_t;
#define CLOCKS_PER_SEC 60

/* Advance a deterministic clock so polling and timeout tests do not depend on wall time. */
static clock_t clock(void)
{
    return ticks++;
}

/* Return synthetic register values for the selected hardware-query scenario.
 *
 * a: Register address to query. */
static unsigned char peek(unsigned int a)
{
    if (a >= 0xde1c && a <= 0xde1f) {
        if (window != 0xde1c)
            return 255;
        a += 256;
    } else if (a >= 0xdf1c && a <= 0xdf1f && window != 0xdf1c)
        return 0;
    if (a == 0xdf1d)
        return mode == 1 ? id : mode == 0 ? 255 : 201;
    if (a == 0xdf1c) {
        if (mode == 1)
            return 0;
        if (mode == 4)
            return 16;
        if (!pushed)
            return mode == 8 ? 2 : 0;
        if (mode == 10)
            return 1;
        if (mode == 9 && polls++ < 3)
            return 1;
        if (mode == 3 || polls++ < 3)
            return 16;
        return (mode == 7 ? 48 : 32) | (reply[replypos] ? 128 : 0) | (status[statuspos] ? 64 : 0);
    }
    if (a == 0xdf1e)
        return reply[replypos++];
    if (a == 0xdf1f)
        return status[statuspos++];
    if (a == 0xd02f)
        return c128 ? 248 : 255;
    if (a == 0xd000)
        return sprite;
    if (a == 0xd100)
        return mega && unlocked ? palette : sprite;
    if (a == 0xd600)
        return 128 | vdc;
    if (a == 0xd011)
        return rasterreads++ < 2 ? 128 : 0;
    if (a == 0xd012)
        return 50;
    if (a == 0xff80)
        return revision;
    if (a >= 0xd000)
        return 0;
    return *(unsigned char *)a;
}

/* Apply a register write to the synthetic hardware state and record its effects.
 *
 * a: Register address to write.
 * value: Byte to write into simulated hardware state. */
static void poke(unsigned int a, unsigned char value)
{
    if (a == 0xd02f) {
        unlocked = (mega == 4 && key == 0x47 && value == 0x53) ||
                   (mega >= 3 && key == 0xa5 && value == 0x96);
        key = value;
    }
    if (a == 0xd100) {
        if (mega && unlocked)
            palette = value;
        else
            sprite = value;
    }
    if (a >= 0xde1c && a <= 0xde1f) {
        if (window != 0xde1c)
            return;
        a += 256;
    }
    if (a == 0xdf1d) {
        ++writes;
        if (mode == 1)
            id = value;
        else if (commandcount < 3)
            commands[commandcount++] = value;
    }
    if (a == 0xdf1c) {
        ++writes;
        control = value;
        if (value == 1)
            pushed = 1;
        else
            pushed = 0;
    }
}

#define PEEK(a) peek(a)
#define POKE(a, v) poke(a, v)
#define VICPEEK(a) peek(a)
#define VICPOKE(a, v) poke(a, v)

/* Model the assembly bus operations; image tests verify their compiled order. */
static unsigned char vicalias(unsigned char first, unsigned char second)
{
    unsigned char saved = peek(0xd000), color, observed;
    poke(0xd02f, first);
    poke(0xd02f, second);
    color = peek(0xd100);
    poke(0xd100, saved ^ 255);
    observed = peek(0xd000);
    poke(0xd100, color);
    poke(0xd02f, 0);
    poke(0xd02f, 0);
    return observed == saved;
}
static unsigned int ultimatebase;
${functions('romtext', 'romcode', 'kernalname', 'ultimate', 'victype')}
/* Provide the newline hook; fixtures capture it when text layout is under test. */
static void newline(void)
{
    strcat(output, "\\n");
}

/* Provide the line-output hook; the fixture captures text when report layout is under test.
 *
 * s: Line text supplied by the production handler. */
static void say(const char *s)
{
    strcat(output, s);
    newline();
}

/* Format the supplied values into captured output for independent report comparisons.
 *
 * fmt: Printf-style format string.
 * ...: Values consumed by the format string. */
static void print(const char *fmt, ...)
{
    va_list args;
    va_start(args, fmt);
    vsnprintf(output + strlen(output), sizeof(output) - strlen(output), fmt, args);
    va_end(args);
}

/* Return a synthetic status-channel handle without opening a drive.
 *
 * dev: Synthetic device identifier. */
static unsigned char drivefixture, probes14, letters;
static unsigned char dosdrives(void) { return letters; }
static const char *drivename(unsigned char dev) {
    static char text[4];
    if (letters) { text[0] = 'A' + dev - 8; text[1] = 0; }
    else snprintf(text, sizeof(text), "%u", dev);
    return text;
}
static unsigned char drivepresent(unsigned char dev)
{
    return drivefixture && (dev == 12 || dev == 14 || dev == 30 || (drivefixture == 2 && dev == 29));
}

/* Provide the synthetic drive family needed by this isolated test.
 *
 * dev: Device identifier.
 * report: Whether the caller requests an error report. */
static unsigned char drivemodel(unsigned char dev, unsigned char report)
{
    if (dev == 14)
        ++probes14;
    return dev == 12 ? DRIVE_CMD_HD : dev == 30 ? DRIVE_SOFTIEC : dev == 29 ? DRIVE_SD2IEC : DRIVE_1541;
}

${functions('sysinfo')}
/* Reset observable state and load fixture inputs before an independent case.
 *
 * m: Simulated interface behavior, including busy and error states.
 * r: Bytes returned by the simulated command response.
 * s: Bytes returned by the simulated status response. */
static void reset(unsigned char m, const char *r, const char *s)
{
    mode = m;
    reply = r;
    status = s;
    pushed = commandcount = replypos = statuspos = polls = control = writes = rasterreads = 0;
    id = 201;
    ticks = 250; /* Also exercise the bounded wait across the low-byte wrap. */
    window = 0xdf1c;
    memset(io, 0xa5, sizeof(io));
    output[0] = 0;
}

/* Compare the current fixture result with its expected output or state.
 *
 * r: Hardware identification response to test.
 * expected: Expected board name, or null if identification should fail. */
static unsigned char check(const char *r, const char *expected)
{
    const char *actual;
    reset(2, r, "00,OK");
    actual = ultimate();
    if (expected ? (!actual || strcmp(actual, expected)) : actual != 0)
        return 1;
    if (control != (strlen(r) >= 20 ? 4 : 2) || commandcount != 3 || commands[0] != 4 ||
        commands[1] != 40 || commands[2] != 0)
        return 2;
    if (io[21] != 0xa5)
        return 3;
    return 0;
}

/* Run the independent fixture cases; failure results identify the violated invariant. */
int main(void)
{
    if (check("Ultimate 64", "Ultimate 64"))
        return 1;
    if (check("Ultimate 64 Elite", "Ultimate 64 Elite"))
        return 2;
    if (check("Ultimate 64-II", "Ultimate 64 Elite-II"))
        return 3;
    if (check("C64 Ultimate", "Commodore 64 Ultimate"))
        return 4;
    if (check("ULTIMATE 64", "Ultimate 64") || check("c64 ultimate", "Commodore 64 Ultimate"))
        return 5;
    if (check("Ultimate II", 0) || check("Ultimate II+", 0) || check("Ultimate II+L", 0) ||
        check("Ultimate", 0))
        return 6;
    if (check("Ultimate 64 future", 0) || check("Ultimate 64 Elite-II", 0) ||
        check("C64 Ultimate!", 0))
        return 7;
    if (check("", 0) || check("Ultimate 64 Elite with a longer name", 0))
        return 8;
    reset(0, "Ultimate 64", "00,OK");
    if (ultimate() || writes)
        return 9;
    reset(1, "Ultimate 64", "00,OK");
    if (ultimate() || id != 201 || writes != 2 || control)
        return 10;
    reset(4, "Ultimate 64", "00,OK");
    if (ultimate() || writes)
        return 11;
    reset(3, "Ultimate 64", "00,OK");
    if (ultimate() || control != 4 || ticks > 300)
        return 12;
    reset(7, "Ultimate 64", "00,OK");
    if (ultimate() || control != 4)
        return 13;
    reset(2, "Ultimate 64", "21,UNKNOWN COMMAND");
    if (ultimate() || control != 4)
        return 14;
    reset(2, "Ultimate 64", "");
    if (ultimate() || control != 4)
        return 15;
    reset(2, "Ultimate 64", "00,OK EXTRA");
    if (ultimate() || control != 4)
        return 16;
    reset(2, "Ultimate 64", "00,O");
    if (ultimate() || control != 4)
        return 17;
    reset(2, "C64 Ultimate", "00,OK");
    revision = 67;
    c128 = 1;
    vdc = 2;
    sysinfo(0);
    if (!strstr(output, "Commodore 64 personal computer\\n64 KB RAM") ||
        !strstr(output, "CPU:      MOS 6510 (FPGA)\\nBoard:    Commodore 64 Ultimate\\nKERNAL:") ||
        strstr(output, "portable"))
        return 18;
    reset(2, "Ultimate II+", "00,OK");
    revision = 3;
    c128 = 1;
    vdc = 2;
    sysinfo(0);
    if (!strstr(output, "Commodore 128DCR personal computer\\n128 KB RAM") ||
        !strstr(output, "CPU:      MOS 8502") ||
        !strstr(output, "Video:    VIC-II E (PAL)") || strstr(output, "Board:"))
        return 19;
    reset(0, "", "");
    c128 = 1;
    vdc = 0;
    sysinfo(0);
    if (!strstr(output, "Commodore 128 personal computer") ||
        !strstr(output, "Video:    VIC-II E (PAL)"))
        return 36;
    reset(0, "", "00,OK");
    c128 = 0;
    revision = 67;
    sysinfo(0);
    if (!strstr(output, "Commodore SX-64 portable computer"))
        return 20;
    reset(8, "ULTIMATE 64", "00,OK");
    revision = 3;
    c128 = 0;
    sysinfo(0);
    if (!strstr(output, "CPU:      MOS 6510 (FPGA)") || !strstr(output, "Board:    Ultimate 64"))
        return 21;
    reset(9, "ULTIMATE 64", "00,OK");
    if (!ultimate() || control != 2)
        return 22;
    reset(10, "ULTIMATE 64", "00,OK");
    if (ultimate() || control != 4 || ticks > 300)
        return 23;
    reset(2, "ULTIMATE 64", "00,OK");
    window = 0xde1c;
    revision = 3;
    c128 = 0;
    sysinfo(0);
    if (!strstr(output, "CPU:      MOS 6510 (FPGA)") || !strstr(output, "Board:    Ultimate 64"))
        return 24;
    if (control != 2 || commandcount != 3)
        return 25;
    reset(1, "ULTIMATE 64", "00,OK");
    window = 0xde1c;
    if (ultimate() || id != 201 || writes != 2)
        return 26;
    reset(4, "ULTIMATE 64", "00,OK");
    window = 0xde1c;
    if (ultimate() || writes)
        return 27;
    reset(0, "", "");
    drivefixture = 1;
    sysinfo(0);
    if (!strstr(output, "Drive 12: CMD HD") || !strstr(output, "Drive 30: SoftIEC Drive") ||
        !strstr(output, "Drive 14: Unknown device") || probes14)
        return 28;
    output[0] = 0;
    sysinfo(1);
    if (!strstr(output, "Drive 14: 1541") || probes14 != 1)
        return 29;
    letters = 1;
    output[0] = 0;
    sysinfo(0);
    if (!strstr(output, "Drive E:  CMD HD") || !strstr(output, "Drive W:  SoftIEC Drive") ||
        !strstr(output, "Drive G:  Unknown device"))
        return 34;
    letters = 0;
    drivefixture = 2;
    output[0] = 0;
    sysinfo(0);
    if (!strstr(output, "Drive 29: SD2IEC Drive\\nDrive 30: SoftIEC Drive"))
        return 35;
    drivefixture = 0;
    reset(0, "", "");
    mega = 4;
    sysinfo(0);
    if (!strstr(output, "CPU:      45GS02 (FPGA)\\nKERNAL:   Revision 3\\nVideo:    VIC-IV (PAL)") ||
        !strstr(output, "MEGA65 personal computer\\n64 KB RAM") || strstr(output, "Board:") ||
        sprite != 17 || palette != 23 || unlocked || key)
        return 30;
    reset(0, "", "");
    mega = 3;
    sysinfo(0);
    if (!strstr(output, "Commodore 65 personal computer\\n128 KB RAM") ||
        !strstr(output, "CPU:      CSG 4510\\nKERNAL:   Revision 3\\nVideo:    VIC-III (PAL)") ||
        strstr(output, "Board:") || sprite != 17 || palette != 23 || unlocked || key)
        return 32;
    mega = 0;
    reset(0, "", "");
    sysinfo(0);
    if (strstr(output, "Board:") || !strstr(output, "CPU:      MOS 6510/8500") ||
        !strstr(output, "KERNAL:   Revision 3\\nVideo:    VIC-II (PAL)") || strstr(output, "display mode") ||
        sprite != 17 || unlocked || key)
        return 31;
    return 0;
}
`;
fs.writeFileSync('build/test-ultimate-models.c', harness);
require('./simulator')('build/test-ultimate-models.c');
console.log(
    'PASS Ultimate Board, MEGA65/C65 models and video, VIC-IV-before-III unlock/alias/restoration, classic fallback and UCI transport');
