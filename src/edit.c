/* Full-screen text editing and command-line input. EDIT owns the shared
 * workspace only while active; other commands may reuse it between edits. */
#include "core.h"
#pragma code(edit_code)
#pragma data(edit_data)
__noinline unsigned char bank_input(char *buf, unsigned int max, unsigned char recall);
__noinline void bank_rawedit(unsigned char pos, unsigned char len, unsigned char deleting);
__noinline void bank_editstatus(void);
__noinline void bank_editsaving(void);
__noinline void bank_editnumber(unsigned int address, unsigned char n);
__noinline void bank_renderedit(void);
__noinline void bank_editcmd(void);

/* Locate one string in the packed F1..F7 table. */
__noinline char *bank_keytext(char *table, unsigned char key)
{
    while (--key)
        table += strlen(table) + 1;
    return table;
}

/* Recognize KEY's option boundaries without splitting commands such as DIR/W. */
__noinline unsigned char bank_keyswitch(const char *s)
{
    return *s == '/' && ((toupper(s[1]) == 'F' && s[2] >= '0' && s[2] <= '9') ||
                         !strnicmp(s, "/CLEAR", 6));
}

/* Display only bound keys, using the same layout for lists and individual queries. */
__noinline void bank_keyshow(char *table, unsigned char key)
{
    char *text = bank_keytext(table, key);
    if (*text)
        print("  F%u  %s\n", (unsigned int)key, text);
}

/* Apply a complete KEY request to a scratch copy before publishing any changes.
 * Commands remain unparsed so spaces, quotes and filename switches survive. */
__noinline void bank_keycmd(const char *s)
{
    char *table = workspace, *old, *last;
    const char *text, *end, *next;
    unsigned int used, before, size, length;
    unsigned char key, quoted, clearing;
    while (*s == ' ')
        ++s;
    if (!*s) {
        for (key = 1; key <= FUNCTIONKEYS; ++key)
            bank_keyshow(keybindings, key);
        return;
    }
    memcpy(table, keybindings, KEYBUFSIZE);
    while (*s) {
        clearing = 0;
        if (!strnicmp(s, "/CLEAR", 6)) {
            s += 6;
            if (!*s || *s == ' ') {
                memset(table, 0, KEYBUFSIZE);
                while (*s == ' ')
                    ++s;
                continue;
            }
            if (*s++ != ':' || *s < '1' || *s > '7' || (s[1] && s[1] != ' '))
                goto invalid;
            key = *s++ - '0';
            clearing = 1;
            text = end = s;
        } else {
            if (*s != '/' || toupper(s[1]) != 'F' || s[2] < '1' || s[2] > '7' ||
                (s[3] && s[3] != ':' && s[3] != ' '))
                goto invalid;
            key = s[2] - '0';
            s += 3;
            if (*s == ':')
                ++s;
            while (*s == ' ')
                ++s;
            if (!*s || bank_keyswitch(s)) {
                bank_keyshow(table, key);
                continue;
            }
            text = end = s;
            quoted = 0;
            while (*end) {
                if (*end == '"')
                    quoted = !quoted;
                if (*end == ' ' && !quoted) {
                    next = end;
                    while (*next == ' ')
                        ++next;
                    if (bank_keyswitch(next))
                        break;
                }
                ++end;
            }
            s = end;
            while (end > text && end[-1] == ' ')
                --end;
        }
        length = clearing ? 0 : end - text;
        if (length >= LINE) {
            error(SYSOUT_KEY_TOO_LONG);
            return;
        }
        old = bank_keytext(table, key);
        last = bank_keytext(table, FUNCTIONKEYS);
        used = last - table + strlen(last) + 1;
        before = old - table;
        size = strlen(old) + 1;
        if (used - size + length + 1 > KEYBUFSIZE) {
            error(SYSOUT_KEY_FULL);
            return;
        }
        memmove(old + length + 1, old + size, used - before - size);
        memcpy(old, text, length);
        old[length] = 0;
        while (*s == ' ')
            ++s;
    }
    memcpy(keybindings, table, KEYBUFSIZE);
    return;
invalid:
    error(SYSOUT_INVALID_SWITCH);
}

