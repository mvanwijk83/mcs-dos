// Help paging and cancellation use the ROM library, even with no disk inserted.
const assert = require('assert/strict');
const fs = require('fs');
const messages = require('./output');
const help = require('../src/command-help.json');
require('./shell')('help-session',
    async ({disk, command, keys, enter, until}) => {
        const pager = messages.SYSOUT_PRESS_ANY_KEY;
        await enter('cls');
        const overview = await enter('help');
        const expected = [...require('./source').commands,
            'CHDIR', 'DELETE', 'ERASE', 'MKDIR', 'RENAME', 'RMDIR'].sort();
        const listed = overview.slice(overview.indexOf('command, type HELP [command].') +
            'command, type HELP [command].'.length).replace(/8:\\>\s*$/, '').trim().split(/\s+/);
        assert.deepEqual(listed, expected, 'HELP lists commands and aliases once in alphabetical order');
        await enter('cls');
        const removed = await enter('version');
        assert(removed.includes(messages.SYSOUT_BAD_CMD_OR_FILE_NAME), removed);
        await enter('cls');
        await keys('help set\\x0d');
        let text = await until(s => s.includes(pager));
        assert(
            text.replace(/\s+/g, ' ').includes(help.SET.split('\n')[0].replace(/\s+/g, ' ')), text);
        let pages = 0;
        while (text.includes(pager)) {
            assert(++pages < 20, 'help paging must terminate');
            await keys('\\x20');
            text = await until(s => s.includes(pager) || s.endsWith('8:\\>'));
        }
        assert(pages >= 2, 'fixture crosses multiple page boundaries');
        assert(text.endsWith('8:\\>'), text);
        await enter('cls');
        await keys('set /?\\x0d');
        await until(s => s.includes(pager));
        await keys('\\x03');
        await until(s => s.endsWith('8:\\>'));
        text = await enter('help set >help.txt');
        assert(!text.includes(pager), text);
        await command('detach 8');
        text = await enter('help cls');
        assert(text.includes(help.CLS.split('\n')[0]), text);
        await command(`attach "${disk}" 8`);
        assert((await enter('echo recovered')).includes('recovered'));
        console.log(
            'PASS help pages, cancellation, unpaged file output and cartridge-only recovery');
    },
    crt => {
        // Extend SET in the disposable ROM to force two pagination boundaries.
        // Only SET and CLS are used here, so leave room by clearing other topics.
        const {commands} = require('./source');
        const resource = fs.readFileSync('build/easyflash/help.bin');
        const topics = commands.map(
            (name, index) => name === 'SET' ? Buffer.concat([
                require('../scripts/petscii')(help.SET.split('\n')[0] + '\n' +
                                              'W'.repeat(40 * 45) + '\nfixture end'),
                Buffer.from([0])
            ])
                : name === 'CLS' ? resource.subarray(resource.readUInt16LE(index * 2),
                    resource.readUInt16LE((index + 1) * 2)) : Buffer.from([0]));
        const offsets = Buffer.alloc((topics.length + 1) * 2);
        let end = offsets.length;
        topics.forEach((topic, index) => {
            offsets.writeUInt16LE(end, index * 2);
            end += topic.length;
        });
        offsets.writeUInt16LE(end, topics.length * 2);
        assert(end <= 8192, 'help fixture fits one ROM bank');
        const fixture = Buffer.concat([offsets, ...topics]);
        const bytes = fs.readFileSync(crt);
        const bank = JSON.parse(fs.readFileSync('build/easyflash/layout.json')).helpBank;
        let replaced = false;
        for (let at = bytes.readUInt32BE(16); at < bytes.length; at += bytes.readUInt32BE(at + 4)) {
            if (bytes.readUInt16BE(at + 10) === bank && bytes.readUInt16BE(at + 12) === 0x8000) {
                bytes.fill(255, at + 16, at + 16 + 8192);
                fixture.copy(bytes, at + 16);
                replaced = true;
            }
        }
        assert(replaced, 'help ROM packet found');
        fs.writeFileSync(crt, bytes);
    })
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
