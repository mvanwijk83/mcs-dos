/* Storage dispatch is bank-local. Shared IEC file access remains in core;
 * each backend owns physical detection and medium-specific capabilities. */
#include "core.h"
#pragma code(storage_code)
#pragma data(storage_data)

/* An empty-name KERNAL OPEN creates a logical file even without a listener.
 * Complete LISTEN/SECOND/UNLISTEN before checking all serial error flags.
 * SECOND releases ATN; omitting it can mistake another listener for the target. */
__noinline unsigned char bank_drivepresent(unsigned char dev)
{
    POKE(144, 0);
    __asm {
        lda dev
        jsr $ffb1
        lda #$6f
        jsr $ff93
        jsr $ffae
    }
    return PEEK(144) == 0;
}

/* X? is SD2IEC's non-resetting extended version query. UI also identifies it,
 * but resets real CBM drives and would invalidate open file channels.
 * Check the text before M-R, which SD2IEC deliberately emulates for loaders.
 * https://github.com/rkrajnc/sd2iec/blob/master/README */
unsigned char sd_model(unsigned char dev)
{
    unsigned char lfn = statuschannel(dev), i;
    char response[64];
    int n;
    static const unsigned char sd[] = {83, 68, 50, 73, 69, 67};
    static const unsigned char ui[] = {85, 73, 69, 67};
    if (!lfn)
        return 0;
    POKE(144, 0);
    if (channel_write(lfn, "x?", 2) != 2)
        return 0;
    n = channel_read(lfn, response, 63);
    if (n < 7 || response[2] != ',' ||
        !((response[0] == '0' && response[1] == '9') ||
          (response[0] == '7' && response[1] == '3')))
        return 0;
    for (i = 0; i < 6 && i + 3 < n && ((response[i + 3] & 127) | 32) == (sd[i] | 32); ++i) {}
    if (i == 6 && i + 3 < n && response[i + 3] == ' ')
        return 1;
    for (i = 0; i < 4 && ((response[i + 3] & 127) | 32) == (ui[i] | 32); ++i) {}
    return i == 4 && i + 3 < n && response[i + 3] == ' ';
}

/* Read-only identification, never resetting or closing a live command channel.
 * The SYSINFO scanner separately avoids device 14 unless explicitly requested. */
__noinline unsigned char bank_drivemodel(unsigned char dev, unsigned char report)
{
    unsigned char model = 0;
    if (!dev) {
        if (report)
            error(SYSOUT_UNSUPPORTED_OP_CRT);
        return 0;
    }
    /* UCI's read-only SoftIEC bus ID identifies the virtual filesystem drive.
     * EasyFlash relocates UCI to IO1; never write either window to identify it. */
    if (ultimatebase && PEEK(ultimatebase + 1) == 0xc9 && PEEK(ultimatebase - 1) == dev)
        return DRIVE_SOFTIEC;
    if (sd_model(dev))
        return DRIVE_SD2IEC;
    model = cmd_model(dev);
    if (!model)
        model = cbm_model(dev);
    if (!model && report == 1)
        error(SYSOUT_UNSUPPORTED_DRIVE_TYPE);
    return model;
}

/* Query geometry afresh: CMD front-panel buttons can change partitions outside
 * the shell. report=128 retains the public physical-model query convention. */
__noinline unsigned char bank_drivetype(unsigned char dev, unsigned char report)
{
    unsigned char geometry;
    unsigned char model = bank_drivemodel(dev, report == 128 ? 0 : report);
    if (report == 128 || !model)
        return model;
    if (model >= DRIVE_SOFTIEC) {
        if (report)
            error(SYSOUT_UNSUPPORTED_DRIVE_TYPE);
        return 0;
    }
    if (model < DRIVE_CMD_HD)
        return cbm_geometry(model);
    cmd_geometry(dev, report, &geometry);
    return geometry;
}

/* A CMD emulation partition cannot be changed into another geometry by U0>M. */
__noinline unsigned char bank_drivemode(unsigned char dev, unsigned char doublesided)
{
    unsigned char geometry;
    unsigned char model = bank_drivemodel(dev, 1);
    if (!model)
        return 0;
    if (model >= DRIVE_SOFTIEC) {
        error(SYSOUT_UNSUPPORTED_DRIVE_TYPE);
        return 0;
    }
    if (model >= DRIVE_CMD_HD) {
        cmd_geometry(dev, 1, &geometry);
        if (geometry == 2 && doublesided)
            return 1;
        error(SYSOUT_INCOMPATIBLE_DRIVE);
        return 0;
    }
    return cbm_mode(dev, model, doublesided);
}

/* Parse an optional drive and exactly one operation; selection never changes
 * the shell's current drive. Partition zero is reserved for CMD system data. */
__noinline void bank_diskpartcmd(void)
{
    unsigned char i, device = 0, operation = 0, model;
    unsigned int number = 0;
    const char *digit;
    p1.dev = drive;
    p1.name[0] = 0;
    for (i = 1; i < argc; ++i) {
        if (!strchr(args[i], ':')) {
            if (operation)
                goto syntax;
            digit = args[i];
            if (*digit < '0' || *digit > '9')
                goto syntax;
            while (*digit >= '0' && *digit <= '9') {
                number = number * 10 + *digit++ - '0';
                if (number > 254)
                    goto syntax;
            }
            if (*digit || !number)
                goto syntax;
            operation = 2;
        } else {
            if (device || !strchr(args[i], ':') || !path(args[i], &p1) || p1.name[0])
                goto syntax;
            device = 1;
        }
    }
    model = bank_drivemodel(p1.dev, 1);
    if (!model)
        return;
    if (model >= DRIVE_SOFTIEC) {
        error(SYSOUT_UNSUPPORTED_DRIVE_TYPE);
        return;
    }
    if (model < DRIVE_CMD_HD) {
        error(SYSOUT_NO_PARTITIONS);
        return;
    }
    if (operation == 2) {
        if (model == DRIVE_CMD_FD && number > 31)
            goto syntax;
        if (cmd_select(p1.dev, (unsigned char)number))
            print(SYSOUT_PARTITION_SELECTED, (unsigned int)number, p1.dev);
    } else
        cmd_list(p1.dev);
    return;
syntax:
    error(SYSOUT_SYNTAX_DISKPART);
}

#pragma code(code)
#pragma data(data)