/* Clear and select the reverse-video editor status line. */
__noinline void bank_editstatus(void)
{
    ox = 0;
    oy = 24;
    gotoxy(0, 24);
    screen_reverse(1);
    screen_clear(40);
}

/* Show the saving message in the editor status line. */
__noinline void bank_editsaving(void)
{
    bank_editstatus();
    outs(SYSOUT_SAVING);
}

/* Only these two reverse-video digit cells change while editing.
 *
 * Update a two-digit counter directly in reverse-video screen cells.
 *
 * address: Screen address of the first digit.
 * n: Value to display as two digits (0-99). */
__noinline void bank_editnumber(unsigned int address, unsigned char n)
{
    POKE(address, 176 + n / 10);
    POKE(address + 1, 176 + n % 10);
}

/* Redraw the 24 editable rows from the shared editor buffer. */
__noinline void bank_renderedit(void)
{
    unsigned char r, c;
    for (r = 0; r < EDITROWS; ++r) {
        gotoxy(0, r);
        for (c = 0; c < 40; ++c)
            displayc(editbuf[(unsigned int)r * 40 + c]);
    }
}

/* Run EDIT: load bounded text, handle editing keys, and save only after confirmation. */
__noinline void bank_editcmd(void)
{
    unsigned int pos = 0, idx, last, filled;
    unsigned char x = 0, y = 0, c, prevcr = 0, overflow = 0, r, end, wrapped = 0, redraw;
    int n = 0, i, exists = -1;
    clock_t blink;
    unsigned char visible, oldx, oldy, insertheld = 0, insertdown;
    p1.dev = drive;
    p1.name[0] = 0;
    for (i = 1; i < argc; ++i) {
        if (args[i][0] == '/') {
            error(SYSOUT_INVALID_SWITCH);
            return;
        } else if (p1.name[0]) {
            say(SYSOUT_TOO_MANY_PARAMS);
            return;
        } else if (!path(args[i], &p1))
            return;
    }
    memset(editbuf, ' ', sizeof(editbuf));
    if (p1.name[0]) {
        cachevalid = 0;
        exists = findfile(&p1);
        if (exists == -2)
            return;
        if (exists >= 0) {
            if (directory_entries[exists].type != CBM_T_SEQ) {
                say(SYSOUT_UNSUPPORTED_FILE_TYPE);
                return;
            }
            if (!openreadtype(&p1, 2, CBM_T_SEQ))
                return;
            while (!overflow && (n = readio(2, io, 256)) > 0)
                for (i = 0; i < n; ++i) {
                    c = io[i];
                    if (c == 10 && prevcr) {
                        prevcr = 0;
                        continue;
                    }
                    prevcr = c == 13;
                    if (c == 10 || c == 13) {
                        /* A full row has already advanced to the next row. */
                        if (!wrapped) {
                            pos = (pos / 40 + 1) * 40;
                            x = 0;
                        }
                        wrapped = 0;
                        if (pos > sizeof(editbuf)) {
                            overflow = 1;
                            break;
                        }
                    } else {
                        if (pos >= sizeof(editbuf)) {
                            overflow = 1;
                            break;
                        }
                        editbuf[pos++] = (c >= 32 && (c < 128 || c >= 160)) ? c : '.';
                        x = pos % 40;
                        wrapped = !x;
                    }
                }
            channel_close(2);
            if (overflow || n < 0) {
                say(SYSOUT_FILE_TOO_LARGE_OR_UNREADABLE);
                return;
            }
        }
    }
    clear();
    bank_renderedit();
    x = y = 0;
    textcursor(0);
    caret_init();
    bank_editstatus();
    outs(SYSOUT_EDIT_INITIAL_POS);
    if (p1.name[0]) {
        uppername(p1.name, statusbuf);
        outs(statusbuf);
    } else
        outs(SYSOUT_UNTITLED);
    /* Leave one trailing space; the longest filename still has two before it. */
    ox = 26;
    outs(SYSOUT_RUN_STOP_QUIT);
    screen_reverse(0);
    for (;;) {
        caret_show(x, y);
        visible = 1;
        blink = clock();
        for (;;) {
            /* KERNAL suppresses CTRL+INST/DEL ($FF in its control table).
             * Read the scanned key index instead; trigger once per press. */
            insertdown = (PEEK(197) == 0 && (PEEK(653) & 4));
            if (insertdown && !insertheld) {
                insertheld = 1;
                c = 0;
                break;
            }
            insertheld = insertdown;
            if (kbhit()) {
                c = getch();
                break;
            }
            if ((clock_t)(clock() - blink) >= CLOCKS_PER_SEC / 2) {
                visible = !visible;
                blink = clock();
                if (visible)
                    caret_show(x, y);
                else
                    caret_hide();
            }
        }
        caret_hide();
        idx = (unsigned int)y * 40 + x;
        redraw = 0;
        if (c == CH_STOP)
            break;
        oldx = x;
        oldy = y;
        if (c == CH_CURS_LEFT) {
            if (x)
                --x;
            else if (y) {
                --y;
                x = 39;
            }
        } else if (c == CH_CURS_RIGHT) {
            if (x < 39)
                ++x;
            else if (y < 23) {
                ++y;
                x = 0;
            }
        } else if (c == CH_CURS_UP) {
            if (y)
                --y;
        } else if (c == CH_CURS_DOWN) {
            if (y < 23)
                ++y;
        } else if (c == CH_HOME)
            x = y = 0;
        else if (c == CH_ENTER) {
            x = 0;
            if (y < 23)
                ++y;
        } else if (c == 0) {
            /* CTRL + INST/DEL: make room only if no bottom-row text is lost. */
            for (r = 0; r < 40 && editbuf[sizeof(editbuf) - 40 + r] == ' '; ++r) {
            }
            if (r == 40) {
                idx = (unsigned int)y * 40;
                memmove(editbuf + idx + 40, editbuf + idx, sizeof(editbuf) - idx - 40);
                memset(editbuf + idx, ' ', 40);
                x = 0;
                bank_renderedit();
            }
        } else if (c == CH_DEL) {
            if (x) {
                --x;
                --idx;
                memmove(editbuf + idx, editbuf + idx + 1, 39 - x);
                editbuf[(unsigned int)y * 40 + 39] = ' ';
                redraw = 1;
            }
        } else if (c == CH_INS) {
            memmove(editbuf + idx + 1, editbuf + idx, 39 - x);
            editbuf[idx] = ' ';
            redraw = 1;
        } else if (c >= 32 && (c < 128 || c >= 160)) {
            editbuf[idx] = c;
            gotoxy(x, y);
            displayc(c);
            if (x < 39)
                ++x;
            else if (y < 23) {
                x = 0;
                ++y;
            }
        }
        if (redraw) {
            gotoxy(0, y);
            for (r = 0; r < 40; ++r)
                displayc(editbuf[(unsigned int)y * 40 + r]);
        }
        if (y != oldy)
            bank_editnumber(screenbase + 961, y + 1);
        if (x != oldx)
            bank_editnumber(screenbase + 964, x + 1);
    }
    caret_hide();
    editprompt = 1;
    if (!yesno(SYSOUT_SAVE_CHANGES))
        goto done;
    if (!p1.name[0]) {
        bank_editstatus();
        outs(SYSOUT_FILE_NAME);
        if (!bank_input(line, LINE, 0) || !path(line, &p1) || !p1.name[0])
            goto done;
    }
    bank_editsaving();
    if (!preparewrite(&p1) || !openwrite(&p1, CBM_T_SEQ))
        goto done;
    last = sizeof(editbuf);
    while (last && editbuf[last - 1] == ' ')
        --last;
    /* Keep the existing trimmed-line/CR format, batching serial writes. */
    n = 1;
    filled = 0;
    for (r = 0; r < EDITROWS && (unsigned int)r * 40 < last; ++r) {
        end = 40;
        while (end && editbuf[(unsigned int)r * 40 + end - 1] == ' ')
            --end;
        if (filled + end + 1 > sizeof(io)) {
            if (channel_write(3, io, filled) != (int)filled) {
                n = -1;
                break;
            }
            filled = 0;
        }
        memcpy(io + filled, editbuf + (unsigned int)r * 40, end);
        filled += end;
        io[filled++] = 13;
    }
    if (n >= 0 && filled && channel_write(3, io, filled) != (int)filled)
        n = -1;
    channel_close(3);
    cachevalid = 0;
    if (diskstatus(p1.dev, 1) < 20 && n < 0)
        error(SYSOUT_WRITE_FAULT_ERR);
done:
    screen_reverse(0);
    if (editprompt)
        clear();
    editprompt = 0;
}

