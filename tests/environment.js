// Resolve executable/data locations consistently for PATH and *_HOME installs.
const fs = require('fs');
const path = require('path');
const {tool} = require('./setup');

/** Find a configured executable; name is the program, group selects *_HOME. */
function executable(group, name) {
    const configured = tool(group, name);
    const candidates =
        path.isAbsolute(configured)
            ? [configured]
            : (process.env.PATH || '').split(path.delimiter).map(dir => path.join(dir, configured));
    const found = candidates.find(file => fs.existsSync(file) && fs.statSync(file).isFile());
    if (!found)
        throw Error(`Cannot find ${name}. Set ${
            group === 'vice' ? 'VICE_HOME' : 'OSCAR64_HOME'} or add its bin directory to PATH.`);
    return path.resolve(found);
}

/** Locate bundled VICE ROM data; VICE_DATA_HOME supports separate data installs. */
function viceData(directory, file = '') {
    const binary = executable('vice', 'x64sc');
    const candidates = [
        process.env.VICE_DATA_HOME, process.env.VICE_HOME, path.resolve(path.dirname(binary), '..'),
        path.dirname(binary)
    ].filter(Boolean);
    const found =
        candidates.map(dir => path.join(dir, directory, file)).find(file => fs.existsSync(file));
    if (!found)
        throw Error(`Cannot find VICE ROM data ${directory}/${
            file}. Set VICE_DATA_HOME to the directory containing C64 and DRIVES.`);
    return found;
}
module.exports = {
    executable,
    viceData
};
