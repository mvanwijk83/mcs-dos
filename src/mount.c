/* Explicit media changes. The physical selection cache never owns a mount. */
#include "core.h"
MountRecord mounts[MOUNT_COUNT];
char mount_hostdir[128];
unsigned char mount_bypass;
static unsigned char sd_ready;

/* Image kinds describe names, independently of the underlying CBM file type. */
#pragma code(mount_code)
#pragma data(mount_data)
__noinline unsigned char bank_imagekind(const char *name)
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
#pragma code(code)
#pragma data(data)
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

/* Metadata is ordered by sector offset in the raw image. D71's second
 * bitmap is at 53/0. The D81 header, BAMs and directory start at 40/0. */
const ImageLayout image_layouts[3] = {
    {683, {357, 358}, 2},
    {1366, {357, 358, 1040}, 3},
    {3200, {1560, 1561, 1562, 1563}, 4}
};

#pragma code(mount_code)
#pragma data(mount_data)

static void image_header(unsigned char *data, unsigned char offset,
                         const ImageLabel *label, unsigned char version, unsigned char dos)
{
    memset(data + offset, 0xa0, dos == 0x44 ? 25 : 27);
    memcpy(data + offset, label->name, strlen(label->name));
    memcpy(data + offset + 18, label->id, 2);
    data[offset + 21] = version;
    data[offset + 22] = dos;
}

/* D71 stores side two's free counts in the first BAM and its bits in 53/0.
 * The whole second BAM track is reserved. */
static unsigned int image_154x_bam(unsigned char kind, unsigned char index,
                                   const ImageLabel *label, unsigned char *data)
{
    unsigned char track, sectors, offset;
    if (!index) {
        data[0] = 18;
        data[1] = 1;
        data[2] = 0x41;
        data[3] = kind == 2 ? 0x80 : 0;
        image_header(data, 144, label, 0x32, 0x41);
    }
    for (track = 1; track <= 35; ++track) {
        sectors = track <= 17 ? 21 : track <= 24 ? 19 : track <= 30 ? 18 : 17;
        if (!index) {
            offset = track * 4;
            data[offset++] = track == 18 ? sectors - 2 : sectors;
            if (kind == 2)
                data[220 + track] = track == 18 ? 0 : sectors;
        } else {
            if (track == 18) continue;
            offset = (track - 1) * 3;
        }
        data[offset] = !index && track == 18 ? 0xfc : 0xff;
        data[offset + 1] = 0xff;
        data[offset + 2] = (1 << (sectors - 16)) - 1;
    }
    return index ? 105 : kind == 2 ? 256 : 171;
}

static unsigned int image_1581_bam(unsigned char index, const ImageLabel *label, unsigned char *data)
{
    unsigned int offset;
    if (!index) {
        data[0] = 40;
        data[1] = 3;
        data[2] = 0x44;
        image_header(data, 4, label, 0x33, 0x44);
        return 29;
    }
    data[0] = index == 1 ? 40 : 0;
    data[1] = index == 1 ? 2 : 0xff;
    data[2] = 0x44;
    data[3] = 0xbb;
    memcpy(data + 4, label->id, 2);
    data[6] = 0xc0;
    memset(data + 16, 0xff, 240);
    for (offset = 16; offset < 256; offset += 6)
        data[offset] = 40;
    if (index == 1) {
        data[250] = 36;
        data[251] = 0xf0;
    }
    return 256;
}

/* Build one complete metadata sector and return its non-padding prefix. */
__noinline unsigned int bank_image_metadata(unsigned char kind, unsigned char index,
                                            const ImageLabel *label, unsigned char *data)
{
    memset(data, 0, 256);
    if (index == (kind == 3 ? 3 : 1)) {
        data[1] = 0xff;
        return 2;
    }
    if (kind == 3)
        return image_1581_bam(index, label, data);
    return image_154x_bam(kind, index, label, data);
}

static unsigned char image_entry(unsigned char dev, char *name, unsigned char directory);

/* SD2IEC's FAT backend fills gaps with zeroes. Each position is beyond EOF,
 * so RECORD NOT PRESENT is the expected response before writing the bytes. */
static unsigned char sd_image_write(unsigned char dev, unsigned char lfn, unsigned long offset,
                                    unsigned long next, const void *data, unsigned int size)
{
    unsigned char request[] = {0x50, 3, offset, offset >> 8, offset >> 16, offset >> 24};
    POKE(144, 0);
    if (offset != next &&
        (channel_write(lfn, request, sizeof(request)) != sizeof(request) ||
         diskstatus(dev, 0) != 50)) return 0;
    POKE(144, 0);
    return channel_write(3, data, size) == size;
}

