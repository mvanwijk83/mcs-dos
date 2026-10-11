#include "core.h"
#pragma code(storage_code)
#pragma data(storage_data)
/* Read-only stock ROM identification: compressed DOS model strings have the
 * final digit's high bit set. Includes 1541-II and 1571CR. Never reset a drive:
 * DIR may be running with a redirected output file already open. Unknown ROMs
 * retain ordinary DOS file access, but cannot perform raw disk operations.
 *
 * Identify supported stock drive ROMs using fixed read-only fingerprints.
 *
 * dev: Disk device.
 * Return model ID or zero if unknown. */
unsigned char cbm_model(unsigned char dev)
{
    unsigned char lfn = statuschannel(dev), i;
    unsigned char probe[6] = {'m', '-', 'r', 0xc4, 0xe5, 4}, signature[4];
    if (!lfn)
        return 0;
    for (i = 0; i < 2; ++i) {
        POKE(144, 0);
        if (channel_write(lfn, probe, 6) != 6 || channel_read(lfn, signature, 4) != 4)
            break;
        if (signature[0] == '1' && signature[1] == '5') {
            if (!i && signature[2] == '4' && signature[3] == 0xb1) {
                /* Stock 1541-II: JMP opcode at $FF33 instead of TAX. */
                probe[3] = 0x33;
                probe[4] = 0xff;
                probe[5] = 1;
                POKE(144, 0);
                if (channel_write(lfn, probe, 6) == 6 && channel_read(lfn, signature, 1) == 1 &&
                    signature[0] == 0x4c)
                    return 4;
                return 1;
            }
            if (!i && signature[2] == '7') {
                if (signature[3] == 0xb0)
                    return 5; /* 1570 */
                if (signature[3] == 0xb1)
                    return 2; /* 1571 / 1571CR */
            }
            if (i && signature[2] == '8' && signature[3] == 0xb1)
                return 3;
        }
        probe[3] = 0xe7;
        probe[4] = 0xa6;
    }
    return 0;
}


/* Stock Commodore models map to three supported floppy geometries. */
unsigned char cbm_geometry(unsigned char model)
{
    return model == DRIVE_1541II || model == DRIVE_1570 ? 1 : model;
}

/* Only physical 1571 drives implement this mode-switch command. */
unsigned char cbm_mode(unsigned char dev, unsigned char model, unsigned char doublesided)
{
    return model != DRIVE_1571 || command(dev, doublesided ? "u0>m1" : "u0>m0");
}

#pragma code(code)
#pragma data(data)
