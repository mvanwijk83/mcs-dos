require('./setup');
const fs = require('fs');
const modules = ['core', 'edit', 'fileutil', 'filemgmt', 'disk', 'boot', 'mcsdos'];
const source = modules.map(name => fs.readFileSync('src/' + name + '.c', 'utf8'))
                   .join('\n')
                   .replaceAll('\r\n', '\n');
const header = fs.readFileSync('src/core.h', 'utf8');
/** Read the numeric public limit named by name, so fixtures follow configured capacities. */
function constant(name) {
    const match = header.match(new RegExp('^#define\\s+' + name + '\\s+(\\d+)[Uu]?\\s*$', 'm'));
    if (!match)
        throw Error('Missing numeric core limit: ' + name);
    return Number(match[1]);
}
/** Extract the production function named by name, retaining its body and bypassing bank gates. */
function fn(name) {
    const pattern = new RegExp(
        '^(?:__noinline )?[\\w *]+?[ *](?:bank_)?' + name + '\\([^;{}]*?\\)\\s*\\{', 'm');
    const match = source.match(pattern);
    if (!match)
        throw Error('Missing source function ' + name);
    let pos = match.index + match[0].length, depth = 1, state = '', escaped = false;
    for (; pos < source.length; pos++) {
        const c = source[pos], next = source[pos + 1];
        if (state === '//') {
            if (c === '\n')
                state = '';
            continue;
        }
        if (state === '/*') {
            if (c === '*' && next === '/') {
                state = '';
                pos++;
            }
            continue;
        }
        if (state) {
            if (escaped)
                escaped = false;
            else if (c === '\\')
                escaped = true;
            else if (c === state)
                state = '';
            continue;
        }
        if (c === '/' && (next === '/' || next === '*')) {
            state = c + next;
            pos++;
            continue;
        }
        if (c === '"' || c === '\'') {
            state = c;
            continue;
        }
        if (c === '{')
            depth++;
        if (c === '}' && !--depth)
            break;
    }
    // Host-side logic tests compile real function bodies, bypassing hardware gates.
    const body = 'static ' +
                 source.slice(match.index, pos + 1)
                     .replace(/^__noinline /, '')
                     .replace(/\bbank_/g, '')
                     .replace(/\bdirectory_entries\b/g, 'files') +
                 '\n';
    return name === 'decimal' ? '#pragma optimize(push, 0)\n' + body + '#pragma optimize(pop)\n'
                              : body;
}
module.exports = {
    fn,
    functions: (...names) => names.map(fn).join('\n'),
    header,
    constant,
    commands: [
        ...source.match(/const char \*\s*const commands\[\]\s*=\s*\{([\s\S]*?)\};/)[1].matchAll(
            /"([^"]+)"/g)
    ].map(match => match[1])
};
