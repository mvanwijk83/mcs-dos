// Shared by the build and tests. Tool locations are supplied by the caller.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const groups = {cc65: 'CC65_HOME', oscar64: 'OSCAR64_HOME', vice: 'VICE_HOME'};
function tool(group, name) {
    const home = process.env[groups[group]];
    const executable = name + (process.platform === 'win32' ? '.exe' : '');
    if (!home) return executable; // Use PATH.
    const file = path.resolve(home, 'bin', executable);
    if (!fs.existsSync(file)) throw Error(`Missing ${file}; ${groups[group]} must contain bin/${executable}`);
    return file;
}
function setup() {
    process.chdir(root);
    fs.mkdirSync('build/oscar64', {recursive: true});
}
module.exports = {root, tool, setup};