/* The KERNAL's CTRL table maps function keys to $ff, so GETIN never
 * receives them. Use its physical scan index instead, once per key press.
 * Keep the latch across prompts so a held shortcut cannot execute twice. */
__noinline unsigned char bank_controlkey(void)
{
    static unsigned char down;
    unsigned char key = PEEK(197), mod = PEEK(653), c;
    if (!(mod & 4))
        key = 64;
    if (key == down)
        return 0;
    down = key;
    if (key < 3 || key > 6)
        return 0;
    c = key == 3 ? 136 : 133 + key - 4;
    if (mod & 1)
        c += 4;
    return c;
}

/* One-row horizontal viewport, with a 127-character command behind it.
 *
 * Read an editable command line with completion and optional history; return zero on
 * cancellation.
 *
 * buf: Destination buffer, including space for a terminator.
 * max: Total buffer capacity.
 * recall: Nonzero enables command history and raw filename tracking. */
__noinline unsigned char bank_input(char *buf, unsigned int max, unsigned char recall)
{
    unsigned int len = 0, pos = 0, view = 0, start = 0, i, n;
    unsigned char x = ox, y = oy, w = 39 - ox, c, oldmod = 0;
    unsigned char h = histcount, dirty = 1, comp = 0;
    unsigned int ci = 0;
    static char token[LINE];
    char prefix[17], shown[40], lead[PATHSIZE];
    unsigned char mod, quoted;
    Path cp;
    clock_t blink;
    unsigned char visible = 1, accept = 0, control;
    /* Leave room for one bank_input character and its caret after a long prompt. */
    if (!w) {
        newline();
        x = ox;
        y = oy;
        w = 39;
    }
    buf[0] = 0;
    memset(rawline, 0, sizeof(rawline));
    textcursor(0);
    caret_init();
    blink = clock();
    for (;;) {
        if (dirty) {
            len = strlen(buf);
            if (pos < view)
                view = pos;
            if (pos >= view + w)
                view = pos - w + 1;
            memset(shown, ' ', w);
            shown[w] = 0;
            n = len - view;
            if (n > w)
                n = w;
            memcpy(shown, buf + view, n);
            for (i = 0; i < n; ++i) {
                c = shown[i];
                if (rawget(rawline, view + i))
                    c = toupper(c);
                if (c == 96)
                    c = ' ';
                if (c < 32 || (c >= 128 && c < 160))
                    c = '.';
                shown[i] = c;
            }
            gotoxy(x, y);
            screen_puts(shown);
            gotoxy(x + pos - view, y);
            caret_show(x + pos - view, y);
            visible = 1;
            blink = clock();
            dirty = 0;
        }
        if ((clock_t)(clock() - blink) >= CLOCKS_PER_SEC / 2) {
            visible = !visible;
            blink = clock();
            if (visible)
                caret_show(x + pos - view, y);
            else
                caret_hide();
        }
        mod = PEEK(653) & 2;
        if (recall && mod && !oldmod) {
            oldmod = mod;
            if (!comp) {
                /* Complete a filename in the first token too. A complete built-in
                 * command still starts completion of its first argument. */
                start = 0;
                quoted = 0;
                for (i = 0; i < pos; ++i) {
                    if (buf[i] == '"')
                        quoted = !quoted;
                    if (buf[i] == ' ' && !quoted)
                        start = i + 1;
                }
                if (!start && commandid(buf) >= 0) {
                    if (!pos || pos != len || len + 1 >= max)
                        continue;
                    buf[pos++] = ' ';
                    buf[pos] = 0;
                    start = pos;
                    dirty = 1;
                }
                n = 0;
                for (i = start; i < pos; ++i)
                    if (buf[i] != '"')
                        token[n++] = buf[i];
                token[n] = 0;
                if (!path(token, &cp)) {
                    dirty = 1;
                    continue;
                }
                strcpy(prefix, cp.name);
                lead[0] = 0;
                for (i = 0; token[i]; ++i)
                    if (token[i] == 0x5c || token[i] == ':') {
                        memcpy(lead, token, i + 1);
                        lead[i + 1] = 0;
                    }
                ci = 0;
                if (!host_device(cp.dev) && (!cachevalid || cachedev != cp.dev || strcmp(cachedir, cp.dir))) {
                    caret_hide();
                    /* Successful directory reads are silent: keep this row. */
                    ox = 0;
                    oy = y;
                    if (!location_list(cp.dev, cp.dir)) {
                        nav_finish();
                        showprompt();
                        if (ox == 39)
                            newline();
                        x = ox;
                        y = oy;
                        w = 39 - x;
                        dirty = 1;
                        continue;
                    }
                    nav_finish();
                    dirty = 1;
                }
                comp = 1;
            }
            if (host_device(cp.dev)) {
                caret_hide();
                if (host_complete(&cp, prefix, &ci) &&
                    start + strlen(directory_entries[0].name) + strlen(lead) + 2 < max) {
                    snprintf(buf + start, max - start, "\"%s%s\"", lead, directory_entries[0].name);
                    for (i = start; i < LINE; ++i) rawset(rawline, i, 0);
                    for (i = start + 1 + strlen(lead); i < strlen(buf) - 1; ++i) rawset(rawline, i, 1);
                    pos = strlen(buf);
                }
                nav_finish(); dirty = 1;
                continue;
            }
            for (i = 0; i < count; ++i) {
                n = ci++;
                if (ci >= count)
                    ci = 0;
                if (!strncmp(directory_entries[n].name, prefix, strlen(prefix))) {
                    if (start + strlen(directory_entries[n].name) + strlen(lead) + 2 < max) {
                        snprintf(buf + start, max - start, "\"%s%s\"", lead,
                                 directory_entries[n].name);
                        for (i = start; i < LINE; ++i)
                            rawset(rawline, i, 0);
                        for (i = start + 1 + strlen(lead); i < strlen(buf) - 1; ++i)
                            rawset(rawline, i, 1);
                        pos = strlen(buf);
                        dirty = 1;
                    }
                    break;
                }
            }
            continue;
        }
        oldmod = mod;
        control = 0;
        if (accept)
            c = CH_ENTER;
        else if (kbhit())
            c = getch();
        else {
            c = recall && !editprompt ? bank_controlkey() : 0;
            if (!c)
                continue;
            control = 1;
        }
        accept = 0;
        comp = 0;
        if (recall && !editprompt && c >= 133 && c <= 139) {
            const char *binding;
            n = c <= 136 ? (c - 133) * 2 + 1 : (c - 137) * 2 + 2;
            binding = bank_keytext(keybindings, n);
            if (*binding) {
                strcpy(buf, binding);
                memset(rawline, 0, sizeof(rawline));
                pos = strlen(buf);
                view = 0;
                h = histcount;
                dirty = 1;
                accept = control || (PEEK(653) & 4) != 0;
            }
            continue;
        }
        if (c == CH_STOP && recall && !editprompt) {
            buf[0] = draft[0] = 0;
            memset(rawline, 0, sizeof(rawline));
            memset(rawdraft, 0, sizeof(rawdraft));
            pos = view = 0;
            h = histcount;
            dirty = 1;
            continue;
        }
        if (c == CH_ENTER || c == CH_STOP) {
            caret_hide();
            ox = 0;
            oy = y;
            if (!editprompt)
                newline();
            if (c == CH_STOP) {
                buf[0] = 0;
                return 0;
            }
            return 1;
        }
        if (recall && (c == CH_CURS_UP || c == CH_CURS_DOWN)) {
            if (h == histcount) {
                strcpy(draft, buf);
                memcpy(rawdraft, rawline, RAWMAP);
            }
            if (c == CH_CURS_UP && h)
                --h;
            if (c == CH_CURS_DOWN && h < histcount)
                ++h;
            if (h == histcount) {
                strcpy(buf, draft);
                memcpy(rawline, rawdraft, RAWMAP);
            } else {
                i = (histnext + 10 - histcount + h) % 10;
                strcpy(buf, history[i]);
                memcpy(rawline, rawhistory[i], RAWMAP);
            }
            pos = strlen(buf);
            dirty = 1;
            continue;
        }
        if (c == CH_CURS_LEFT) {
            if (pos)
                --pos;
        } else if (c == CH_CURS_RIGHT) {
            if (pos < len)
                ++pos;
        } else if (c == CH_HOME)
            pos = 0;
        else if (c == CH_DEL) {
            if (pos) {
                bank_rawedit(pos - 1, len, 1);
                memmove(buf + pos - 1, buf + pos, len - pos + 1);
                --pos;
            }
        } else if (c >= 32 && (c < 128 || c >= 160) && len < max - 1) {
            bank_rawedit(pos, len, 0);
            memmove(buf + pos + 1, buf + pos, len - pos + 1);
            buf[pos++] = c;
        }
        dirty = 1;
    }
}

