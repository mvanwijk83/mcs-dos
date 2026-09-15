const {tool} = require('./setup');
// Owns a VICE process and disk; accepts any PRG for baseline/optimizer comparison.
const fs=require('fs'),net=require('net'),path=require('path'),assert=require('assert/strict');
const {spawn,execFileSync}=require('child_process');
const root=path.resolve('.').replaceAll('\\','/'),prg=path.resolve(process.argv[2]||'build/MCS-DOS.prg').replaceAll('\\','/');
const delay=ms=>new Promise(r=>setTimeout(r,ms));let child,socket;const snapshots=[];
let monitorPort;
async function command(text){return new Promise((resolve,reject)=>{
 let out='',timer;const conn=net.connect(monitorPort,'127.0.0.1',()=>conn.write(text+'\n'));
 conn.on('error',reject);conn.on('data',d=>{out+=d;clearTimeout(timer);timer=setTimeout(()=>{conn.destroy();resolve(out)},180)});
 timer=setTimeout(()=>{conn.destroy();resolve(out)},3000);
});}
async function memory(a,b=a){const out=await command(`m ${a.toString(16)} ${b.toString(16)}`),bytes=[];for(const line of out.split('\n')){const m=line.match(/>C:([\da-f]{4})\s+(.{1,50})/i);if(m)bytes.push(...m[2].trim().split(/\s+/).filter(v=>/^[\da-f]{2}$/i.test(v)).map(v=>parseInt(v,16)));}assert.equal(bytes.length,b-a+1,out);return bytes;}
async function screen(){const base=(await memory(0x288))[0]*256;await command('bank ram');const bytes=await memory(base,base+999);await command('bank cpu');let s='';for(let i=0;i<1000;i+=40)s+=bytes.slice(i,i+40).map(v=>{v&=127;return String.fromCharCode(v>=1&&v<=26?v+96:v);}).join('').trimEnd()+'\n';return s.trimEnd();}
async function keys(s,ms=550){await command('keybuf '+s);await command('x');await delay(ms);const out=await screen();snapshots.push({keys:s,out});return out;}
async function enter(s,ms){return keys(s+'\\x0d',ms);}
async function check(cmd,expected,ms=900){await enter('cls');const s=await enter(cmd,ms);if(!s.includes(expected)){const map=fs.readFileSync(prg.replace(/\.prg$/,'.map'),'utf8');for(const name of ['count','p1','files','argc','args']){const m=map.match(new RegExp('^([0-9a-f]+) - [0-9a-f]+ : '+name+',','m'));if(m)console.log(name,await memory(parseInt(m[1],16),parseInt(m[1],16)+19));}}assert(s.includes(expected),cmd+'\n'+s);console.log('PASS '+cmd);return s;}
(async()=>{
const disk=root+'/build/test-oscar64.d64';fs.copyFileSync('build/MCS-DOS.d64',disk);
fs.writeFileSync('build/oscar-autoexec',Buffer.from('@ECHO OFF\rSET DRIVEIDS=DOS\r'));
fs.writeFileSync('build/oscar-existing',Buffer.from('OLD\r'));
// Header deliberately differs from /A destination: verify forced load and jump.
fs.writeFileSync('build/launch-absolute.prg',Buffer.from([0,0x20,0xa9,0x5a,0x8d,0xa7,2,0x4c,5,0xc0]));
execFileSync(tool('vice', 'c1541'),['-attach',disk,'-write','build/oscar-autoexec','autoexec.bat,s','-write','build/oscar-existing','existing,s','-write','build/DEMO.prg','demo','-write','build/launch-absolute.prg','absolute'],{stdio:'pipe'});
const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
child=spawn(tool('vice', 'x64sc'),['-default','-sounddev','dummy','-warp','-8',disk,'-remotemonitoraddress','127.0.0.1:'+port,'-remotemonitor'],{windowsHide:true,stdio:['ignore','ignore','pipe']});child.stderr.on('data',d=>fs.appendFileSync('build/oscar64/vice.log',d));
for(let i=0;i<100;i++){try{socket=net.connect(port,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j)});break;}catch(e){socket.destroy();socket=null;await delay(100);}}assert(socket);socket.destroy();monitorPort=port;
for(let i=0;i<40;i++){await command('x');await delay(200);if((await screen()).includes('ready.'))break;}assert((await screen()).includes('ready.'));await command('load "'+prg+'" 0');await command('> ba 08');let s=await enter('run',3000);console.log('BOOT\n'+s);assert(s.includes('A:'),s);
if(process.argv.includes('--quick')){
 await check('help cls','Clears',2000);
 await check('dir /b/on','COMMANDS.HLP',2000);
 await check('find /i/c "set" autoexec.sample',': 4',2000);
 await check('dir /b/o-s','AUTOEXEC.SAMPLE',2000);
 return;
}
if(!process.argv.includes('--launch-only')) {
await check('echo hello','hello');await check('help','Aliases:');await check('mem','bytes free');
await check('set custom=value','A:');await check('set','CUSTOM=value');
await check('dir /b','COMMANDS.HLP',2000);await keys(' ');
await check('help set','Displays, sets, or removes',2000);await keys(' ');
await check('echo one >one','A:',1800);await check('type one','one',1500);
await enter('edit existing',1600);await keys('x');s=await keys('\\x03');assert(s.includes('Save changes'),s);s=await keys('y',1800);assert(/Overwrite|Replace|already exists/i.test(s),s);await keys('n',1200);await check('type existing','old',1500);
await enter('edit created',1500);await keys('abc');await keys('\\x03');s=await keys('y',2000);assert(!s.includes('error'),s);await check('type created','abc',1500);
await enter('reboot',3000);await check('echo restarted','restarted');
await enter('exit',700);s=await enter('print 2+2',700);assert(s.includes(' 4'),s);await enter('new');await enter('10 print 7*6');s=await enter('run');assert(s.includes(' 42'),s);console.log('PASS editor save/refusal, REBOOT, EXIT and BASIC expressions/program');
} else { await enter('exit',700); }
await command('load "'+prg+'" 0');await command('> ba 08');s=await enter('run',6000);assert(s.trimEnd().endsWith('A:>'),s);s=await enter('run demo',4000);assert(s.includes('hello from basic!'),s);console.log('PASS BASIC PRG launch');
await command('load "'+prg+'" 0');await command('> ba 08');s=await enter('run',6000);assert(s.trimEnd().endsWith('A:>'),s);
await command('> 02a7 00');await enter('run absolute /a 49152',4000);
assert.equal((await memory(0x02a7))[0],0x5a,'Absolute PRG did not execute at the requested address');
console.log('PASS absolute PRG load address and jump');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{fs.writeFileSync('build/oscar64/regression-'+path.basename(prg)+'.json',JSON.stringify(snapshots,null,2));socket?.destroy();if(child&&child.exitCode===null)child.kill();});
