#ifndef MCS_HOST_H
#define MCS_HOST_H
#include "storage.h"
/* Host directories are streamed, with no directory cache or entry-count limit. */
#define FS_HOST 5
struct Path;
struct DirectoryEntry;
typedef struct HostCursor {
    unsigned char dev, lfn, model, partitions, done;
} HostCursor;
unsigned char host_device(unsigned char dev);
unsigned char host_select(unsigned char dev, const char *dir, unsigned char model);
unsigned char host_partfind(unsigned char dev, const char *name, PartitionInfo *info);
unsigned char host_open(const struct Path *p, HostCursor *cursor, unsigned char lfn, unsigned char hidden);
unsigned char host_next(HostCursor *cursor, struct DirectoryEntry *entry);
int host_find(const struct Path *p);
unsigned char host_complete(const struct Path *p, const char *prefix, unsigned int *index);
void host_dir(unsigned char flags, unsigned char filter, unsigned char recursive);
void host_volume(const struct Path *p);
void host_wildcopy(void);
void host_delete(unsigned char suppress);
unsigned char host_remove(struct Path *p, unsigned char recursive);
unsigned char softiec_target(void);
void softiec_rename(void);
#endif