/* Editing a completed name relinquishes exact-byte handling for that name.
 * Other completed arguments retain their provenance as the line shifts.
 *
 * Shift exact-byte flags to follow inserted or deleted command characters.
 *
 * pos: Edit position in the command line.
 * len: Command length before the edit.
 * deleting: Nonzero deletes a flag; zero inserts a clear flag. */
__noinline void bank_rawedit(unsigned char pos, unsigned char len, unsigned char deleting)
{
    unsigned char a = pos, b = pos, i;
    if (a && rawget(rawline, a - 1))
        --a;
    while (a && rawget(rawline, a - 1))
        --a;
    while (b < len && rawget(rawline, b))
        ++b;
    for (i = a; i < b; ++i)
        rawset(rawline, i, 0);
    if (deleting) {
        for (i = pos; i < len; ++i)
            rawset(rawline, i, rawget(rawline, i + 1));
    } else {
        for (i = len; i > pos; --i)
            rawset(rawline, i, rawget(rawline, i - 1));
        rawset(rawline, pos, 0);
    }
}

/* Resolve a command or alias; return its commands index, or -1 if unknown.
 *
 * s: Terminated command name, compared without case sensitivity. */
__noinline int bank_commandid(const char *s)
{
    unsigned char i;
    if (!stricmp(s, "DELETE") || !stricmp(s, "ERASE"))
        return 4;
    if (!stricmp(s, "CHDIR"))
        return 33;
    if (!stricmp(s, "MKDIR"))
        return 34;
    if (!stricmp(s, "RMDIR"))
        return 35;
    if (!stricmp(s, "RENAME"))
        return 18;
    if (!stricmp(s, "VERSION"))
        return 22;
    for (i = 0; i < COMMANDCOUNT; ++i)
        if (!stricmp(s, commands[i]))
            return i;
    return -1;
}