/* Write only the BAM, the empty directory's end marker, and the last byte.
 * The file is complete when closed and does not need a temporary mount. */
static unsigned char sd_makedisk(const Path *p, unsigned char kind, const ImageLabel *label)
{
    const ImageLayout *layout = &image_layouts[kind - 1];
    const unsigned char zero = 0;
    unsigned char dev = p->dev, lfn, ok = 0, original, index;
    unsigned long offset, next = 0;
    unsigned int length;
    PartitionInfo info;
    char request[24];

    if (!partition_info(dev, 255, &info)) return 0;
    original = info.number;
    if (!location_select(dev, p->dir) || !partition_info(dev, 255, &info))
        goto finish;
    if (info.type != 1) {
        error(SYSOUT_MOUNT_IN_USE);
        goto finish;
    }
    if (!p->dir[0] && !command(dev, "cd//")) goto finish;
    lfn = statuschannel(dev);
    if (!lfn) goto finish;
    snprintf(request, sizeof(request), "%s,p,w", p->name);
    channel_close(3);
    if (channel_open(3, dev, 3, request) || diskstatus(dev, 1) >= 20) {
        channel_close(3);
        goto finish;
    }
    for (index = 0; index < layout->count; ++index) {
        offset = layout->metadata[index] * 256UL;
        length = bank_image_metadata(kind, index, label, io);
        if (!sd_image_write(dev, lfn, offset, next, io, length)) break;
        next = offset + length;
    }
    ok = index == layout->count &&
         sd_image_write(dev, lfn, layout->sectors * 256UL - 1, next, &zero, 1);
    channel_close(3);
    if (diskstatus(dev, 1) >= 20) ok = 0;
    if (!ok) {
        snprintf(request, sizeof(request), "s0:%s", p->name);
        command(dev, request);
    }
finish:
    if (p->dir[0]) {
        snprintf(request, sizeof(request), "cp%u", original);
        if (!command(dev, request)) ok = 0;
        /* CP changes the physical selection behind the navigation cache. */
        nav_invalidate();
        if (!location_select(dev, working[location_index(dev)])) ok = 0;
    }
    return ok;
}

__noinline void bank_makediskcmd(void)
{
    const char *target = 0, *label = 0, *id = 0;
    unsigned char model, ok, kind, i;
    ImageLabel title;
    for (i = 1; i < argc; ++i) {
        if (!strnicmp(args[i], "/V:", 3) && !label)
            label = args[i] + 3;
        else if (!strnicmp(args[i], "/I:", 3) && !id)
            id = args[i] + 3;
        else if (args[i][0] == '/') {
            error(SYSOUT_INVALID_SWITCH);
            return;
        } else if (!target)
            target = args[i];
        else {
            error(SYSOUT_TOO_MANY_PARAMS);
            return;
        }
    }
    if (!target) {
        error(SYSOUT_SYNTAX_MAKEDISK);
        return;
    }
    if (!path(target, &p1)) return;
    kind = imagekind(p1.name);
    if (!kind || kind > 3) {
        error(SYSOUT_MAKEDISK_INVALID_FORMAT);
        return;
    }
    if ((p1.name[0] == '.' && strlen(p1.name) == 4) ||
        p1.name[0] == '@' || strpbrk(p1.name, "*?<>|")) {
        error(SYSOUT_SYNTAX_MAKEDISK);
        return;
    }
    model = drivemodel(p1.dev, 0);
    if (model != DRIVE_SD2IEC && model != DRIVE_SOFTIEC) {
        error(SYSOUT_UNSUPPORTED_DRIVE_TYPE);
        return;
    }
    if (mount_active(p1.dev) || (redirected && outputpath.dev == p1.dev)) {
        error(SYSOUT_MOUNT_IN_USE);
        return;
    }
    if (!makedisk_title(label, id, &title))
        return;
    ok = model == DRIVE_SD2IEC ? sd_makedisk(&p1, kind, &title) :
                                softiec_makedisk(&p1, kind, &title);
    cachevalid = 0;
    if (ok) say(SYSOUT_MAKEDISK_COMPLETE);
    else if (!aborted) error(SYSOUT_MAKEDISK_FAILED);
}

