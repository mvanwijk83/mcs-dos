/* Directory paths are bounded strings, never a resident tree. An empty
 * string denotes a device root; CMD roots are synthetic partition lists.
 * The shell's working paths are independent of temporary drive selections. */
#include "core.h"
#pragma code(nav_code)
#pragma data(nav_data)

static unsigned char models[LOCATIONCOUNT], touched[LOCATIONCOUNT];
static unsigned char physicaldev, filesystem, firsttrack, lasttrack, directorytrack;
static char selecteddir[2][PATHSIZE];
static unsigned char selecteddev[2], selectedfs[2], selectedfirst[2], selectedlast[2], selectedheader[2], nextslot;
/* Publish selection results in resident state across nested bank transitions. */
volatile unsigned char location_success;
__noinline void bank_location_select(unsigned char dev, const char *dir);
#define select_ok(d,p) (bank_location_select(d,p), location_success)
static Path navpath;
static char full[PATHSIZE], component[17];
char startupdir[PATHSIZE];

/* Cache model identification within a shell session, without resetting DOS. */
static unsigned char modelof(unsigned char dev)
{
    unsigned char slot = location_index(dev);
    if (dev && !models[slot])
        models[slot] = drivemodel(dev, 0);
    return models[slot];
}

/* Resolve CMD partition names to stable numeric components. Both names and
 * @number aliases are accepted; stored paths always use the numeric alias. */
static unsigned char canonical(unsigned char dev, char *dir)
{
    PartitionInfo info;
    char replacement[PATHSIZE], *slash;
    unsigned int n;
    unsigned char model = modelof(dev);
    if (!*dir || (model != DRIVE_CMD_HD && model != DRIVE_CMD_FD))
        return 1;
    slash = strchr(dir, 0x5c);
    n = slash ? slash - dir : strlen(dir);
    if (n > 16)
        return 0;
    memcpy(component, dir, n);
    component[n] = 0;
    if (!partition_lookup(dev, component, &info))
        return 0;
    snprintf(replacement, sizeof(replacement), "@%u%s", info.number, slash ? slash : "");
    if (strlen(replacement) + 1 >= PATHSIZE) {
        error(SYSOUT_PATH_TOO_LONG);
        return 0;
    }
    strcpy(dir, replacement);
    return 1;
}

/* Append one normalized component. Dot and parent syntax never reaches DOS. */
static unsigned char appendpart(char *dst, const char *part)
{
    char *last;
    unsigned int n = strlen(dst), size = strlen(part);
    if (!size || !strcmp(part, "."))
        return 1;
    if (!strcmp(part, "..")) {
        last = strrchr(dst, 0x5c);
        if (last)
            *last = 0;
        else
            *dst = 0;
        return 1;
    }
    if (n + (n != 0) + size + 1 >= PATHSIZE) {
        error(SYSOUT_PATH_TOO_LONG);
        return 0;
    }
    if (n) {
        dst[n++] = 0x5c;
        dst[n] = 0;
    }
    strcat(dst, part);
    return 1;
}

/* Parse DOS paths without changing the working directory. The final component
 * is kept separately for wildcard matching and native 16-byte OPEN names. */
