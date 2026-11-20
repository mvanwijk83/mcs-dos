/* Flat-device boundary for command unit fixtures. Directory/path semantics
 * themselves are exercised by path-resolution.js and real-ROM directories.js. */
#define PATHSIZE 128
#define CBM_T_DIR 20
#define CBM_T_CBM 21
static char working[24][128], cachedir[128];
#define location_index(d) ((d) ? (d) - 7 : 0)
#define location_list(d,p) directory(d)
#define location_file(d,p) 1
#define location_select(d,p) 1
#define location_root(d,p) 0
#define path_directory(p) 0
#define displaypath(d,p,o) uppername(p,o)
#define sameplace(a,b) ((a)->dev == (b)->dev && !strcmp((a)->dir, (b)->dir))
#define disk_location(p) 1
#define navcmd(op) ((void)0)
#define dirwalk(flags,filter) ((void)0)
#define partitionheader(d) 0
#define validate_disk(d) 1
#define nav_finish() ((void)0)
#define host_device(d) 0
#define modelof(d) 0
#define host_find(p) -2
#define host_dir(f,t,r) ((void)0)
#define host_wildcopy() ((void)0)
#define host_delete(s) ((void)0)
#define host_volume(p) ((void)0)
#define host_complete(p,s,i) 0
#define host_partfind(d,n,p) 0
#define nav_invalidate() ((void)0)
/* Legacy DISKINIT tests resolve only device specifications. */
#define canonical(d,p) 1
#define appendpart(d,p) 0
static char component[17];
