// Compile production extracts with the same compiler used for the shell.
// Oscar64 -e exits unsuccessfully when main returns a nonzero test result.
const {tool} = require('./setup');
const {execFileSync} = require('child_process');
const fs = require('fs');
module.exports = function simulate(source) {
  const support = fs.readFileSync('src/c64-support.c', 'utf8');
  // Include the actual production helpers, while leaving disk/screen I/O mocked.
  const helpers = '#include <string.h>\n#include <ctype.h>\n#include <stdarg.h>\n' +
    'typedef const char *StringPtr;\n' +
    support.slice(support.indexOf('char *strpbrk('), support.indexOf('void screen_reverse(')) +
    support.slice(support.indexOf('int vsnprintf('));
  const input = source.replace(/\.c$/, '-oscar.c');
  fs.writeFileSync(input, helpers + '\n' + fs.readFileSync(source, 'utf8'));
  execFileSync(tool('oscar64', 'oscar64'),
    ['-n', '-Os', '-Oo', '-e', '-o='+source.replace(/\.c$/, '.prg'), input],
    {stdio:'inherit', windowsHide:true, timeout:120000});
};
