require('./setup');
const fs = require('fs'), assert = require('assert/strict');
const {execFileSync} = require('child_process'), {tool} = require('./setup');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
require('./shell')('key-session', async ({disk, command, keys, enter, screen, memory, until, monitorPort}) => {
    const map = fs.readFileSync('build/easyflash/shell.map', 'utf8');
    const location = map.match(/^([0-9a-f]+) - [0-9a-f]+ : keybindings,/m);
    assert(location);
    const at = parseInt(location[1], 16);
    const bindings = () => memory(at, at + 255);
    const asm = fs.readFileSync('build/easyflash/shell-crt.asm', 'utf8');
    const ctrlRead = asm.match(/^05:([0-9a-f]+) : ad 8d 02 LDA \$028d[^\n]*\n05:[0-9a-f]+ : 29 04 __ AND #\$04/m);
    assert(ctrlRead, 'CTRL modifier check in the editor bank');
    fs.writeFileSync('build/key-program.prg', Buffer.from([
        1,8,11,8,10,0,0x9e,50,48,54,49,0,0,0,0xa9,0x41,0x8d,0xf0,0xc2,0x60
    ]));
    await command('detach 8');
    execFileSync(tool('vice','c1541'), ['-attach',disk,'-write','build/key-program.prg','my program,p'],
        {stdio:'pipe',windowsHide:true});
    await command(`attach "${disk}" 8`);
    await enter('dir /b');
    await enter('key /f1:help /f4:dir/w /f7:"my program"');
    await enter('cls');
    let text = await enter('key');
    assert(/  F1  HELP/i.test(text) && /  F4  DIR\/W/i.test(text) && /  F7  "MY PROGRAM"/i.test(text),text);
    await enter('cls');
    text = await enter('key /f4');
    assert(/  F4  DIR\/W/i.test(text) && !/  F1  HELP/i.test(text), text);
    await keys('discard');
    text = await keys('\\x85');
    assert(/8:>HELP$/i.test(text), text);
    assert.equal((await keys('\\x86')).split('\n').at(-1),text.split('\n').at(-1),'unbound F3 keeps input');
    await keys('\\x03');
    text = await keys('\\x8a');
    assert(/8:>DIR\/W$/i.test(text),text);
    await keys('\\x03');
    // VICE's monitor strips leading whitespace from keybuf arguments. Keep the
    // space after ECHO in the first chunk rather than at the start of the second.
    const combined = 'key /f2:echo TWO /f3:echo THREE /f5:echo FIVE /f6:echo SIX';
    await keys(combined.slice(0, 41));
    await keys(combined.slice(41));
    await enter('');
    for(const [code,name] of [['89','TWO'],['86','THREE'],['87','FIVE'],['8b','SIX']]) {
        text = await keys('\\x'+code);
        assert(new RegExp('8:>ECHO '+name+'$','i').test(text),text);
        await keys('\\x03');
    }
    console.log('PASS KEY lists, queries and seven function-key recalls');
    // Store two redirection operators literally instead of opening output files.
    await enter('key /f1:echo A >one /f3:echo B >two');
    await enter('cls');
    text = await enter('key /f1 /f3');
    assert(/  F1  ECHO A >ONE/i.test(text) && /  F3  ECHO B >TWO/i.test(text),text);
    await enter('key /f1:echo CTRL-MARK');
    await enter('cls');
    // Keep the monitor connection alive across the immediate checkpoint. VICE
    // sends the break notification to that connection and stops accepting new ones.
    const conn = require('net').connect(monitorPort, '127.0.0.1');
    await new Promise((resolve,reject) => {conn.once('connect',resolve);conn.once('error',reject);});
    let receive;
    conn.on('data',data => receive?.(data.toString()));
    async function request(text) {
        return new Promise((resolve,reject) => {
            let output = '', idle;
            const deadline = setTimeout(() => finish(Error('Checkpoint monitor timeout: '+text)),5000);
            function finish(error) {
                clearTimeout(deadline);clearTimeout(idle);receive=null;
                error ? reject(error) : resolve(output);
            }
            receive = data => {output+=data;clearTimeout(idle);idle=setTimeout(() => finish(),180);};
            conn.write(text+'\n');
        });
    }
    try {
        const point = (await request('break exec '+ctrlRead[1])).match(/(?:BREAK|WATCH):\s*(\d+)/i);
        assert(point);
        await request('keybuf \\x85');
        conn.write('x\n');
        await delay(800);
        assert((await request('r')).toLowerCase().includes(ctrlRead[1]),'paused at CTRL check');
        await request('> 028d 04');
        conn.write('step 1\n');
        await delay(200);
        const afterRead = (parseInt(ctrlRead[1],16)+3).toString(16);
        assert((await request('r')).toLowerCase().includes(afterRead),'CTRL modifier read completed');
        await request('> 028d 00');
        await request('delete '+point[1]);
        conn.write('x\n');
        await delay(500);
    } finally {conn.destroy();}
    text = await until(s => s.endsWith('8:>'));
    assert(/\nCTRL-MARK\n/i.test(text),'CTRL function key executes without Enter: '+text);
    console.log('PASS KEY literal redirections and CTRL execution');
    const saved = await bindings();
    await command('> c2f0 00');
    text = await keys('\\x88');
    assert(/8:>"MY PROGRAM"$/i.test(text),text);
    await enter('');
    assert.equal((await memory(0xc2f0))[0],0x41,'function-key program executes');
    assert.deepEqual(await bindings(),saved,'bindings survive native return');
    console.log('PASS KEY native program return');
    await keys('basic\\x0d',3500);
    await until(s=>s.endsWith('ready.'));
    await keys('shell\\x0d',3500);
    await until(s=>s.endsWith('8:>'));
    assert.deepEqual(await bindings(),saved,'bindings survive BASIC/SHELL');
    console.log('PASS KEY BASIC/SHELL return');
    await enter('key /clear:4');
    text = await keys('\\x8a');
    assert(text.endsWith('8:>'),'cleared F4 leaves prompt unchanged: '+text);
    await enter('key /clear');
    assert((await bindings()).every(v=>v===0));
    await enter('key /f1:help');
    await enter('reboot');
    assert((await bindings()).every(v=>v===0),'REBOOT clears bindings');
    console.log('PASS KEY raw definitions/list/query, seven keys, CTRL execution, program/BASIC persistence, clear options and REBOOT');
}).catch(error=>{console.error(error);process.exitCode=1;});
