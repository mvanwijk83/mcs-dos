/* MFJ3: 32-byte committed records, contiguous immutable file payloads.
 * Directory indexes are scratch RAM, rebuilt from committed flash records.
 * $C200..$C2FF is reserved while the shell runs (not needed by BASIC). */
#define heads ((unsigned int *)0xc200)
#define nextheads ((unsigned int *)0xc250)
#define configline ((char *)nextheads)
#define LIMIT 65504U
#define CAPACITY 64000U
#define MAXFILES 40
#define HEADER 32U

/* Record header byte offsets (all words are low byte first):
 * 0-16 name and terminator; 17 file type; 18-19 payload offset;
 * 20-21 payload length; 22 read-only flag; 23 directory slot;
 * 24-25 record span; 26-27 CRC; 28 record tag; 29 record kind;
 * 30 replaced slot (255=none); 31 commit marker, programmed last.
 * Metadata-only records refer to earlier immutable payloads in the same chip. */
/* Each channel remembers immutable payload coordinates. A later replacement does not change an open reader. */
typedef struct {
    unsigned int pos, len, off; /* Position, length and flash offset of the payload. */
    unsigned char side;         /* Physical flash chip that owns this reader's data. */
    unsigned char kind;         /* 0=closed, 1=reader, 2=writer, 3=directory. */
} Channel;

static Channel channels[CART_CHANNEL_COUNT];
/* active is the mounted chip; target is the chip being written. Only one
 * writer may append at a time. writer is channel+1, or 7 for an internal
 * concatenation; zero means idle. dirty marks an abandoned/damaged tail,
 * and rotating means a replacement is waiting to seal its compacted sector. */
static unsigned char active, count, writer, error, target, mounted, failed, dirty, rotating, wslot;
static unsigned char entry[32], newtype;
static char newname[17];
static unsigned int generation, tail, livebytes, cursor, writebase, oldlen, data_crc;
/* Byte lookup avoids a bit loop on every mounted/written byte. */
static const unsigned int crc_table[] = {
    0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5, 0x60c6, 0x70e7, 0x8108, 0x9129, 0xa14a, 0xb16b,
    0xc18c, 0xd1ad, 0xe1ce, 0xf1ef, 0x1231, 0x0210, 0x3273, 0x2252, 0x52b5, 0x4294, 0x72f7, 0x62d6,
    0x9339, 0x8318, 0xb37b, 0xa35a, 0xd3bd, 0xc39c, 0xf3ff, 0xe3de, 0x2462, 0x3443, 0x0420, 0x1401,
    0x64e6, 0x74c7, 0x44a4, 0x5485, 0xa56a, 0xb54b, 0x8528, 0x9509, 0xe5ee, 0xf5cf, 0xc5ac, 0xd58d,
    0x3653, 0x2672, 0x1611, 0x0630, 0x76d7, 0x66f6, 0x5695, 0x46b4, 0xb75b, 0xa77a, 0x9719, 0x8738,
    0xf7df, 0xe7fe, 0xd79d, 0xc7bc, 0x48c4, 0x58e5, 0x6886, 0x78a7, 0x0840, 0x1861, 0x2802, 0x3823,
    0xc9cc, 0xd9ed, 0xe98e, 0xf9af, 0x8948, 0x9969, 0xa90a, 0xb92b, 0x5af5, 0x4ad4, 0x7ab7, 0x6a96,
    0x1a71, 0x0a50, 0x3a33, 0x2a12, 0xdbfd, 0xcbdc, 0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b, 0xab1a,
    0x6ca6, 0x7c87, 0x4ce4, 0x5cc5, 0x2c22, 0x3c03, 0x0c60, 0x1c41, 0xedae, 0xfd8f, 0xcdec, 0xddcd,
    0xad2a, 0xbd0b, 0x8d68, 0x9d49, 0x7e97, 0x6eb6, 0x5ed5, 0x4ef4, 0x3e13, 0x2e32, 0x1e51, 0x0e70,
    0xff9f, 0xefbe, 0xdfdd, 0xcffc, 0xbf1b, 0xaf3a, 0x9f59, 0x8f78, 0x9188, 0x81a9, 0xb1ca, 0xa1eb,
    0xd10c, 0xc12d, 0xf14e, 0xe16f, 0x1080, 0x00a1, 0x30c2, 0x20e3, 0x5004, 0x4025, 0x7046, 0x6067,
    0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d, 0xd31c, 0xe37f, 0xf35e, 0x02b1, 0x1290, 0x22f3, 0x32d2,
    0x4235, 0x5214, 0x6277, 0x7256, 0xb5ea, 0xa5cb, 0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c, 0xc50d,
    0x34e2, 0x24c3, 0x14a0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405, 0xa7db, 0xb7fa, 0x8799, 0x97b8,
    0xe75f, 0xf77e, 0xc71d, 0xd73c, 0x26d3, 0x36f2, 0x0691, 0x16b0, 0x6657, 0x7676, 0x4615, 0x5634,
    0xd94c, 0xc96d, 0xf90e, 0xe92f, 0x99c8, 0x89e9, 0xb98a, 0xa9ab, 0x5844, 0x4865, 0x7806, 0x6827,
    0x18c0, 0x08e1, 0x3882, 0x28a3, 0xcb7d, 0xdb5c, 0xeb3f, 0xfb1e, 0x8bf9, 0x9bd8, 0xabbb, 0xbb9a,
    0x4a75, 0x5a54, 0x6a37, 0x7a16, 0x0af1, 0x1ad0, 0x2ab3, 0x3a92, 0xfd2e, 0xed0f, 0xdd6c, 0xcd4d,
    0xbdaa, 0xad8b, 0x9de8, 0x8dc9, 0x7c26, 0x6c07, 0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0, 0x0cc1,
    0xef1f, 0xff3e, 0xcf5d, 0xdf7c, 0xaf9b, 0xbfba, 0x8fd9, 0x9ff8, 0x6e17, 0x7e36, 0x4e55, 0x5e74,
    0x2e93, 0x3eb2, 0x0ed1, 0x1ef0};

