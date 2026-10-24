// Compile production extracts with the same compiler used for the shell.
// Oscar64 -e exits unsuccessfully when main returns a nonzero test result.
const {tool} = require('./setup');
const {execFileSync} = require('child_process');
const fs = require('fs');
/** Compile and execute the C fixture at source; a nonzero fixture result fails the suite. */
module.exports = function simulate(source, options = {}) {
    const support = fs.readFileSync('src/c64-support.c', 'utf8');
    // Include the actual production helpers, while leaving disk/screen I/O mocked.
    const helpers =
        '#include "../src/sysout.h"\n#include <string.h>\n#include <ctype.h>\n#include <stdarg.h>\n' +
        fs.readFileSync('src/storage.h', 'utf8').split('\n').filter(s => s.startsWith('#define DRIVE_')).join('\n') + '\n' +
        'typedef const char *StringPtr;\n' +
        support.slice(support.indexOf('char *strpbrk('), support.indexOf('void screen_reverse(')) +
        support.slice(support.indexOf('int vsnprintf('));
    const input = source.replace(/\.c$/, '-oscar.c');
    const mounts = options.mount ? '' : '\n#define mount_active(d) 0\n#define mount_geometry(d) 0\n#define mount_guard(p) 1\n#define mount_select(d,p) 1\n#define mountcmd(o) ((void)0)\n#define mount_reset() ((void)0)\n#define mount_restore() ((void)0)\n#define mount_invalidate() ((void)0)\n#define imagetype(n,t) typename(t)\n#define imagekind(n) 0\n#define imageformat(k) ""\n#define softiec_mount(p,d,u) 0\n';
    fs.writeFileSync(input, helpers + mounts + '\n' + fs.readFileSync(source, 'utf8'));
    execFileSync(tool('oscar64', 'oscar64'),
        ['-n', '-Os', '-Oo', ...(options.petscii ? ['-psci'] : []), '-e', '-o=' + source.replace(/\.c$/, '.prg'), input],
        {stdio: 'inherit', windowsHide: true, timeout: 120000});
};
