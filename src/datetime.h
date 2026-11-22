#ifndef MCS_DATETIME_H
#define MCS_DATETIME_H
/* Locale payload is exactly six bytes; on-disk identifiers are ASCII. */
typedef struct LocaleFormat {
    unsigned char order, thousands, decimal, datesep, timesep, hours;
} LocaleFormat;
typedef struct DateTime {
    unsigned int year;
    unsigned char month, day, hour, minute, second;
} DateTime;
extern LocaleFormat locale;
extern char locale_code[7];
extern unsigned char dir_dates;
extern unsigned char clockkind, clockdevice;
void locale_startup(void);
void nlscmd(void);
void clockcmd(unsigned char time, const char *tail);
void clock_config(const char *value);
unsigned char datetime_valid(const DateTime *dt);
unsigned char date_parse(const char *s, DateTime *dt);
unsigned char time_parse(const char *s, DateTime *dt);
void date_format(const DateTime *dt, char *out);
void time_format(const DateTime *dt, char *out);
void file_timestamp(const char *name, unsigned char native);
struct DirectoryEntry;
unsigned char timestamp_read(unsigned char lfn, struct DirectoryEntry *entry);
void timestamp_print(const DateTime *dt);
/* Pure protocol parser shared by the RTC and directory adapters. */
unsigned char cmd_datetime(const char *s, DateTime *dt, unsigned char seconds);
unsigned char date_weekday(const DateTime *dt);
#endif
