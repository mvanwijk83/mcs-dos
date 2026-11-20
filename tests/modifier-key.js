// Present one modifier edge at the compiled keyboard read, so KERNAL IRQ
// scanning cannot clear a synthetic modifier before the editor sees it.
const fs = require('fs'), net = require('net'), assert = require('assert/strict');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
module.exports = async function modifierKey(port, modifier = 2) {
    const asm = fs.readFileSync('build/easyflash/shell-crt.asm', 'utf8');
    const read = asm.match(/^05:([0-9a-f]+) : ad 8d 02 LDA \$028d[^\n]*\n05:[0-9a-f]+ : 29 02 __ AND #\$02/m);
    assert(read, 'Commodore modifier read in the editor bank');
    const conn = net.connect(port, '127.0.0.1');
    await new Promise((resolve, reject) => {
        conn.once('connect', resolve);
        conn.once('error', reject);
    });
    let receive, point;
    conn.on('data', data => receive?.(data.toString()));
    function request(text) {
        return new Promise((resolve, reject) => {
            let output = '', idle;
            const deadline = setTimeout(() => finish(Error('Modifier monitor timeout: ' + text)), 5000);
            function finish(error) {
                clearTimeout(deadline);
                clearTimeout(idle);
                receive = null;
                error ? reject(error) : resolve(output);
            }
            receive = data => {
                output += data;
                clearTimeout(idle);
                idle = setTimeout(() => finish(), 180);
            };
            conn.write(text + '\n');
        });
    }
    try {
        const match = (await request('break exec ' + read[1])).match(/(?:BREAK|WATCH):\s*(\d+)/i);
        assert(match, 'modifier checkpoint installed');
        point = match[1];
        conn.write('x\n');
        await delay(300);
        assert((await request('r')).toLowerCase().includes(read[1]), 'paused at modifier read');
        await request('> 028d ' + modifier.toString(16).padStart(2, '0'));
        conn.write('step 1\n');
        await delay(200);
        const next = (parseInt(read[1], 16) + 3).toString(16);
        assert((await request('r')).toLowerCase().includes(next), 'modifier value consumed');
        await request('> 028d 00');
        await request('delete ' + point);
        point = null;
        conn.write('x\n');
        await delay(150);
    } finally {
        if (point) {
            await request('> 028d 00');
            await request('delete ' + point);
            conn.write('x\n');
        }
        conn.destroy();
    }
};
