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

__noinline void bank_editstatus(void)
{
    ox = 0;
    oy = 24;
    gotoxy(0, 24);
    screen_reverse(1);
    screen_clear(40);
}

__noinline void bank_editsaving(void)
{
    bank_editstatus();
    outs(SYSOUT_SAVING);
}

/* Only these two reverse-video digit cells change while editing. */
__noinline void bank_editnumber(unsigned int address, unsigned char n)
{
    POKE(address, 176 + n / 10);
    POKE(address + 1, 176 + n % 10);
}

__noinline void bank_renderedit(void)
{
    unsigned char r, c;
    for (r = 0; r < EDITROWS; ++r) {
        gotoxy(0, r);
        for (c = 0; c < 40; ++c)
            displayc(editbuf[(unsigned int)r * 40 + c]);
    }
}

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
            say(SYSOUT_TOO_MANY_PARAMETERS);
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
    outs(SYSOUT_EDIT_INITIAL_POSITION);
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
               Read the scanned key index instead; trigger once per press. */
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
        error(SYSOUT_WRITE_FAULT_ERROR);
done:
    screen_reverse(0);
    if (editprompt)
        clear();
    editprompt = 0;
}

/* One-row horizontal viewport, with an 64-character command behind it. */
__noinline unsigned char bank_input(char *buf, unsigned int max, unsigned char recall)
{
    unsigned int len = 0, pos = 0, view = 0, start = 0, i, n;
    unsigned char x = ox, y = oy, w = 39 - ox, c, oldmod = 0;
    unsigned char h = histcount, dirty = 1, comp = 0;
    unsigned int ci = 0;
    static char token[LINE];
    char prefix[17], shown[40], lead[5];
    unsigned char mod, quoted;
    Path cp;
    clock_t blink;
    unsigned char visible = 1;
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
                /* Completion is only offered after a command token. */
                start = 0;
                quoted = 0;
                for (i = 0; i < pos; ++i) {
                    if (buf[i] == '"')
                        quoted = !quoted;
                    if (buf[i] == ' ' && !quoted)
                        start = i + 1;
                }
                if (!start) {
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
                if (strchr(token, ':'))
                    snprintf(lead, sizeof(lead), "%s:", drivename(cp.dev));
                ci = 0;
                if (!cachevalid || cachedev != cp.dev) {
                    caret_hide();
                    /* Successful directory reads are silent: keep this row. */
                    ox = 0;
                    oy = y;
                    if (!directory(cp.dev)) {
                        showprompt();
                        if (ox == 39)
                            newline();
                        x = ox;
                        y = oy;
                        w = 39 - x;
                        dirty = 1;
                        continue;
                    }
                    dirty = 1;
                }
                comp = 1;
            }
            for (i = 0; i < count; ++i) {
                n = ci++;
                if (ci >= count)
                    ci = 0;
                if (!strncmp(directory_entries[n].name, prefix, strlen(prefix))) {
                    if (start + strlen(directory_entries[n].name) + strlen(lead) + 2 < max) {
                        snprintf(buf + start, max - start, "\"%s%s\"", lead, directory_entries[n].name);
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
        if (!kbhit())
            continue;
        c = getch();
        comp = 0;
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
 * Other completed arguments retain their provenance as the line shifts. */
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
#pragma code(code)
#pragma data(data)
