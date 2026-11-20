// Full D81 fixtures and an independent physical-sector audit.
require('./setup');
const fs = require('fs'), assert = require('assert/strict');
const {execFileSync} = require('child_process');
const {tool} = require('./setup');
const at = (t, s = 0) => ((t - 1) * 40 + s) * 256;
function create(file, deep = true) {
    const realistic = deep === 'realistic', dense = deep === 'dense-four';
    execFileSync(tool('vice', 'c1541'), ['-format', (deep ? 'deepfull' : 'flatfull') + ',bk', 'd81', file],
                 {stdio: 'pipe', windowsHide: true});
    const disk = fs.readFileSync(file);
    const headerTemplate = Buffer.from(disk.subarray(at(40), at(40) + 256));
    const bamTemplates = [1, 2].map(s => Buffer.from(disk.subarray(at(40, s), at(40, s) + 256)));
    function chain(first, last, name) {
        return {first, last, header: first, name,
            children: last - first + 1 > 3 ? [chain(first + 1, last, 'D')] : []};
    }
    function branch(first, last, name, depth) {
        const node = {first,last,header:first,name,children:[]};
        if (depth === 1) {
            node.children = [branch(first+1,first+16,'GROUP1',2),branch(first+17,first+32,'GROUP2',2)];
        } else if (depth === 2) {
            node.children = [branch(first+1,first+6,'SET1',3),branch(first+7,first+12,'SET2',3)];
        } else if (depth === 3) node.children = [branch(first+1,first+3,'ARCHIVE',4)];
        return node;
    }
    const root = {first: 1, last: 80, header: 40, name: deep ? 'DEEPFULL' : 'FLATFULL',
                  children: deep ? [chain(1, 38, 'LEFT'), chain(41, 79, 'RIGHT')] : []};
    if (realistic || dense) {
        root.name = realistic ? 'REALISTIC' : 'DENSEFOUR';
        root.children = [branch(1,38,'APPS',1),branch(41,79,'DOCS',1)];
    }
    function write(node) {
        const isRoot = node === root;
        const unavailable = new Set();
        for (const child of node.children)
            for (let t = child.first; t <= child.last; ++t)
                for (let s = 0; s < 40; ++s) unavailable.add(at(t, s));
        const available = [];
        for (let t = node.first; t <= node.last; ++t)
            for (let s = 0; s < 40; ++s)
                if (!unavailable.has(at(t, s)) && !(t === node.header && (isRoot || s < 3)))
                    available.push([t, s]);
        let files, directorySectors;
        if (realistic) {
            files = 8;
            directorySectors = Math.ceil((files + node.children.length) / 8);
        } else if (isRoot) {
            files = deep ? available.length : 296;
            directorySectors = Math.ceil((files + node.children.length) / 8);
        } else {
            directorySectors = 1;
            while (Math.ceil((available.length - directorySectors + node.children.length) / 8) > directorySectors)
                ++directorySectors;
            files = available.length - directorySectors;
        }
        assert(directorySectors <= 37 && files > 0);
        const entries = node.children.map(child => ({name: child.name, type: 0x85,
            track: child.header, sector: 0, blocks: (child.last - child.first + 1) * 40}));
        const data = available.filter(([t, s]) => t !== node.header || s >= 3 + directorySectors);
        let remaining = data.length - (realistic ? 2 : 0);
        const h = Buffer.from(headerTemplate);
        h[0] = node.header; h[1] = 3;
        h.fill(160, 4, 20);h.write(node.name, 4, 'ascii');h.copy(disk, at(node.header));
        for (let half = 0; half < 2; ++half) {
            const bam = Buffer.from(bamTemplates[half]);
            if (!half) bam[0] = node.header;
            bam.fill(0, 16); // Full: all sectors here are files, metadata or child reservations.
            bam.copy(disk, at(node.header, half + 1));
        }
        let cursor = 0;
        for (let f = 0; f < files; ++f) {
            const blocks = realistic ? (f < 2 ? 1 : Math.ceil(remaining / (files - f))) :
                !deep && isRoot ? (f < 200 ? 11 : 10) : 1;
            if (realistic && f >= 2) remaining -= blocks;
            const name = 'F' + String(f).padStart(3, '0') + '.TXT';
            const [track, sector] = data[cursor];
            entries.push({name, type: 0x81, track, sector, blocks});
            for (let b = 0; b < blocks; ++b) {
                const [t, s] = data[cursor++], o = at(t, s);
                disk.fill(32, o, o + 256);
                const next = b + 1 < blocks ? data[cursor] : null;
                disk[o] = next ? next[0] : 0;disk[o + 1] = next ? next[1] : 81;
                disk.write(('CHKDSK full disk fixture ' + node.name + '/' + name).padEnd(80), o + 2, 80, 'ascii');
            }
        }
        assert.equal(cursor, data.length, 'every usable sector allocated');
        for (let s = 0; s < directorySectors; ++s) {
            const o = at(node.header, 3 + s);
            disk.fill(0, o, o + 256);
            disk[o] = s + 1 < directorySectors ? node.header : 0;
            disk[o + 1] = s + 1 < directorySectors ? 4 + s : 255;
            for (let n = 0; n < 8; ++n) {
                const e = entries[s * 8 + n];if (!e) break;
                const p = o + n * 32;
                disk[p + 2] = e.type;disk[p + 3] = e.track;disk[p + 4] = e.sector;
                disk.fill(160, p + 5, p + 21);disk.write(e.name, p + 5, 'ascii');
                disk.writeUInt16LE(e.blocks, p + 30);
            }
        }
        node.children.forEach(write);
    }
    write(root);
    fs.writeFileSync(file, disk);
    const result = audit(disk);
    assert.equal(result.free, 0);
    assert.equal(result.physicalSectors, 3200);
    fs.writeFileSync(file + '.json', JSON.stringify(result, null, 2) + '\n');
    return result;
}
function audit(disk) {
    const occupied = new Set(), headers = new Set();
    const result = {partitions: 0, maxDepth: 0, files: 0, fileBlocks: 0, free: 0, physicalSectors: 0};
    function mark(t, s) {
        assert(t >= 1 && t <= 80 && s >= 0 && s < 40);
        const p = at(t, s);assert(!occupied.has(p), 'no physical sector shared by files or metadata');occupied.add(p);
        return p;
    }
    for (let s = 0; s < 40; ++s) mark(40, s);
    function visit(header, first, last, depth) {
        assert(!headers.has(header));headers.add(header);
        result.maxDepth = Math.max(result.maxDepth, depth);
        if (depth) {++result.partitions;for (let s = 0; s < 3; ++s) mark(header, s);}
        for (let t = first; t <= last; ++t) {
            if (!depth && t === 40) continue;
            const p = at(header, t <= 40 ? 1 : 2) + 16 + ((t - 1) % 40) * 6;
            const bits = [...disk.subarray(p + 1, p + 6)].reduce((sum, b) => sum + b.toString(2).replace(/0/g, '').length, 0);
            assert.equal(disk[p], bits);result.free += bits;
        }
        let t = disk[at(header)], s = disk[at(header) + 1];
        while (t) {
            const o = depth ? mark(t, s) : at(t, s);
            for (let n = 0; n < 256; n += 32) {
                const p = o + n, type = disk[p + 2] & 7, blocks = disk.readUInt16LE(p + 30);
                if (!type) continue;
                if (type === 5) {
                    const start = disk[p + 3];assert.equal(disk[p + 4], 0);
                    assert(start >= first && start + blocks / 40 - 1 <= last);
                    visit(start, start, start + blocks / 40 - 1, depth + 1);
                } else {
                    ++result.files;result.fileBlocks += blocks;
                    let ft = disk[p + 3], fs = disk[p + 4], read = 0;
                    while (ft) {
                        assert(ft >= first && ft <= last);
                        const q = mark(ft, fs);++read;
                        ft = disk[q];fs = disk[q + 1];
                    }
                    assert.equal(read, blocks, 'directory size matches actual file chain');
                }
            }
            t = disk[o];s = disk[o + 1];
        }
    }
    visit(40, 1, 80, 0);
    result.physicalSectors = occupied.size;
    result.reservedBlocks = 3160 - result.fileBlocks - result.free;
    return result;
}
if (require.main === module) {
    for (const deep of [false, true]) {
        const file = 'build/chkdsk-' + (deep ? 'deep-full' : 'flat-full') + '.d81';
        console.log(file, create(file, deep));
    }
}
module.exports = {create, audit};
