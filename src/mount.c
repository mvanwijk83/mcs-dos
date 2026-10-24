/* Explicit media changes. The physical selection cache never owns a mount. */
#include "core.h"
MountRecord mounts[MOUNT_COUNT];
char mount_hostdir[128];
unsigned char mount_bypass;
static unsigned char sd_ready;

/* Image kinds describe names, independently of the underlying CBM file type. */
unsigned char imagekind(const char *name)
{
    static const char *const extensions[] = {"D64","D71","D81","DNP","G64","G71","DHD","D41"};
    const char *dot = strrchr(name, '.');
    unsigned char i, j, c;
    /* UCI supplies ASCII FAT names, independently of the shell's PETSCII
     * character map. Do not pass those bytes through PETSCII toupper(). */
    if (dot && strlen(dot + 1) == 3) for (i = 0; i < 8; ++i) {
        for (j = 0; j < 3; ++j) {
            c = (unsigned char)dot[j + 1] & 127;
            if (c >= 97 && c <= 122) c -= 32;
            if (c != ((unsigned char)extensions[i][j] & 127)) break;
        }
        if (j == 3) return i + 1;
    }
    return 0;
}
const char *imageformat(unsigned char kind)
{
    static const char *const extensions[] = {"D64","D71","D81","DNP","G64","G71","DHD","D41"};
    return extensions[kind - 1];
}
const char *imagetype(const char *name, unsigned char type)
{
    unsigned char kind = type == CBM_T_DIR || type == CBM_T_CBM ? 0 : imagekind(name);
    return kind ? imageformat(kind) : typename(type);
}
unsigned char mount_active(unsigned char dev)
{
    return dev && !mount_bypass && mounts[0].dev == dev;
}
unsigned char mount_geometry(unsigned char dev)
{
    unsigned char type = mount_active(dev) ? mounts[0].type : 0;
    return type <= 3 ? type : type == 8 ? 1 : 0;
}
void mount_invalidate(void) { sd_ready = 0; }
void mount_reset(void)
{
    memset(mounts, 0, sizeof(mounts)); mount_hostdir[0] = 0; mount_bypass = sd_ready = 0;
}

#pragma code(mount_code)
#pragma data(mount_data)
static unsigned char image_entry(unsigned char dev, const char *name, unsigned char directory);

static void close_media(void)
{
    channel_close(2); channel_close(3); channel_close(4); channel_close(6);
}
static unsigned char sd_leave(unsigned char dev)
{
    char parent[5] = {67,68,58,95,0};
    close_media(); sd_ready = 0;
    return command(dev, "cd//") && command(dev, parent);
}
static unsigned char sd_insert(const MountRecord *record)
{
    unsigned char ok;
    char request[24];
    if (!sd_leave(record->dev)) return 0;
    mount_bypass = 1;
    ok = host_select(record->source, record->dir, DRIVE_SD2IEC);
    mount_bypass = 0;
    if (!ok) return 0;
    if (!image_entry(record->dev, record->name, 0)) return 0;
    snprintf(request, sizeof(request), "cd:%s", record->name);
    if (!command(record->dev, request)) return 0;
    sd_ready = 1;
    return 1;
}
/* Never pass a file to CD while walking the inside of an image. */
static unsigned char image_entry(unsigned char dev, const char *name, unsigned char directory)
{
    struct DirectoryEntry entry;
    unsigned char found = 0;
    if (directory_open(6, dev)) { channel_close(6); return 0; }
    channel_buffer(6, 1);
    if (!directory_read(6, &entry)) while (!directory_read(6, &entry))
        if (!strcmp(entry.name, name)) {
            found = directory ? entry.type == CBM_T_DIR : entry.type != CBM_T_DIR && entry.type != CBM_T_CBM;
            break;
        }
    channel_close(6);
    return found;
}
__noinline unsigned char bank_mount_select(unsigned char dev, const char *dir)
{
    char component[17], request[24];
    unsigned char n;
    if (!sd_ready && !sd_insert(&mounts[0])) return 0;
    if (!command(dev, "cd//")) return 0;
    while (*dir) {
        n = 0;
        while (*dir && (unsigned char)*dir != 0x5c && n < 16) component[n++] = *dir++;
        component[n] = 0;
        if (!image_entry(dev, component, 1)) { error(SYSOUT_DIRECTORY_NOT_FOUND); return 0; }
        snprintf(request, sizeof(request), "cd:%s", component);
        if (!command(dev, request)) return 0;
        if (*dir) ++dir;
    }
    return 1;
}
/* A mounted image remains a file, but cannot be modified or used as a
 * directory target through its host pathname while the drive owns it. */
