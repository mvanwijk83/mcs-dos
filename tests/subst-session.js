// Real parser, bank gates, IEC file operations, restrictions and physical takeover.
const assert = require('assert/strict');
const fs = require('fs');
const {execFileSync} = require('child_process');
const {root, tool} = require('./setup');
const help = require('../src/command-help.json');
require('./shell')('subst-session', async ({disk, command, enter, keys, until}) => {
    async function fresh(cmd) { await enter('cls'); return enter(cmd); }
    let text = await fresh('subst d: 8:\\');
    assert(!text.includes('Invalid'), text);
    assert((await fresh('subst')).includes('11: => 8:\\'));
    text = await fresh('sysinfo');
    assert(!text.includes('Drive 11:'), text);
    await enter('mode drv ids=dos');
    assert((await fresh('subst')).includes('D: => A:\\'));
    await enter('mode drv ids=c64');
    await enter('echo preserved >d:\\original');
    assert((await fresh('type 8:original')).includes('preserved'));
    text = await fresh('copy d:original 8:original');
    assert(text.includes('onto itself'), text);
    text = await fresh('type d:original >8:original');
    assert(text.includes('onto itself'), text);
    assert((await fresh('type 8:original')).includes('preserved'));
    await enter('ren d:original 8:renamed');
    assert((await fresh('type d:renamed')).includes('preserved'));
    text = await fresh('dir d:');
    assert(text.includes('Directory of 11:\\'), text);
    text = await fresh('vol d:');
    assert(text.includes('Volume in drive 11:') && text.includes('TEST'), text);
    const blocked = [
        ['chkdsk d:', 'Cannot CHKDSK a SUBSTed or ASSIGNed\ndrive'],
        ['diskcopy d: 8:', 'Cannot copy a SUBSTed drive'],
        ['diskcopy 8: d:', 'Cannot copy a SUBSTed drive'],
        ['diskinit d:', 'Cannot initialize a SUBSTed drive'],
        ['format d:', 'Cannot format a SUBSTed or ASSIGNed\ndrive'],
        ['label d:', 'Cannot label a SUBSTed or ASSIGNed drive'],
        ['diskid d: ab', 'Cannot label a SUBSTed or ASSIGNed drive'],
        ['mount anything.d64 d:', 'Cannot mount to a SUBSTed drive'],
        ['unmount d:', 'Cannot unmount a SUBSTed drive']
    ];
    for (const [cmd, message] of blocked) {
        text = await fresh(cmd); assert(text.includes(message), text);
    }
    await enter('d:');
    text = await fresh('diskinit');
    assert(text.includes('Cannot initialize a SUBSTed drive'), text);
    text = await fresh('subst d: /d');
    assert(text.includes('Invalid drive specification'), text);
    await enter('8:');
    for (const drive of ['e', 'f', 'g', 'h']) await enter(`subst ${drive}: 8:\\`);
    assert((await fresh('subst i: 8:\\')).includes('Too many substitutions'));
    for (const drive of ['e', 'f', 'g', 'h']) await enter(`subst ${drive}: /d`);
    await enter('help subst >help.txt');
    // Exact help bytes are also packed and checked by the image suite.
    assert(help.SUBST.startsWith('Associates a path with a drive letter\nor number.'));
    await enter('subst d: /d');
    await enter('subst d: 0:\\');
    const physical = (root + '/build/test-subst-physical.d64').replaceAll('\\', '/');
    fs.writeFileSync('build/test-subst-physical.txt', require('../scripts/petscii')('physical drive\r'));
    execFileSync(tool('vice', 'c1541'), ['-format', 'physical,ss', 'd64', physical,
        '-attach', physical, '-write', 'build/test-subst-physical.txt', 'takeover,s'],
        {windowsHide: true, stdio: 'pipe'});
    await command('resourceset "Drive11Type" "1541"');
    await command(`attach "${physical}" $0b`);
    await command('x');
    await new Promise(resolve => setTimeout(resolve, 2000));
    text = await fresh('type d:takeover');
    assert(text.includes('physical drive') && !text.includes('Invalid drive specification'), text);
    text = await fresh('subst');
    assert(!text.includes('=>'), text);
    assert((await fresh('subst d: 0:\\')).includes('Invalid drive specification'));
    await command('detach $0b');
    await command('resourceset "Drive11Type" "0"');
    // A stock 1581 provides real nested partitions, independently of CMD ROMs.
    const d81 = (root + '/build/test-subst-paths.d81').replaceAll('\\', '/');
    execFileSync(tool('vice', 'c1541'), ['-format', 'substitution,ss', 'd81', d81],
        {windowsHide: true, stdio: 'pipe'});
    await command('detach 8');
    await command('resourceset "Drive8Type" "1581"');
    await command(`attach "${d81}" 8`);
    async function at(cmd, prompt) {
        await keys(cmd.replaceAll('\\', '\\x5c') + '\\x0d');
        return until(s => s.endsWith(prompt));
    }
    await enter('md games /size:400');
    await enter('md games\\sub /size:120');
    await enter('echo nested >games\\sub\\note');
    await enter('echo target >games\\file');
    assert(!(await fresh('subst d: 8:\\games')).includes('Invalid'), 'directory assignment');
    text = await fresh('dir d:');
    assert(text.includes('Directory of 11:\\') && !/^\.\.?\s+<DIR>$/m.test(text), text);
    await enter('d:');
    await at('cd sub', '11:\\SUB>');
    text = await at('rd d:\\sub /s /p', '11:\\SUB>');
    assert(text.includes('Cannot remove current directory'), text);
    text = await at('cd 8:', '11:\\SUB>');
    assert(text.includes('8:\\') && !text.includes('8:\\GAMES'), text);
    await at('cd ..\\..\\..', '11:\\>');
    assert((await fresh('type \\file')).includes('target'));
    assert((await fresh('type ..\\file')).includes('target'));
    assert((await fresh('rd d:\\ /s /p')).includes('Invalid destination'));
    assert((await fresh('ren d:\\ other')).includes('Invalid destination'));
    await enter('8:');
    text = await fresh('copy d:file 8:\\games\\file');
    assert(text.includes('onto itself'), text);
    text = await fresh('find "target" d:file >8:\\games\\file');
    assert(text.includes('onto itself'), text);
    await enter('subst e: d:\\sub');
    await enter('subst d: /d');
    assert((await fresh('type e:note')).includes('nested'));
    await enter('e:');
    await keys('basic\\x0d');
    await until(s => s.endsWith('ready.'));
    await keys('shell\\x0d');
    await until(s => s.endsWith('12:\\>'));
    assert((await fresh('type note')).includes('nested'));
    await enter('8:');
    await enter('subst e: /d');
    await enter('subst d: 8:\\games');
    await enter('rd games /s /p');
    assert((await fresh('subst')).includes('11: => 8:\\GAMES'), 'missing targets retain assignment');
    await enter('subst d: /d');
    text = await fresh('subst d: 8:\\games');
    assert(text.includes('Invalid path'), text);
    console.log('PASS SUBST shell file identity, redirection protection, volume/display modes, command guards, capacity and immediate physical takeover');
}).catch(error => { console.error(error); process.exitCode = 1; });