/* Update the journal CRC using a byte lookup table.
 *
 * crc: Running CRC-16 value.
 * v: Next byte; return the updated CRC. */
static unsigned int crcbyte(unsigned int crc, unsigned char v)
{
    unsigned int value = crc_table[(crc >> 8) ^ v];
    return (crc << 8) ^ value;
}

/* Read a byte from one filesystem flash sector through the hardware mailbox.
 *
 * side: 0=ROML chip, 1=ROMH chip.
 * at: Byte offset within its 64K sector. */
static unsigned char get(unsigned char side, unsigned int at)
{
    H[0] = 56 + (at >> 13);
    H[1] = at;
    H[2] = (side ? 0xa0 : 0x80) + ((at >> 8) & 31);
    hal(0);
    return H[3];
}

/* Program a byte in the target sector, recording the first flash failure.
 *
 * at: Byte offset within the target sector.
 * v: Byte to program; flash must already permit this transition. */
static void put(unsigned int at, unsigned char v)
{
    if (failed)
        return;
    H[0] = 56 + (at >> 13);
    H[1] = at;
    H[2] = (target ? 0xa0 : 0x80) + ((at >> 8) & 31);
    H[3] = v;
    hal(1);
    if (H[4]) {
        failed = 1;
        error = 25;
    }
}

/* Read a little-endian 16-bit value from flash.
 *
 * side: Flash chip selector.
 * at: Offset of the low byte, with room for two bytes. */
static unsigned int word(unsigned char side, unsigned int at)
{
    unsigned int v = get(side, at);
    return v | ((unsigned int)get(side, at + 1) << 8);
}

/* Program a little-endian 16-bit value in the target sector.
 *
 * at: Offset of the low byte.
 * v: Value to program. */
static void putword(unsigned int at, unsigned int v)
{
    put(at, v);
    put(at + 1, v >> 8);
}

/* Load a complete 32-byte journal header into the shared entry buffer.
 *
 * side: Flash chip selector.
 * at: Record header offset. */
static void readentry(unsigned char side, unsigned int at)
{
    unsigned char i;
    for (i = 0; i < 32; ++i)
        entry[i] = get(side, at + i);
}

/* Load the latest committed header for a live directory slot.
 *
 * slot: Directory slot with a nonzero heads entry. */
static void record(unsigned char slot)
{
    readentry(active, heads[slot]);
}

/* Decode a little-endian field in the shared entry buffer.
 *
 * at: Low-byte offset, less than 31. */
static unsigned int eword(unsigned char at)
{
    return entry[at] | ((unsigned int)entry[at + 1] << 8);
}

/* Find an exact live filename and leave its header in entry; return slot or -1.
 *
 * name: Native terminated filename. */