__noinline unsigned char bank_mount_guard(const Path *p)
{
    unsigned char i;
    for (i = 0; i < MOUNT_COUNT; ++i)
        /* SD2IEC paths now address the image, never the hidden host. An
         * identical spelling inside it must remain an ordinary file. */
        if ((i || !mount_active(p->dev)) && mounts[i].dev && mounts[i].source == p->dev &&
            !stricmp(mounts[i].dir, p->dir) && !stricmp(mounts[i].name, p->name)) {
            error(SYSOUT_MOUNT_IN_USE); return 0;
        }
    return 1;
}
static unsigned char target_device(const char *text, unsigned char *dev)
{
    Path p;
    unsigned int size = strlen(text);
    if (!size || size > 3 || text[size - 1] != ':' || !path(text, &p) || p.name[0]) return 0;
    *dev = p.dev; return p.dev != 0;
}
/* This prompt is complete text; yesno() would append its own DOS suffix. */
static unsigned char mount_confirm(void)
{
    unsigned char c;
    outs(SYSOUT_REPLACE_MOUNT); outc(' ');
    do { c = getch(); } while (toupper(c) != 'Y' && toupper(c) != 'N' && c != CH_STOP);
    if (c == CH_STOP) c = 'N';
    outc(toupper(c)); newline();
    return toupper(c) == 'Y';
}
__noinline void bank_mountcmd(unsigned char unmount)
{
    /* Commands are serialized. Keep transaction snapshots out of the small
     * C64 software stack while path and IEC services make nested bank calls. */
    static MountRecord previous, next;
    static char cwd[128];
    char shown[17];
    unsigned char dev = drive, model, slot, kind, ok = 0, oldquiet = optionalheader;
    if (argc < (unmount ? 1 : 2) || argc > (unmount ? 2 : 3)) goto syntax;
    if (!unmount) {
        const char *leaf = strrchr(args[1], 0x5c);
        if (!leaf) leaf = strchr(args[1], ':');
        strncpy(shown, leaf ? leaf + 1 : args[1], 16); shown[16] = 0;
        uppername(shown, shown);
    }
    if (argc == (unmount ? 2 : 3) && !target_device(args[argc - 1], &dev)) goto syntax;
    if (redirected && outputpath.dev == dev) goto unavailable;
    model = drivemodel(dev, 0);
    if (model == DRIVE_SD2IEC) {
        if (dev != drive || (mounts[0].dev && mounts[0].dev != dev)) {
            goto unavailable;
        }
        slot = 0;
    } else {
        if (!ultimate_drive(dev)) goto unavailable;
        slot = mounts[1].dev == dev ? 1 : mounts[2].dev == dev ? 2 : !mounts[1].dev ? 1 : 2;
    }
    previous = mounts[slot];
    if (unmount) {
        optionalheader = 1;
        ok = model == DRIVE_SD2IEC ? sd_leave(dev) : softiec_mount(0, dev, 1);
        optionalheader = oldquiet;
        if (ok) {
            mounts[slot].dev = 0;
            if (model == DRIVE_SD2IEC && previous.dev) strcpy(working[location_index(dev)], mount_hostdir);
            else working[location_index(dev)][0] = 0;
            nav_invalidate(); print(SYSOUT_UNMOUNTED, drivename(dev));
        } else print(SYSOUT_CANNOT_UNMOUNT, drivename(dev));
        return;
    }
    /* Only MOUNT resolves a replacement relative to the hidden host directory. */
    strcpy(cwd, working[location_index(dev)]);
    if (model == DRIVE_SD2IEC && previous.dev) {
        strcpy(working[location_index(dev)], mount_hostdir); mount_bypass = 1;
    }
    optionalheader = 1;
    ok = path(args[1], &p1);
    mount_bypass = 0;
    strcpy(working[location_index(dev)], cwd);
    optionalheader = oldquiet;
    if (ok) { strcpy(shown, p1.name); uppername(shown, shown); }
    if (!ok || !p1.name[0] || strpbrk(p1.name, "*?")) goto failed;
    kind = imagekind(p1.name);
    if (model == DRIVE_SD2IEC) {
        if (p1.dev != dev || !p1.dir[0] || !kind || (kind > 4 && kind != 8)) goto failed;
    } else if (drivemodel(p1.dev, 0) != DRIVE_SOFTIEC) goto failed;
    next.dev = dev; next.source = p1.dev; next.model = model; next.type = kind;
    strcpy(next.dir, p1.dir); strcpy(next.name, p1.name);
    /* Ultimate's legacy interface cannot report existing media: confirmation
     * also covers mounts made through its menu before entering the shell. */
    if ((previous.dev || model != DRIVE_SD2IEC) && !mount_confirm()) return;
    optionalheader = 1;
    close_media();
    ok = model == DRIVE_SD2IEC ? sd_insert(&next) : softiec_mount(&p1, dev, 0);
    optionalheader = oldquiet;
    if (!ok) {
        if (previous.dev) {
            optionalheader = 1;
            p1.dev = previous.source; strcpy(p1.dir, previous.dir); strcpy(p1.name, previous.name);
            ok = model == DRIVE_SD2IEC ? sd_insert(&previous) : softiec_mount(&p1, dev, 0);
            optionalheader = oldquiet;
            if (!ok) {
                mounts[slot].dev = 0;
                if (model == DRIVE_SD2IEC) strcpy(working[location_index(dev)], mount_hostdir);
                else working[location_index(dev)][0] = 0;
                error(SYSOUT_MOUNT_RESTORE_FAILED);
            }
        }
        nav_invalidate(); goto failed;
    }
    mounts[slot] = next;
    if (model == DRIVE_SD2IEC && !previous.dev) strcpy(mount_hostdir, cwd);
    working[location_index(dev)][0] = 0;
    nav_invalidate();
    print(SYSOUT_MOUNTED, shown, drivename(dev));
    return;
failed:
    print(SYSOUT_CANNOT_MOUNT, shown);
    return;
unavailable:
    if (unmount) print(SYSOUT_CANNOT_UNMOUNT, drivename(dev));
    else print(SYSOUT_CANNOT_MOUNT, shown);
    return;
syntax:
    error(unmount ? SYSOUT_SYNTAX_UNMOUNT : SYSOUT_SYNTAX_MOUNT);
}
/* Reinsert owned media after BASIC or another program may have changed it.
 * Working directories are restored by nav_finish only after media is ready. */
__noinline void bank_mount_restore(void)
{
    Path p;
    unsigned char i, ok, quiet = optionalheader;
    sd_ready = 0;
    for (i = 0; i < MOUNT_COUNT; ++i) {
        if (!mounts[i].dev) continue;
        if ((mounts[i].dev < 8 || mounts[i].dev > 30) ||
            mounts[i].source < 8 || mounts[i].source > 30 ||
            !memchr(mounts[i].dir, 0, 128) || !memchr(mounts[i].name, 0, 17)) {
            mounts[i].dev = 0; continue;
        }
        p.dev = mounts[i].source; strcpy(p.dir, mounts[i].dir); strcpy(p.name, mounts[i].name);
        optionalheader = 1;
        ok = i ? (ultimate_drive(mounts[i].dev) && softiec_mount(&p, mounts[i].dev, 0)) : sd_insert(&mounts[i]);
        optionalheader = quiet;
        if (!ok) {
            if (!i) {
                optionalheader = 1;
                sd_leave(mounts[i].dev);
                optionalheader = quiet;
            }
            working[location_index(mounts[i].dev)][0] = 0;
            mounts[i].dev = 0;
            error(SYSOUT_MOUNT_RESTORE_FAILED);
        }
    }
}
