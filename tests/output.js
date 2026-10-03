// Resolve presentation text from the public headers. Persisted bytes and
// behavioral expectations remain independent in the individual scenarios.
const fs = require('fs');
const path = require('path');
const definitions = new Map();
for (const file of ['core.h', 'sysout.h']) {
    const source =
        fs.readFileSync(path.join(__dirname, '../src', file), 'utf8').replace(/\\\r?\n/g, '');
    for (const match of source.matchAll(/^#define\s+(\w+)\s+(.+)$/gm))
        definitions.set(match[1], match[2].trim());
}

// Decode C escapes without evaluating the source as JavaScript.
function decode(text) {
    return text.replace(/\\(x[\da-f]+|[0-7]{1,3}|.)/gi, (_, escape) => {
        const simple = {
            n: '\n',
            r: '\r',
            t: '\t',
            b: '\b',
            f: '\f',
            v: '\v',
            '\\': '\\',
            '"': '"',
            '\'': '\'',
            '?': '?'
        };
        if (escape in simple)
            return simple[escape];
        if (/^x/i.test(escape))
            return String.fromCharCode(parseInt(escape.slice(1), 16));
        if (/^[0-7]/.test(escape))
            return String.fromCharCode(parseInt(escape, 8));
        throw Error('Unsupported C escape: ' + escape);
    });
}

/** Resolve adjacent literals and named constants, including VERSION. */
function resolve(name, seen = new Set()) {
    if (!definitions.has(name) || seen.has(name))
        throw Error('Unknown or circular output: ' + name);
    const expression = definitions.get(name);
    const tokens = expression.match(/"(?:\\.|[^"\\])*"|\b\w+\b/g) || [];
    if (tokens.join('').replace(/\s/g, '') !== expression.replace(/\s/g, ''))
        throw Error('Unsupported output expression: ' + name);
    const next = new Set([...seen, name]);
    return tokens
        .map(token => token.startsWith('"') ? decode(token.slice(1, -1)) : resolve(token, next))
        .join('');
}
const output = {};
for (const name of definitions.keys()) {
    if (name.startsWith('SYSOUT_') || name === 'SYS_BATCH_TOO_LARGE_OR_UNREADABLE' ||
        name === 'VERSION')
        output[name] = resolve(name);
}
module.exports = Object.freeze(output);