static int find(const char *name)
{
    unsigned char i;
    for (i = 0; i < 40; ++i)
        if (heads[i]) {
            record(i);
            if (!strcmp((char *)entry, name))
                return i;
        }
    return -1;
}

/* Match a filename using * and ? with iterative retry after the last star.
 *
 * p: Wildcard pattern.
 * s: Native filename; return nonzero on a complete match. */
static unsigned char matches(const char *p, const char *s)
{
    const char *star = 0, *retry = 0;
    while (*s) {
        if (*p == '?' || *p == *s) {
            ++p;
            ++s;
        } else if (*p == '*') {
            star = ++p;
            retry = s;
        } else if (star) {
            p = star;
            s = ++retry;
        } else
            return 0;
    }
    while (*p == '*')
        ++p;
    return !*p;
}

/* Calculate a record CRC over payload and protected metadata, excluding CRC and commit fields.
 *
 * side: Flash chip selector.
 * at: Record header offset.
 * span: Total record bytes, including its 32-byte header. */
static unsigned int recordcrc(unsigned char side, unsigned int at, unsigned int span)
{
    unsigned int crc = 0xffff, i;
    for (i = 32; i < span; ++i)
        crc = crcbyte(crc, get(side, at + i));
    for (i = 0; i < 26; ++i)
        crc = crcbyte(crc, get(side, at + i));
    for (i = 28; i < 31; ++i)
        crc = crcbyte(crc, get(side, at + i));
    return crc;
}

/* Apply the loaded record to the directory index, including rename replacement or deletion.
 *
 * at: Offset of the record whose header is in entry. */
static void apply(unsigned int at)
{
    unsigned char slot = entry[23], drop = entry[30];
    /* A rename can replace a different slot in the same committed metadata record. */
    if (drop < 40)
        heads[drop] = 0;
    heads[slot] = entry[29] == 3 ? 0 : at;
}

/* Recompute live file count and payload bytes from the current directory index. */
static void totals(void)
{
    unsigned char i;
    count = 0;
    livebytes = 0;
    for (i = 0; i < 40; ++i)
        if (heads[i]) {
            ++count;
            livebytes += word(active, heads[i] + 20);
        }
}

/* An incomplete append ends the usable log. It never hides earlier records.
 * Damage inside the sealed compaction prefix invalidates the entire sector.
 *
 * Validate the sector header; return its sealed-prefix end, or zero for an invalid header.
 *
 * side: Flash chip selector. */
static unsigned int headerend(unsigned char side)
{
    unsigned int crc = 0xffff, base;
    unsigned char i;
    if (get(side, 0) != 77 || get(side, 1) != 70 || get(side, 2) != 74 || get(side, 3) != 3 ||
        get(side, 15) != 0xa5)
        return 0;
    for (i = 0; i < 8; ++i)
        crc = crcbyte(crc, get(side, i));
    base = word(side, 6);
    return crc == word(side, 8) && base >= 32 && base <= LIMIT ? base : 0;
}

/* Rebuild the directory from committed records; reject damage inside the sealed prefix.
 *
 * side: Flash chip selector; return nonzero if the sector can be mounted. */
static unsigned char scan(unsigned char side)
{
    unsigned int base = headerend(side), at = 32, span, off, len;
    memset(heads, 0, 80);
    dirty = 0;
    if (!base)
        return 0;
    while (at <= LIMIT - 32) {
        readentry(side, at);
        if (entry[0] == 255 && entry[28] == 255)
            break;
        span = eword(24);
        off = eword(18);
        len = eword(20);
        /* Validate lengths and references before reading payloads or changing the directory index. */
        if (span < 32 || span > LIMIT - at || entry[28] != 74 || entry[31] != 0xa5 ||
            entry[23] >= 40 || entry[29] < 1 || entry[29] > 3 || !entry[0] || entry[16] ||
            entry[22] > 1 || (entry[30] != 255 && (entry[30] >= 40 || entry[30] == entry[23])) ||
            (entry[29] == 1 && (off != at + 32 || len != span - 32)) ||
            (entry[29] != 1 && span != 32) || len > CAPACITY ||
            (entry[29] == 2 && (off < 32 || off > at || len > at - off)) ||
            recordcrc(side, at, span) != eword(26)) {
            dirty = 1;
            break;
        }
        apply(at);
        at += span;
        if (at > base && at - span < base)
            return 0;
    }
    tail = at;
    return at >= base;
}