static void close_media(void)
{
    channel_close(2); channel_close(3); channel_close(4); channel_close(6);
}
static unsigned char sd_leave(unsigned char dev, unsigned char allow_host_root)
{
    static const unsigned char parent[] = {0x43, 0x44, ':', 0x5f};
    unsigned char lfn, status;
    PartitionInfo info;
    close_media(); sd_ready = 0;
    if (!command(dev, "cd//")) return 0;
    lfn = statuschannel(dev);
    POKE(144, 0);
    if (!lfn || channel_write(lfn, parent, sizeof(parent)) != sizeof(parent)) return 0;
    status = diskstatus(dev, 0);
    /* Some sd2iec versions return FILE NOT FOUND for CD:_ at the FAT root.
     * Mount preparation can proceed from there without ejecting anything. */
    return status < 20 || (allow_host_root && status == 62 &&
                           partition_info(dev, 255, &info) && info.type == 1);
}
static unsigned char sd_insert(const MountRecord *record)
{
    unsigned char ok;
    char request[24], name[17];
    if (!sd_leave(record->dev, 1)) return 0;
    mount_bypass = 1;
    ok = host_select(record->source, record->dir, DRIVE_SD2IEC);
    mount_bypass = 0;
    if (!ok) return 0;
    strcpy(name, record->name);
    if (!image_entry(record->dev, name, 0)) return 0;
    snprintf(request, sizeof(request), "cd:%s", name);
    if (!command(record->dev, request)) return 0;
    sd_ready = 1;
    return 1;
}
/* Match SD2IEC names case-insensitively and use the directory's spelling.
 * Keep files out of CD while walking the inside of an image. */
