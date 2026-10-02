// Oscar64 assembly is not C syntax. Protect it while clang-format handles C.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const root = path.resolve(__dirname, '..');
const executable = process.env.CLANG_FORMAT || 'clang-format';
const check = process.argv.includes('--check');
let changed = false;
for (const relative of fs.readdirSync(path.join(root, 'src'), {recursive: true})) {
    if (!/\.(c|h)$/.test(relative)) continue;
    const file = path.join(root, 'src', relative);
    const original = fs.readFileSync(file, 'utf8');
    const assembly = [];
    const protectedSource = original.replace(/__asm(?:\s+\w+)?\s*\{[^}]*\}/g, block => {
        const index = assembly.push(block) - 1;
        return `__asm { /* MCS_ASSEMBLY_${index} */ }`;
    });
    let formatted = execFileSync(executable, ['--assume-filename=' + file],
        {input: protectedSource, encoding: 'utf8', windowsHide: true});
    let restored = 0;
    formatted = formatted.replace(/__asm\s*\{\s*\/\* MCS_ASSEMBLY_(\d+) \*\/\s*\}/g,
        (_, index) => {
            restored++;
            return assembly[Number(index)];
        });
    if (restored !== assembly.length || formatted.includes('MCS_ASSEMBLY_')) {
        throw Error('Could not preserve Oscar64 assembly in ' + file);
    }
    // Retain CRLF for files that consistently use it; otherwise use LF.
    const crlf = original.includes('\r\n') && !original.replaceAll('\r\n', '').includes('\n');
    formatted = formatted.replace(/\r?\n/g, crlf ? '\r\n' : '\n');
    if (formatted !== original) {
        changed = true;
        if (check) console.error('Needs formatting: src/' + relative);
        else fs.writeFileSync(file, formatted);
    }
}
if (check && changed) process.exitCode = 1;
