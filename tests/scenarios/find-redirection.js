const messages = require('../output');
// FIND must preserve its input and existing output when redirection is rejected.
const assert = require('assert/strict');
module.exports = async ({enter, check}) => {
    let s;
    await enter('echo one >input.txt', 2000);
    await enter('echo two >>input.txt', 2000);
    await enter('echo one more >>input.txt', 2000);
    await enter('find "one" input.txt >out.txt', 2000);
    await enter('cls');
    s = await check('type out.txt', 'one more');
    assert(!s.includes('two'), s);
    await enter('find /c "two" input.txt >>out.txt', 2000);
    await enter('cls');
    s = await check('type out.txt', 'INPUT.TXT: 1');
    assert(s.includes('one more'), s);
    await check('help find >out.txt', 'Redirection not supported');
    await check('find /? >out.txt', 'Redirection not supported');
    await enter('cls');
    s = await check('type out.txt', 'one more');
    assert(s.includes('INPUT.TXT: 1'), s);
    await check(
        'find "one" input.txt >input.txt', messages.SYSOUT_CANNOT_REDIR_FIND_ON_SELF.trim());
    await check(
        'find "one" input.txt >>input.txt', messages.SYSOUT_CANNOT_REDIR_FIND_ON_SELF.trim());
    await enter('cls');
    await check('type input.txt', 'two');
    await check('find "one" missing >out.txt', messages.SYSOUT_FILE_NOT_FOUND.trim());
    await enter('cls');
    await check('type out.txt', 'one more');
    console.log(
        'PASS FIND overwrite/append, preserved input/output files, and rejected HELP redirection');
    return;
};