static unsigned char image_entry(unsigned char dev, char *name, unsigned char directory)
{
    struct DirectoryEntry entry;
    unsigned char found = 0;
    if (directory_open(6, dev)) { channel_close(6); return 0; }
    channel_buffer(6, 1);
    if (!directory_read(6, &entry)) while (!directory_read(6, &entry))
        if (!stricmp(entry.name, name)) {
            found = directory ? entry.type == CBM_T_DIR : entry.type != CBM_T_DIR && entry.type != CBM_T_CBM;
            if (found) strcpy(name, entry.name);
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
    const char *leaf;
    unsigned int prefix;
    for (i = 0; i < MOUNT_COUNT; ++i)
        /* SD2IEC paths now address the image, never the hidden host. An
         * identical spelling inside it must remain an ordinary file. */
        if ((i || !mount_active(p->dev)) && mounts[i].dev && mounts[i].source == p->dev &&
            !stricmp(mounts[i].name, p->name)) {
            if (mounts[i].type & MOUNT_NATIVE) {
                leaf = strrchr(mounts[i].dir, 0x5c);
                prefix = leaf ? leaf - mounts[i].dir : 0;
                if (strlen(p->dir) != prefix || strnicmp(mounts[i].dir, p->dir, prefix)) continue;
            } else if (stricmp(mounts[i].dir, p->dir)) continue;
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

/* Only Ultimate MOUNT accepts a native leaf beyond the ordinary 16-byte
 * component syntax. Parents keep the shell's existing path semantics. */
static unsigned char mount_source(const char *text, Path *p, MountRecord *record, unsigned char ultimate)
{
    const char *leaf = strrchr(text, 0x5c);
    unsigned int prefix, size, parent;
    if (!leaf) leaf = strchr(text, ':');
    leaf = leaf ? leaf + 1 : text;
    record->type = 0;
    size = strlen(leaf);
    if (!ultimate || (size <= 16 && !strchr(leaf, ','))) return path(text, p);
    if (!size || strpbrk(leaf, ":\"/*?")) { error(SYSOUT_INVALID_FILE_NAME); return 0; }
    prefix = leaf - text;
    memcpy(io, text, prefix); io[prefix] = 0;
    if (!path(io, p) || p->name[0]) return 0;
    if (drivemodel(p->dev, 0) != DRIVE_SOFTIEC) { error(SYSOUT_UNSUPPORTED_DRIVE_TYPE); return 0; }
    parent = strlen(p->dir);
    if (parent + !!parent + size >= sizeof(record->dir)) { error(SYSOUT_PATH_TOO_LONG); return 0; }
    strcpy(record->dir, p->dir);
    if (parent) record->dir[parent++] = 0x5c;
    strcpy(record->dir + parent, leaf);
    strncpy(record->name, leaf, 16); record->name[16] = 0;
    uppername(record->name, record->name);
    while (record->name[0] && record->name[strlen(record->name) - 1] == ' ') record->name[strlen(record->name) - 1] = 0;
    strcpy(p->name, record->name);
    record->type = MOUNT_NATIVE;
    return 1;
}

static unsigned char ultimate_insert(MountRecord *record)
{
    /* Native mounts share the existing resident gate. This operation carries
     * a MountRecord pointer; ordinary operations continue to carry a Path. */
    if (record->type & MOUNT_NATIVE) return softiec_mount((const Path *)record, record->dev, SOFTIEC_MOUNT_NATIVE);
    p1.dev = record->source; strcpy(p1.dir, record->dir); strcpy(p1.name, record->name);
    return softiec_mount(&p1, record->dev, 0);
}
__noinline void bank_mountcmd(unsigned char unmount)
{
    /* Commands are serialized. Keep transaction snapshots out of the small
     * C64 software stack while path and IEC services make nested bank calls. */
    static MountRecord previous, next;
    static char cwd[128];
    char shown[17];
    const char *label = shown, *leaf;
    unsigned char dev = drive, model, slot, kind, ok = 0, oldquiet = optionalheader, ambiguous = 0;
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
        ok = model == DRIVE_SD2IEC ? sd_leave(dev, 0) : softiec_mount(0, dev, 1);
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
    ok = mount_source(args[1], &p1, &next, model != DRIVE_SD2IEC);
    mount_bypass = 0;
    strcpy(working[location_index(dev)], cwd);
    optionalheader = oldquiet;
    if (ok) { strcpy(shown, p1.name); uppername(shown, shown); }
    if (ok && (next.type & MOUNT_NATIVE)) {
        leaf = strrchr(args[1], 0x5c);
        if (!leaf) leaf = strchr(args[1], ':');
        label = leaf ? leaf + 1 : args[1];
    }
    if (!ok || !p1.name[0] || strpbrk(p1.name, "*?")) goto failed;
    kind = imagekind(p1.name);
    if (model == DRIVE_SD2IEC) {
        if (p1.dev != dev || !p1.dir[0] || !kind || (kind > 4 && kind != 8)) goto failed;
    } else if (drivemodel(p1.dev, 0) != DRIVE_SOFTIEC) goto failed;
    next.dev = dev; next.source = p1.dev; next.model = model;
    if (!(next.type & MOUNT_NATIVE)) {
        next.type = kind; strcpy(next.dir, p1.dir); strcpy(next.name, p1.name);
    }
    /* Ultimate's legacy interface cannot report existing media: confirmation
     * also covers mounts made through its menu before entering the shell. */
    if ((previous.dev || model != DRIVE_SD2IEC) && !mount_confirm()) return;
    optionalheader = 1;
    close_media();
    ok = model == DRIVE_SD2IEC ? sd_insert(&next) : ultimate_insert(&next);
    optionalheader = oldquiet;
    if (!ok) {
        ambiguous = model != DRIVE_SD2IEC && !strcmp(statusbuf, SYSOUT_AMBIGUOUS_FILE_NAME);
        if (previous.dev) {
            optionalheader = 1;
            ok = model == DRIVE_SD2IEC ? sd_insert(&previous) : ultimate_insert(&previous);
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
    print(SYSOUT_MOUNTED, label, drivename(dev));
    return;
failed:
    if (ambiguous) error(SYSOUT_AMBIGUOUS_FILE_NAME);
    else print(SYSOUT_CANNOT_MOUNT, label);
    return;
unavailable:
    if (unmount) print(SYSOUT_CANNOT_UNMOUNT, drivename(dev));
    else print(SYSOUT_CANNOT_MOUNT, label);
    return;
syntax:
    error(unmount ? SYSOUT_SYNTAX_UNMOUNT : SYSOUT_SYNTAX_MOUNT);
}
/* Reinsert owned media after BASIC or another program may have changed it.
 * Working directories are restored by nav_finish only after media is ready. */
__noinline void bank_mount_restore(void)
{
    unsigned char i, ok, quiet = optionalheader;
    sd_ready = 0;
    for (i = 0; i < MOUNT_COUNT; ++i) {
        if (!mounts[i].dev) continue;
        if ((mounts[i].dev < 8 || mounts[i].dev > 30) ||
            mounts[i].source < 8 || mounts[i].source > 30 ||
            !memchr(mounts[i].dir, 0, 128) || !memchr(mounts[i].name, 0, 17)) {
            mounts[i].dev = 0; continue;
        }
        optionalheader = 1;
        ok = i ? (ultimate_drive(mounts[i].dev) && ultimate_insert(&mounts[i])) : sd_insert(&mounts[i]);
        optionalheader = quiet;
        if (!ok) {
            if (!i) {
                optionalheader = 1;
                sd_leave(mounts[i].dev, 0);
                optionalheader = quiet;
            }
            working[location_index(mounts[i].dev)][0] = 0;
            mounts[i].dev = 0;
            error(SYSOUT_MOUNT_RESTORE_FAILED);
        }
    }
}