__noinline unsigned char bank_path(const char *s, Path *p)
{
    unsigned int device = 0, n;
    const char *q = s;
    unsigned char trailing;
    p->dev = drive;
    p->name[0] = 0;
    if (toupper(s[0]) >= 'A' && toupper(s[0]) <= 'W' && s[1] == ':') {
        p->dev = toupper(s[0]) - 'A' + 8;
        s += 2;
    } else {
        while (isdigit(*q)) {
            device = device * 10 + *q++ - '0';
            if (device > 30)
                break;
        }
        if (*q == ':' && q > s) {
            if (device && (device < 8 || device > 30)) {
                error(SYSOUT_INVALID_DRIVE_SPEC);
                return 0;
            }
            p->dev = device;
            s = q + 1;
        }
    }
    strcpy(p->dir, working[location_index(p->dev)]);
    if ((unsigned char)*s == 0x5c) {
        p->dir[0] = 0;
        ++s;
    }
    trailing = !*s;
    while (*s) {
        n = 0;
        while (*s && (unsigned char)*s != 0x5c) {
            if (n == 16) {
                error(SYSOUT_FILE_NAME_TOO_LONG);
                return 0;
            }
            if (*s == ':' || *s == ',' || *s == '"') {
                error(SYSOUT_INVALID_FILE_NAME);
                return 0;
            }
            component[n++] = *s++;
        }
        component[n] = 0;

        if (*s || !strcmp(component, ".") || !strcmp(component, "..")) {
            if (strpbrk(component, "*?")) {
                error(SYSOUT_INVALID_FILE_NAME);
                return 0;
            }
            if (!appendpart(p->dir, component))
                return 0;
        } else
            strcpy(p->name, component);
        trailing = !!*s;
        if (*s)
            ++s;
    }
    if (trailing)
        p->name[0] = 0;
    if (strlen(p->dir) + strlen(p->name) + (p->dir[0] && p->name[0]) + 1 >= PATHSIZE) {
        error(SYSOUT_PATH_TOO_LONG);
        return 0;
    }
    return canonical(p->dev, p->dir);
}

/* Move a final directory name into its parent path, preserving the size limit. */
__noinline unsigned char bank_path_join(Path *p)
{
    if (strpbrk(p->name, "*?") || !appendpart(p->dir, p->name))
        return 0;
    p->name[0] = 0;
    return canonical(p->dev, p->dir);
}

/* A CMD root has no physical files and must reject writes before OPEN. */
__noinline unsigned char bank_location_root(unsigned char dev, const char *dir)
{
    unsigned char model = modelof(dev);
    return !*dir && (model == DRIVE_CMD_HD || model == DRIVE_CMD_FD);
}

/* Replay an absolute path from its physical root. Two device selections are
 * retained so cross-device streaming does not disturb a live writer. */
__noinline void bank_location_select(unsigned char dev, const char *dir)
{
    unsigned char model = modelof(dev), n, slot;
    const char *q = dir;
    PartitionInfo info;
    touched[location_index(dev)] = 1;
    if (physicaldev == 255)
        selecteddev[0] = selecteddev[1] = 255;
    for (slot = 0; slot < 2; ++slot)
        if (selecteddev[slot] == dev && !strcmp(selecteddir[slot], dir)) {
            physicaldev = dev;
            filesystem = selectedfs[slot];
            firsttrack = selectedfirst[slot];
            lasttrack = selectedlast[slot];
            directorytrack = selectedheader[slot];
            location_success = 1;
            return;
        }
    for (slot = 0; slot < 2; ++slot)
        if (selecteddev[slot] == dev)
            selecteddev[slot] = 255;
    slot = nextslot;
    nextslot ^= 1;
    selecteddev[slot] = 255;
    physicaldev = 255;
    filesystem = model == DRIVE_1581 ? 4 : 0;
    firsttrack = 1;
    lasttrack = 80;
    directorytrack = 40;
    if (model == DRIVE_CMD_HD || model == DRIVE_CMD_FD) {
        if (!*q) {
            if (!drivepresent(dev))
                goto failed;
            goto selected;
        }
        n = 0;
        while (*q && (unsigned char)*q != 0x5c && n < 16)
            component[n++] = *q++;
        component[n] = 0;
        if (!partition_lookup(dev, component, &info))
            goto failed;
        n = info.number;
        snprintf(diskcmd, sizeof(diskcmd), "cp%u", n);
        if (!command(dev, diskcmd) || !partition_info(dev, 255, &info) || info.number != n)
            goto failed;
        filesystem = info.type;
        if (filesystem != 1 && filesystem != 2 && filesystem != 3 && filesystem != 4) {
            error(SYSOUT_UNSUPPORTED_DISK_FORMAT);
            goto failed;
        }
        if (*q)
            ++q;
        if (filesystem == 1 && !command(dev, "cd//"))
            goto failed;
    }
    if (filesystem == 4) {
        n = command(dev, "/");
        if (!n)
            goto failed;
    }
    while (*q) {
        n = 0;
        while (*q && (unsigned char)*q != 0x5c && n < 16)
            component[n++] = *q++;
        component[n] = 0;
        if (filesystem != 1 && filesystem != 4) {
            error(SYSOUT_SUBDIRECTORIES_NOT_SUPPORTED);
            goto failed;
        }
        snprintf(diskcmd, sizeof(diskcmd), filesystem == 4 ? "/0:%s" : "cd:%s", component);
        if (!command(dev, diskcmd))
            goto failed;
        if (filesystem == 4) {
            char *tail = strrchr(statusbuf, ',');
            char *prev;
            if (tail) {
                lasttrack = atoi(tail + 1);
                *tail = 0;
                prev = strrchr(statusbuf, ',');
                if (prev)
                    firsttrack = atoi(prev + 1);
                directorytrack = firsttrack;
            }
        }
        if (*q)
            ++q;
    }
selected:
    physicaldev = dev;
    selecteddev[slot] = dev;
    strcpy(selecteddir[slot], dir);
    selectedfs[slot] = filesystem;
    selectedfirst[slot] = firsttrack;
    selectedlast[slot] = lasttrack;
    selectedheader[slot] = directorytrack;
    cachevalid = 0;
    location_success = 1;
    return;
failed:
    location_success = 0;
}

