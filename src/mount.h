#ifndef MCS_MOUNT_H
#define MCS_MOUNT_H
/* One SD2IEC mount and the Ultimate's two emulated drives. All fields are
 * bytes, so the persisted representation contains no pointers or padding. */
#define MOUNT_COUNT 3
#define MOUNT_RECORD_SIZE 149
#define MOUNT_STATE_SIZE 575
typedef struct MountRecord {
    unsigned char dev, source, model, type;
    char dir[128], name[17];
} MountRecord;
extern MountRecord mounts[MOUNT_COUNT];
extern char mount_hostdir[128];
extern unsigned char mount_bypass;
struct Path;
unsigned char imagekind(const char *name);
const char *imageformat(unsigned char kind);
const char *imagetype(const char *name, unsigned char type);
unsigned char mount_active(unsigned char dev);
unsigned char mount_geometry(unsigned char dev);
void mountcmd(unsigned char unmount);
unsigned char mount_select(unsigned char dev, const char *dir);
void mount_invalidate(void);
void mount_reset(void);
void mount_restore(void);
unsigned char mount_guard(const struct Path *p);
unsigned char softiec_mount(const struct Path *p, unsigned char dev, unsigned char unmount);
unsigned char ultimate_drive(unsigned char dev);
#endif