/* One destination per built-in command. Keep the wrapper responsible for
 * closing output even when command handlers return early.
 *
 * Separate output redirection, execute the command, then close and finalize its output.
 *
 * s: Writable command line; redirection markers may be replaced with terminators. */
__noinline void bank_execute(char *s)
{
    char *r, *op = 0, *target, *end;
    unsigned char quote = 0, append = 0, helping;
    int id, i;
    aborted = 0;
    /* KEY stores redirection text rather than opening its future destination. */
    r = s;
    while (*r == ' ' || *r == '@')
        ++r;
    if (!strnicmp(r, "KEY ", 4)) {
        executecommand(s);
        return;
    }
    for (r = s; *r; ++r) {
        if (*r == '"')
            quote = !quote;
        else if (*r == '>' && !quote) {
            if (op) {
                error(SYSOUT_MULTIPLE_REDIR);
                return;
            }
            op = r;
            if (r[1] == '>') {
                append = 1;
                ++r;
            }
        }
    }
    if (!op) {
        executecommand(s);
        return;
    }
    if (quote) {
        error(SYSOUT_SYNTAX_ERR);
        return;
    }
    target = op + 1 + append;
    *op = 0;
    end = op;
    while (end > s && end[-1] == ' ')
        *--end = 0;
    while (*s == ' ' || *s == '@')
        ++s;
    if (!tokenize(s) || !argc) {
        error(SYSOUT_SYNTAX_ERR);
        return;
    }
    id = commandid(args[0]);
    if (!stricmp(args[0], "ECHO."))
        id = 7;
    helping = id == 11;
    for (i = 1; i < argc; ++i)
        if (!argquoted[i] && !strcmp(args[i], "/?"))
            helping = 1;
    if (helping || (id != 1 && id != 5 && id != 7 && id != 13 && id != 20 && id != 28)) {
        error(SYSOUT_REDIR_NOT_SUPPORTED);
        return;
    }
    /* Resolve file inputs before opening/truncating any destination. */
    if (id == 20 || id == 28) {
        unsigned char mode;
        unsigned long limit;
        char *needle;
        if (id == 28) {
            if (!findoptions(&mode, &needle))
                return;
        } else {
            if (!typeoptions(&mode, &limit)) {
                error(SYSOUT_SYNTAX_TYPE);
                return;
            }
            if (!path(args[1], &p1))
                return;
        }
        i = findfile(&p1);
        if (i < 0) {
            if (i == -1)
                error(SYSOUT_FILE_NOT_FOUND);
            return;
        }
        if (directory_entries[i].type != CBM_T_SEQ && directory_entries[i].type != CBM_T_PRG &&
            directory_entries[i].type != CBM_T_USR) {
            error(SYSOUT_UNSUPPORTED_FILE_TYPE);
            return;
        }
    }
    if (!tokenize(target) || argc != 1) {
        error(SYSOUT_INVALID_DEST);
        return;
    }
    if (!stricmp(args[0], "LPT1") || !stricmp(args[0], "LPT2")) {
        error(SYSOUT_PRINTER_REDIR);
        return;
    }
    if (!path(args[0], &outputpath))
        return;
    if (!outputpath.name[0] || strchr(outputpath.name, '*') || strchr(outputpath.name, '?')) {
        error(SYSOUT_INVALID_DEST);
        return;
    }
    if ((id == 20 || id == 28) && sameplace(&p1, &outputpath) && !strcmp(p1.name, outputpath.name)) {
        error(id == 20 ? SYSOUT_CANNOT_REDIR_TYPE_ON_SELF : SYSOUT_CANNOT_REDIR_FIND_ON_SELF);
        return;
    }
    cachevalid = 0;
    i = findfile(&outputpath);
    if (i == -2)
        return;
    if (i >= 0 && directory_entries[i].type != CBM_T_SEQ) {
        error(SYSOUT_DEST_MUST_BE_SEQ);
        return;
    }
    /* Delay truncation until syntax, source type and self-redirection checks have all passed. */
    if (i >= 0 && outputpath.dev && !append && !scratch(&outputpath))
        return;
    if (!statuschannel(outputpath.dev)) {
        error(SYSOUT_DRIVE_NOT_READY);
        return;
    }
    if (!location_file(outputpath.dev, outputpath.dir))
        return;
    outputmode = append && i >= 0 ? 'a' : 'w';
    outputstarted = 0;
    /* Disk writers open only when their first output chunk is ready. Closing
     * an empty SEQ writer first would insert DOS's implicit CR before data. */
    if (!outputpath.dev) {
        snprintf(diskcmd, sizeof(diskcmd), "0:%s,s,%c", outputpath.name, outputmode);
        if (channel_open(5, outputpath.dev, 5, diskcmd) || diskstatus(outputpath.dev, 1) >= 20) {
            channel_close(5);
            error(SYSOUT_WRITE_FAULT_ERR);
            return;
        }
    }
    outputused = outputfailed = outputcol = 0;
    redirected = 1;
    executecommand(s);
    /* Command handlers may return early; this outer path still flushes and closes their output. */
    outputflush();
    if (outputpath.dev && !outputstarted && !outputfailed && !output_append())
        outputfailed = aborted = 1;
    redirected = 0;
    if (!outputpath.dev) {
        if (outputfailed)
            channel_abort(5);
        channel_close(5);
    }
    cachevalid = 0;
    diskstatus(outputpath.dev, 1);
}

#pragma code(code)
#pragma data(data)