/* File mutations are never legal on the synthetic CMD partition container. */
__noinline unsigned char bank_location_file(unsigned char dev, const char *dir)
{
    if (bank_location_root(dev, dir)) {
        error(SYSOUT_VIRTUAL_ROOT_NO_FILES);
        return 0;
    }
    return select_ok(dev, dir);
}

/* Enumerate a specific directory, including the synthetic partition root. */
__noinline unsigned char bank_location_list(unsigned char dev, const char *dir)
{
    if (bank_location_root(dev, dir)) {
        if (!partition_root(dev))
            return 0;
    } else {
        if (!select_ok(dev, dir) || !directory(dev))
            return 0;
    }
    cachedev = dev;
    strcpy(cachedir, dir);
    cachevalid = 1;
    return 1;
}

/* Interpret an existing final directory component as a directory target.
 * No final name already denotes a directory, including a device-only path. */
__noinline unsigned char bank_path_directory(Path *p)
{
    int i;
    if (!p->name[0])
        return 1;
    if (strpbrk(p->name, "*?"))
        return 0;
    if (!bank_location_list(p->dev, p->dir))
        return 0;
    for (i = 0; i < count; ++i)
        if (!strcmp(directory_entries[i].name, p->name) &&
            (directory_entries[i].type == CBM_T_DIR || directory_entries[i].type == CBM_T_CBM))
            return bank_path_join(p);
    /* Numeric partition aliases need not be the displayed partition name. */
    if (bank_location_root(p->dev, p->dir) && p->name[0] == '@')
        return bank_path_join(p);
    return 0;
}

/* Read the parent's BAM without modifying it. Only fully free tracks are
 * eligible; retain the first fitting run and the largest available extent. */
static unsigned char space1581(unsigned char dev, unsigned int wanted,
                               unsigned char *start, unsigned int *largest)
{
    unsigned char track, bamsector = 0, header = directorytrack;
    unsigned char run = 0, beginning = 0, offset, k, free;
    unsigned char map[80];
    memset(map, 0, sizeof(map));
    *start = 0;
    *largest = 0;
    if (!rawopen(dev))
        return 0;
    for (track = 1; track <= 80; ++track) {
        if (bamsector != (track <= 40 ? 1 : 2)) {
            bamsector = track <= 40 ? 1 : 2;
            if (!blockio(dev, header, bamsector, 0) || io[2] != 0x44 || io[3] != 0xbb) {
                channel_close(2);
                return 0;
            }
        }
        offset = 16 + ((track - 1) % 40) * 6;
        free = io[offset] == 40;
        for (k = 1; k <= 5; ++k)
            if (io[offset + k] != 255)
                free = 0;
        map[track - 1] = free;
    }
    channel_close(2);
    for (track = 1; track <= 80; ++track) {
        if (track == 40 || track == header ||
            (track < firsttrack || track > lasttrack) || !map[track - 1])
            run = 0;
        else {
            if (!run)
                beginning = track;
            ++run;
            if ((unsigned int)run * 40 > *largest)
                *largest = (unsigned int)run * 40;
            if (!*start && wanted && (unsigned int)run * 40 >= wanted)
                *start = beginning;
        }
    }
    return 1;
}

