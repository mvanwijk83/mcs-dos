#include "core.h"

Substitution substitutions[SUBST_COUNT];
static unsigned char subst_checked[SUBST_COUNT];
unsigned char subst_validating;
char subst_error[64];

/* Capture diagnostics while validating a new mapping. Missing directories
 * share SUBST's Invalid path wording; syntax, length and I/O errors survive. */
void subst_diagnostic(const char *message)
{
    /* diskstatus reports a heading followed by the actual CBM DOS status. */
    if (!strcmp(message, SYSOUT_DISK_ERR))
        return;
    if (subst_error[0])
        return;
    if (!strcmp(message, SYSOUT_PARTITION_NOT_FOUND) ||
        !strcmp(message, SYSOUT_DIRECTORY_NOT_FOUND) ||
        !strcmp(message, SYSOUT_PATH_NOT_FOUND) ||
        !strcmp(message, SYSOUT_FILE_NOT_FOUND) ||
        !strcmp(message, SYSOUT_SUBDIRECTORIES_NOT_SUPPORTED) ||
        !strncmp(message, "62,", 3))
        message = SYSOUT_INVALID_PATH;
    strncpy(subst_error, message, sizeof(subst_error) - 1);
    subst_error[sizeof(subst_error) - 1] = 0;
}

/* Lookups never touch the bus; physical-device enumeration stays physical. */
Substitution *subst_find(unsigned char dev)
{
    unsigned char i;
    if (dev)
        for (i = 0; i < SUBST_COUNT; ++i)
            if (substitutions[i].dev == dev)
                return substitutions + i;
    return 0;
}

/* Discard the old path as well, so a newly attached disk starts at its root. */
void subst_remove(unsigned char dev)
{
    Substitution *s = subst_find(dev);
    if (s) {
        s->dev = 0;
        working[location_index(dev)][0] = 0;
        nav_invalidate();
    }
}

/* A command owns its resolved locations until completion. Probe each alias
 * at most once, before resolving it, rather than during file streaming. */
void subst_begin(void)
{
    memset(subst_checked, 0, sizeof(subst_checked));
}

Substitution *subst_check(unsigned char dev)
{
    Substitution *s = subst_find(dev);
    if (s && !subst_checked[s - substitutions]) {
        subst_checked[s - substitutions] = 1;
        if (drivepresent(dev)) {
            subst_remove(dev);
            s = (Substitution *)0;
        }
    }
    return s;
}

/* The suffix is the logical current directory, relative to the alias root. */
const char *subst_cwd(unsigned char dev)
{
    Substitution *s = subst_find(dev);
    const char *dir = working[location_index(dev)];
    if (s) {
        dir += s->length;
        if (*dir == 0x5c)
            ++dir;
    }
    return dir;
}

/* Normalize logical dot/parent components before calling this resident helper.
 * Physical paths are published once, so all backends and identity checks agree. */
unsigned char subst_resolve(Path *p)
{
    Substitution *s = subst_find(p->dev);
    char full[PATHSIZE];
    unsigned int n;
    p->logical = p->dev;
    if (!s)
        return 1;
    n = s->length;
    if (n + !!(n && p->dir[0]) + strlen(p->dir) + !!((n || p->dir[0]) && p->name[0]) +
        strlen(p->name) + 1 >= PATHSIZE) {
        error(SYSOUT_PATH_TOO_LONG);
        return 0;
    }
    memcpy(full, working[location_index(s->dev)], n);
    if (n && p->dir[0])
        full[n++] = 0x5c;
    strcpy(full + n, p->dir);
    strcpy(p->dir, full);
    p->dev = s->target;
    return 1;
}

/* Metadata-changing commands must reject aliases before touching a backend. */
unsigned char subst_guard(const Path *p, const char *message)
{
    if (subst_find(p->logical)) {
        error(message);
        return 0;
    }
    return 1;
}

/* Even though its physical name is a directory, the alias root is a drive. */
unsigned char subst_root(const Path *p)
{
    Substitution *s = subst_find(p->logical);
    return s && !p->name[0] && strlen(p->dir) == s->length;
}

/* Preserve virtual drive paths in headings and recursive/bare listings. */
const char *pathdir(const Path *p)
{
    Substitution *s = subst_find(p->logical);
    const char *dir = p->dir;
    if (s) {
        if (strlen(dir) < s->length)
            return "";
        dir += s->length;
        if (*dir == 0x5c)
            ++dir;
    }
    return dir;
}

void pathdisplay(const Path *p, char *dst)
{
    if (subst_find(p->logical))
        uppername(pathdir(p), dst);
    else
        displaypath(p->dev, p->dir, dst);
}

#pragma code(volume_code)
#pragma data(volume_data)

/* Parse a destination without probing/normalizing its remembered directory. */
static unsigned char subst_device(const char *text)
{
    unsigned int dev = 0;
    if (text[0] && text[1] == ':' && !text[2] &&
        toupper(text[0]) >= 'A' && toupper(text[0]) <= 'W')
        return toupper(text[0]) - 'A' + 8;
    if (!isdigit(*text))
        return 0;
    while (isdigit(*text)) {
        dev = dev * 10 + *text++ - '0';
        if (dev > 30)
            return 0;
    }
    return dev >= 8 && *text == ':' && !text[1] ? dev : 0;
}

/* Five assignments reuse the existing per-drive path storage. Creation is
 * transactional: validation finishes before any record or cwd is changed. */
__noinline void bank_substcmd(void)
{
    unsigned char dev, i, ok;
    Substitution *s;
    char target[PATHSIZE];
    if (argc == 1) {
        for (dev = 8; dev <= 30; ++dev) {
            s = subst_check(dev);
            if (!s)
                continue;
            memcpy(target, working[location_index(dev)], s->length);
            target[s->length] = 0;
            displaypath(s->target, target, io);
            outs(drivename(dev));
            outs(": => ");
            outs(drivename(s->target));
            outc(':');
            outc(0x5c);
            say(io);
        }
        return;
    }
    if (argc != 3) {
        error(SYSOUT_SYNTAX_SUBST);
        return;
    }
    dev = subst_device(args[1]);
    if (!dev) {
        error(SYSOUT_INVALID_DRIVE_SPEC);
        return;
    }
    s = subst_check(dev);
    if (!stricmp(args[2], "/D")) {
        if (!s || dev == drive)
            error(SYSOUT_INVALID_DRIVE_SPEC);
        else
            subst_remove(dev);
        return;
    }
    if (s || dev == drive || drivepresent(dev) || mount_active(dev)) {
        error(SYSOUT_INVALID_DRIVE_SPEC);
        return;
    }
    for (i = 0; i < SUBST_COUNT && substitutions[i].dev; ++i) {
    }
    if (i == SUBST_COUNT) {
        error(SYSOUT_SUBST_FULL);
        return;
    }
    subst_error[0] = 0;
    subst_validating = 1;
    ok = path(args[2], &p1) && !strpbrk(p1.name, "*?") &&
         path_directory(&p1) && !p1.name[0] && location_select(p1.dev, p1.dir);
    subst_validating = 0;
    if (!ok) {
        error(subst_error[0] ? subst_error : SYSOUT_INVALID_PATH);
        return;
    }
    if (p1.dev == dev) {
        error(SYSOUT_INVALID_DRIVE_SPEC);
        return;
    }
    s = substitutions + i;
    s->target = p1.dev;
    s->length = strlen(p1.dir);
    strcpy(working[location_index(dev)], p1.dir);
    s->dev = dev;
    subst_checked[i] = 1;
}