/* Select the newest valid filesystem sector, falling back only if its sealed prefix is damaged. */
static void mount(void)
{
    unsigned char a, b;
    memset(channels, 0, sizeof(channels));
    mounted = writer = error = failed = rotating = 0;
    a = headerend(0) != 0;
    b = headerend(1) != 0;
    if (!a && !b) {
        error = 74;
        count = 0;
        livebytes = 0;
        return;
    }
    /* Unsigned generation differences handle wraparound of the 16-bit generation counter. */
    active = b && (!a || (unsigned int)(word(1, 4) - word(0, 4)) < 32768U);
    if (!scan(active)) {
        active ^= 1;
        if (!(active ? b : a) || !scan(active)) {
            error = 74;
            return;
        }
    }
    generation = word(active, 4);
    totals();
    mounted = 1;
}

/* Append a payload byte and update its running CRC.
 *
 * v: Byte to write at cursor in the target sector. */
static void payload(unsigned char v)
{
    data_crc = crcbyte(data_crc, v);
    put(cursor++, v);
}

/* Write and verify record metadata, then publish its commit byte last.
 *
 * slot: Directory slot being updated.
 * kind: 1=payload, 2=metadata, 3=deletion.
 * drop: Replaced directory slot, or 255 for none.
 * off: Payload offset.
 * len: Payload length. */
static void finishrecord(unsigned char slot, unsigned char kind, unsigned char drop,
                         unsigned int off, unsigned int len)
{
    unsigned char i;
    unsigned int crc = data_crc, span = cursor - writebase;
    entry[18] = off;
    entry[19] = off >> 8;
    entry[20] = len;
    entry[21] = len >> 8;
    entry[23] = slot;
    entry[24] = span;
    entry[25] = span >> 8;
    entry[28] = 74;
    entry[29] = kind;
    entry[30] = drop;
    for (i = 0; i < 26; ++i) {
        crc = crcbyte(crc, entry[i]);
        put(writebase + i, entry[i]);
    }
    for (i = 28; i < 31; ++i) {
        crc = crcbyte(crc, entry[i]);
        put(writebase + i, entry[i]);
    }
    putword(writebase + 26, crc);
    if (failed || recordcrc(target, writebase, span) != crc) {
        failed = 1;
        error = 25;
        return;
    }
    /* The final marker makes the record visible. A partial write leaves the old file live. */
    put(writebase + 31, 0xa5);
    if (get(target, writebase + 31) != 0xa5) {
        failed = 1;
        error = 25;
    }
}

/* Verify and commit a compacted sector header only after its records have been written. */
static void seal(void)
{
    unsigned char i;
    unsigned int crc = 0xffff;
    put(0, 77);
    put(1, 70);
    put(2, 74);
    put(3, 3);
    putword(4, generation + 1);
    putword(6, cursor);
    for (i = 0; i < 8; ++i)
        crc = crcbyte(crc, get(target, i));
    putword(8, crc);
    if (word(target, 4) != generation + 1 || word(target, 6) != cursor || word(target, 8) != crc) {
        failed = 1;
        error = 25;
    }
    /* Publish the new sector only after all copied records and header fields are verified. */
    put(15, 0xa5);
    if (get(target, 15) != 0xa5) {
        failed = 1;
        error = 25;
    }
}

/* Publish the newly sealed sector and its rebuilt directory index in RAM. */
static void activate(void)
{
    active = target;
    ++generation;
    memcpy(heads, nextheads, 80);
    tail = cursor;
    dirty = rotating = 0;
    totals();
}

/* pending=1 moves an in-progress write as well, but leaves the new sector
 * unsealed until that file closes successfully. The old filesystem survives.
 *
 * Copy live data to the other flash sector; return zero if safe compaction is impossible.
 *
 * pending: Nonzero includes the unfinished write and defers sealing until it closes. */