/* Create a sized 1581 sub-partition, checking selection before formatting.
 * Commands with binary fields use an explicit byte length, never strlen. */
static unsigned char make1581(Path *p, unsigned int sectors)
{
    unsigned char start, lfn, n;
    unsigned int largest;
    if (!space1581(p->dev, sectors, &start, &largest))
        return 0;
    if (!sectors) {
        char value[8], *end;
        unsigned long number;
        if (batching) {
            error(SYSOUT_PARTITION_SIZE_BATCH);
            return 0;
        }
        if (largest < 120) {
            error(SYSOUT_NO_ROOM_FOR_SUBDIRECTORY);
            return 0;
        }
        print(SYSOUT_PARTITION_SIZE_PROMPT, 120, largest);
        if (!input(value, sizeof(value), 0))
            return 0;
        number = strtoul(value, &end, 10);
        if (!value[0] || *end || number < 120 || number > largest || number % 40) {
            error(SYSOUT_INVALID_PARTITION_SIZE);
            return 0;
        }
        sectors = number;
        if (!space1581(p->dev, sectors, &start, &largest))
            return 0;
    }
    if (!start) {
        error(SYSOUT_NO_FREE_DISK_REGION);
        return 0;
    }
    snprintf(diskcmd, sizeof(diskcmd), "/0:%s,", p->name);
    n = strlen(diskcmd);
    diskcmd[n++] = start;
    diskcmd[n++] = 0;
    diskcmd[n++] = sectors;
    diskcmd[n++] = sectors >> 8;
    diskcmd[n++] = ',';
    diskcmd[n++] = 'c';
    lfn = statuschannel(p->dev);
    if (!lfn || channel_write(lfn, diskcmd, n) != n || diskstatus(p->dev, 1) >= 20)
        return 0;
    snprintf(diskcmd, sizeof(diskcmd), "/0:%s", p->name);
    if (!command(p->dev, diskcmd))
        return 0;
    /* Selection must positively report 02; a generic OK cannot authorize NEW. */
    if (atoi(statusbuf) != 2) {
        error(SYSOUT_PARTITION_SELECTION_UNCONFIRMED);
        return 0;
    }
    physicaldev = 255;
    snprintf(diskcmd, sizeof(diskcmd), "n0:%s,md", p->name);
    return command(p->dev, diskcmd);
}

/* Remove a native tree iteratively. Re-read the current directory after each
 * mutation; path length bounds traversal without a separate depth limit. */
static unsigned char removetree(Path *p, unsigned char recursive)
{
    unsigned int boundary;
    char *slash;
    if (!bank_path_join(p))
        return 0;
    boundary = strlen(p->dir);
    for (;;) {
        if (!bank_location_list(p->dev, p->dir))
            return 0;
        if (count) {
            if (!recursive) {
                error(SYSOUT_DIRECTORY_NOT_EMPTY);
                return 0;
            }
            strcpy(p->name, directory_entries[0].name);
            if (directory_entries[0].type == CBM_T_DIR) {
                if (!bank_path_join(p))
                    return 0;
            } else if (!scratch(p))
                return 0;
        } else {
            unsigned char done = strlen(p->dir) == boundary;
            slash = strrchr(p->dir, 0x5c);
            strcpy(p->name, slash ? slash + 1 : p->dir);
            if (slash)
                *slash = 0;
            else
                p->dir[0] = 0;
            if (!select_ok(p->dev, p->dir))
                return 0;
            snprintf(diskcmd, sizeof(diskcmd), "rd:%s", p->name);
            if (!command(p->dev, diskcmd))
                return 0;
            physicaldev = 255;
            if (done)
                return 1;
        }
    }
}

