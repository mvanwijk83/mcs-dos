// Exercise the shared pager, including live environment changes and cancellation.
require('./setup');
const fs = require('fs');
const {functions} = require('./source');
fs.writeFileSync('build/test-pagination.c', `
#include <string.h>
#define CH_STOP 3
static unsigned char envready, redirected, aborted, pagelines, ox, oy;
static unsigned char reply, pressed;
static unsigned int envused, prompts, reads, clears, polls;
static char environment[64];
static void outs(const char *s) { ++prompts; }
static unsigned char getch(void) { ++reads; return reply; }
static unsigned char stop(void) { ++polls; if (pressed) aborted = 1; return pressed; }
static void gotoxy(unsigned char x, unsigned char y) {}
static void screen_clear(unsigned char width) { ++clears; }
${functions('envget', 'page')}
/* Reset observable keyboard/display state and install a packed PAGE value. */
static void reset(const char *value)
{
    envready = 1;
    redirected = aborted = pagelines = pressed = 0;
    prompts = reads = clears = polls = 0;
    reply = ' ';
    ox = 17;
    environment[0] = 0;
    if (value) {
        strcpy(environment, "PAGE=");
        strcat(environment, value);
    }
    envused = value ? strlen(environment) + 1 : 0;
}
static const char *values[] = {"OFF", "off", "oFf", "", "ON", "0", "OFF ", " OFF", "OFFLINE"};
int main(void)
{
    unsigned int i, row;
    for (i = 0; i < 9; ++i) {
        reset(values[i]);
        for (row = 0; row < 66; ++row)
            if (!page()) return 1;
        if (i < 3) {
            if (prompts || reads || clears || polls != 66 || ox != 17) return 2;
        } else if (prompts != 3 || reads != 3 || clears != 3 || ox) return 3;
    }
    reset(0);
    for (row = 0; row < 22; ++row) if (!page()) return 4;
    if (prompts != 1) return 5;
    reset("OFF"); envready = 0; pagelines = 21;
    if (!page() || prompts != 1) return 6;
    reset("OFF"); pressed = 1;
    if (page() || !aborted || prompts || reads) return 7;
    reset("OFF"); aborted = 1;
    if (page() || polls || reads) return 8;
    reset("ON"); redirected = 1;
    for (row = 0; row < 66; ++row) if (!page()) return 9;
    if (prompts || reads || clears) return 10;
    pressed = 1;
    if (page() || !aborted) return 11;
    reset("ON"); pagelines = 21; reply = CH_STOP;
    if (page() || !aborted || prompts != 1 || clears != 1) return 12;
    reset("ON"); pagelines = 21;
    strcpy(environment, "PAGE=OFF"); envused = strlen(environment) + 1;
    if (!page() || prompts) return 13;
    strcpy(environment, "PAGE=ON"); envused = strlen(environment) + 1;
    if (!page() || prompts != 1) return 14;
    return 0;
}
`);
for (const petscii of [false, true])
    require('./simulator')('build/test-pagination.c', {petscii});
console.log('PASS PAGE=OFF case matching, defaults, live changes, redirection and RUN/STOP');
