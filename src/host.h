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
/* Per-entry reporting data, discarded after printing; no filesystem cache. */
typedef struct HostInfo {
    unsigned long bytes;
    unsigned char known, kind;
} HostInfo;
/* Temporary Ultimate DIR records. Their storage is borrowed only while DIR
 * owns the ordinary directory array; no results survive the command. */
typedef struct HostRecord {
    char name[17];
    unsigned long bytes, ordinal;
    unsigned char type, known, kind;
} HostRecord;
unsigned char ultimate_dir(unsigned char flags, unsigned char filter, unsigned char recursive);
unsigned char softiec_list(const struct Path *p, HostRecord *records, unsigned char count, char *names);
void host_row(const struct DirectoryEntry *entry, unsigned char model, unsigned char flags,
              unsigned char partitions, unsigned char *col, const HostInfo *info);
void host_footer(unsigned int files, unsigned int dirs, unsigned long total, unsigned char summary);
extern unsigned long softiec_file_size;
extern unsigned char softiec_file_kind;
unsigned char softiec_metadata(const struct Path *p, const char *name);
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