/* CD/CHDIR, MD/MKDIR and RD/RMDIR share path handling but retain backend
 * allocation rules. CMD's virtual root is deliberately navigation-only. */
__noinline void bank_navcmd(unsigned char operation)
{
    unsigned char i, recursive = 0, suppress = 0, changedrive = 0;
    unsigned long sectors = 0;
    char *target = 0, *end;
    int exists;
    for (i = 1; i < argc; ++i) {
        if (!operation && !stricmp(args[i], "/D"))
            changedrive = 1;
        else if (operation == 1 && !strnicmp(args[i], "/SIZE:", 6)) {
            sectors = strtoul(args[i] + 6, &end, 10);
            if (!args[i][6] || *end || sectors < 120 || sectors > 3200 || sectors % 40)
                goto syntax;
        } else if (operation == 2 && !stricmp(args[i], "/S"))
            recursive = 1;
        else if (operation == 2 && !stricmp(args[i], "/P"))
            suppress = 1;
        else if (target || args[i][0] == '/') {
            goto syntax;
        } else
            target = args[i];
    }
    if (!target && operation)
        goto syntax;
    if (!path(target ? target : "", &navpath))
        return;
    if (!operation) {
        if (!target || !*target || target[strlen(target) - 1] == ':') {
            if (changedrive && target) {
                if (select_ok(navpath.dev, navpath.dir))
                    drive = navpath.dev;
                return;
            }
            uppername(working[location_index(navpath.dev)], full);
            print(SYSOUT_CURRENT_DIRECTORY, drivename(navpath.dev), 0x5c,
                  full);
            return;
        }
        if (!bank_path_join(&navpath) || !select_ok(navpath.dev, navpath.dir))
            return;
        strcpy(working[location_index(navpath.dev)], navpath.dir);
        if (changedrive)
            drive = navpath.dev;
        return;
    }
    /* A trailing slash denotes the directory itself; split it back into a
     * parent and a leaf for MD/RD. Never allow either command to target root. */
    if (!navpath.name[0] && navpath.dir[0]) {
        char *slash = strrchr(navpath.dir, 0x5c);
        strcpy(navpath.name, slash ? slash + 1 : navpath.dir);
        if (slash)
            *slash = 0;
        else
            navpath.dir[0] = 0;
    }
    if (!navpath.name[0] || strpbrk(navpath.name, "*?")) {
        error(SYSOUT_INVALID_DEST);
        return;
    }
    if (!bank_location_file(navpath.dev, navpath.dir))
        return;
    exists = findfile(&navpath);
    if (operation == 1) {
        if (exists >= 0) {
            error(SYSOUT_FILE_OR_DIRECTORY_EXISTS);
            return;
        }
        if (exists == -2)
            return;
        if (filesystem == 4)
            make1581(&navpath, sectors);
        else if (filesystem == 1 && !sectors) {
            snprintf(diskcmd, sizeof(diskcmd), "md:%s", navpath.name);
            command(navpath.dev, diskcmd);
        } else
            error(SYSOUT_UNSUPPORTED_DIRECTORY_OP);
        physicaldev = 255;
        return;
    }
    if (exists < 0 || (directory_entries[exists].type != CBM_T_DIR &&
                       directory_entries[exists].type != CBM_T_CBM)) {
        error(SYSOUT_DIRECTORY_NOT_FOUND);
        return;
    }
    strcpy(full, navpath.dir);
    if (!appendpart(full, navpath.name))
        return;
    end = working[location_index(navpath.dev)];
    i = strlen(full);
    if (!strncmp(end, full, i) && (!end[i] || (unsigned char)end[i] == 0x5c)) {
        error(SYSOUT_CANNOT_REMOVE_CURRENT_DIRECTORY);
        return;
    }
    if (recursive && !suppress && !yesno(SYSOUT_REMOVE_DIRECTORY_TREE))
        return;
    if (filesystem == 4) {
        if (!recursive) {
            if (!bank_location_list(navpath.dev, full))
                return;
            if (count) {
                error(SYSOUT_DIRECTORY_NOT_EMPTY);
                return;
            }
        }
        if (select_ok(navpath.dev, navpath.dir)) {
            snprintf(diskcmd, sizeof(diskcmd), "s0:%s", navpath.name);
            command(navpath.dev, diskcmd);
        }
    } else if (filesystem == 1)
        removetree(&navpath, recursive);
    physicaldev = 255;
    return;
syntax:
    error(operation == 0 ? SYSOUT_SYNTAX_CD : operation == 1 ?
          SYSOUT_SYNTAX_MD : SYSOUT_SYNTAX_RD);
}