static unsigned char compact(unsigned char pending)
{
    unsigned char i, source = active;
    unsigned int part = cursor - writebase - 32, partoff = writebase + 32, partcrc = data_crc;
    unsigned int off, len, j, start;
    if (rotating) {
        error = 72;
        failed = 1;
        return 0;
    }
    target = active ^ 1;
    /* A reader may still use the old chip after compaction. Do not erase a chip it references. */
    for (i = 0; i < CART_CHANNEL_COUNT; ++i)
        if (channels[i].kind == 1 && channels[i].side == target) {
            error = 60;
            failed = 1;
            return 0;
        }
    H[0] = 56;
    H[2] = target ? 0xa0 : 0x80;
    hal(2);
    if (H[4]) {
        error = 25;
        failed = 1;
        return 0;
    }
    /* Build a separate index while copying; heads must keep describing the committed filesystem. */
    memset(nextheads, 0, 80);
    cursor = 32;
    for (i = 0; i < 40; ++i)
        if (heads[i] && (!pending || i != wslot)) {
            record(i);
            off = eword(18);
            len = eword(20);
            start = cursor;
            writebase = cursor;
            cursor += 32;
            data_crc = 0xffff;
            for (j = 0; j < len; ++j)
                payload(get(source, off + j));
            finishrecord(i, 1, 255, start + 32, len);
            if (failed)
                return 0;
            nextheads[i] = start;
        }
    /* An unfinished replacement stays unpublished until close seals the complete new sector. */
    if (pending) {
        rotating = 1;
        writebase = cursor;
        cursor += 32;
        data_crc = 0xffff;
        put(writebase + 28, 74);
        for (j = 0; j < part; ++j)
            payload(get(source, partoff + j));
        if (data_crc != partcrc) {
            error = 25;
            failed = 1;
        }
    } else {
        seal();
        if (!failed)
            activate();
    }
    return !failed;
}

/* Reserve a fresh record header, compacting damaged or full tails; reject concurrent writers. */
static unsigned char prepare(void)
{
    if (writer) {
        error = 60;
        return 0;
    }
    failed = rotating = 0;
    if ((dirty || tail > LIMIT - 32) && !compact(0))
        return 0;
    target = active;
    writebase = tail;
    cursor = tail + 32;
    data_crc = 0xffff;
    put(writebase + 28, 74);
    if (failed)
        dirty = 1;
    return !failed;
}

/* Check capacity before appending, moving an unfinished write if its sector fills.
 *
 * n: Additional payload bytes needed; return nonzero if space is available. */
static unsigned char reserve(unsigned int n)
{
    unsigned int length = cursor - writebase - 32;
    /* Count live files plus the new payload, subtracting the version this write replaces. */
    if (n > CAPACITY - (livebytes - oldlen) - length) {
        error = 72;
        failed = 1;
        return 0;
    }
    if (n > LIMIT - cursor && !compact(1))
        return 0;
    return !failed;
}

/* Abandon the unfinished record; mark the tail dirty so it is compacted before reuse. */
static void abortwrite(void)
{
    dirty = 1;
    writer = 0;
    rotating = 0;
}

/* Choose a destination slot and begin an unpublished replacement record.
 *
 * index: Existing file slot, or negative for a new file.
 * name: Native destination filename.
 * type: Commodore file type; return nonzero on success. */
static unsigned char startwrite(int index, const char *name, unsigned char type)
{
    unsigned char i;
    if (index < 0) {
        for (i = 0; i < 40 && heads[i]; ++i)
            ;
        if (i == 40) {
            error = 72;
            return 0;
        }
        index = i;
    }
    if (!prepare())
        return 0;
    wslot = index;
    oldlen = heads[wslot] ? word(active, heads[wslot] + 20) : 0;
    strcpy(newname, name);
    newtype = type;
    writer = 7;
    return 1;
}

/* Commit the finished file and, if necessary, its compacted sector; keep old data on failure. */
static void completewrite(void)
{
    unsigned int len = cursor - writebase - 32;
    memset(entry, 0, 32);
    strcpy((char *)entry, newname);
    entry[17] = newtype;
    if (!failed)
        finishrecord(wslot, 1, 255, writebase + 32, len);
    /* Sealing during close makes compaction and the replacement one recoverable operation. */
    if (!failed && rotating) {
        nextheads[wslot] = writebase;
        seal();
        if (!failed)
            activate();
    } else if (!failed) {
        heads[wslot] = writebase;
        tail = cursor;
        totals();
    }
    if (failed)
        abortwrite();
    writer = 0;
}

/* Commit a metadata-only record and update the live directory after verification.
 *
 * slot: Directory slot to update.
 * kind: Metadata or deletion record type.
 * drop: Replaced slot, or 255 for none. */
static void metadata(unsigned char slot, unsigned char kind, unsigned char drop)
{
    finishrecord(slot, kind, drop, eword(18), eword(20));
    if (failed) {
        dirty = 1;
        return;
    }
    apply(writebase);
    tail = cursor;
    totals();
}
