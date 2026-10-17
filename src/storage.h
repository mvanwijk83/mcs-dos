#ifndef MCS_STORAGE_H
#define MCS_STORAGE_H

/* Physical models are independent of the currently selected medium format. */
#define DRIVE_1541 1
#define DRIVE_1571 2
#define DRIVE_1581 3
#define DRIVE_1541II 4
#define DRIVE_1570 5
#define DRIVE_CMD_HD 6
#define DRIVE_CMD_FD 7
#define DRIVE_SOFTIEC 8
#define DRIVE_SD2IEC 9

typedef struct PartitionInfo {
    unsigned char number, type;
    char name[17];
    unsigned long bytes;
} PartitionInfo;

/* Public services enter the storage bank; implementations share DOS-channel
 * file transfers, but own identification, medium geometry and drive modes. */
/* report=0 is quiet; report=1 reports unidentified devices. */
unsigned char drivemodel(unsigned char dev, unsigned char report);
unsigned char drivepresent(unsigned char dev);
unsigned char drivemode(unsigned char dev, unsigned char doublesided);

/* Private backend entry points, called only within the storage bank. */
unsigned char cbm_model(unsigned char dev);
unsigned char cbm_geometry(unsigned char model);
unsigned char cbm_mode(unsigned char dev, unsigned char model, unsigned char doublesided);
unsigned char cmd_model(unsigned char dev);
unsigned char sd_model(unsigned char dev);
unsigned char cmd_partition(unsigned char dev, unsigned char number, PartitionInfo *info);
void cmd_geometry(unsigned char dev, unsigned char report, unsigned char *geometry);
unsigned char cmd_select(unsigned char dev, unsigned char number);
unsigned char cmd_root(unsigned char dev);
unsigned char cmd_lookup(unsigned char dev, const char *name, PartitionInfo *info);

struct Path;
unsigned char partition_root(unsigned char dev);
unsigned char partition_info(unsigned char dev, unsigned char number, PartitionInfo *info);
unsigned char startup_path(struct Path *p);
extern char startupdir[];
unsigned char partition_lookup(unsigned char dev, const char *name, PartitionInfo *info);

/* Locations use an empty directory string for the root. Only explicit CD
 * changes working[]. All other transitions are temporary until nav_finish. */
unsigned char location_index(unsigned char dev);
unsigned char location_select(unsigned char dev, const char *dir);
unsigned char location_file(unsigned char dev, const char *dir);
unsigned char location_root(unsigned char dev, const char *dir);
unsigned char location_list(unsigned char dev, const char *dir);
unsigned char path_directory(struct Path *p);
unsigned char path_join(struct Path *p);
unsigned char sameplace(const struct Path *a, const struct Path *b);
unsigned char location_kind(void);
unsigned char location_header(void);
unsigned char fileentry(const struct Path *p);
extern unsigned char entrytrack, entrysector, entryoffset;
void navcmd(unsigned char operation);
void dirwalk(unsigned char flags, unsigned char filter);
void nav_finish(void);
void nav_invalidate(void);
void nav_reset(void);
unsigned char disk_location(const struct Path *p);
unsigned char partitionheader(unsigned char dev);
unsigned char validate_disk(unsigned char dev);

#endif