/* Restore every device touched by a command. Failed paths recover to their
 * device root; an unreachable selected device falls back to cartridge zero. */
__noinline void bank_nav_finish(void)
{
    unsigned char i, dev;
    rawreadmask = rawreading = 0;
    touched[location_index(drive)] = 1;
    for (i = 0; i < LOCATIONCOUNT; ++i) {
        if (!touched[i])
            continue;
        touched[i] = 0;
        dev = i ? i + 7 : 0;
        if (dev && !drivepresent(dev)) {
            working[i][0] = 0;
            if (drive == dev)
                drive = 0;
            continue;
        }
        if (!select_ok(dev, working[i])) {
            working[i][0] = 0;
            physicaldev = 255;
            if (!select_ok(dev, "") && drive == dev)
                drive = 0;
            say(SYSOUT_WORKING_DIRECTORY_RESET);
        }
        touched[i] = 0;
    }
    /* Re-establish physical context on the next command, including disk swaps. */
    physicaldev = 255;
    memset(models, 0, sizeof(models));
    cachevalid = 0;
}

#pragma code(code)
#pragma data(data)

/* Map cartridge zero and IEC devices 8..30 into compact persistent slots. */
unsigned char location_index(unsigned char dev)
{
    return dev ? dev - 7 : 0;
}

/* Comparing canonical directory paths prevents false self-copy matches. */
unsigned char sameplace(const Path *a, const Path *b)
{
    return a->dev == b->dev && !strcmp(a->dir, b->dir);
}

/* External drive commands and program returns invalidate physical knowledge. */
void nav_invalidate(void)
{
    physicaldev = 255;
    cachevalid = 0;
    memset(models, 0, sizeof(models));
    memset(touched, 0, sizeof(touched));
    touched[location_index(drive)] = 1;
}

/* Cold/reboot initialization does not carry directories into a new session. */
void nav_reset(void)
{
    memset(working, 0, sizeof(working));
    startupdir[0] = 0;
    rawreadmask = rawreading = 0;
    memset(models, 0, sizeof(models));
    memset(touched, 0, sizeof(touched));
    physicaldev = 255;
}

/* Metadata helpers query only the selection established by location_file. */
unsigned char location_kind(void) { return filesystem; }
unsigned char location_header(void) { return directorytrack; }

/* Geometry-based disk commands retain their existing whole-volume scope.
 * Subdirectories and CMD native media require separate disk-command support. */
unsigned char disk_location(const Path *p)
{
    unsigned char model;
    if (!location_file(p->dev, p->dir))
        return 0;
    model = drivemodel(p->dev, 0);
    if (p->name[0] || (p->dir[0] &&
        (model == DRIVE_1581 || strchr(p->dir, 0x5c))) || location_kind() == 1) {
        error(SYSOUT_UNSUPPORTED_DISK_FORMAT);
        return 0;
    }
    return 1;
}

#pragma code(nav_code)
#pragma data(nav_data)
/* Startup files retain their traditional location in a CMD device's selected
 * boot partition. The interactive virtual root itself never contains files. */
__noinline unsigned char bank_startup_path(Path *p)
{
    PartitionInfo info;
    unsigned char model = modelof(p->dev);
    p->dir[0] = 0;
    if (model == DRIVE_CMD_HD || model == DRIVE_CMD_FD) {
        if (!partition_info(p->dev, 255, &info) || !info.number || info.number == 255 ||
            info.type < 1 || info.type > 4)
            return 0;
        snprintf(p->dir, sizeof(p->dir), "@%u", info.number);
    }
    return 1;
}
#pragma code(code)
#pragma data(data)
