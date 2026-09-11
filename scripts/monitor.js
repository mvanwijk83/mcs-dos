// VICE text-monitor helper. Operates only on the local emulator at port 6510.
const net = require('net');
const fs = require('fs');
const delay = ms => new Promise(r => setTimeout(r, ms));
async function command(text) {
  return new Promise((resolve,reject) => {
    let output = '', timer;
    const s = net.connect(6510,'127.0.0.1',()=>s.write(text+'\n'));
    s.on('error',reject);
    s.on('data',d=>{output+=d; clearTimeout(timer); timer=setTimeout(()=>{s.destroy();resolve(output)},100)});
    timer=setTimeout(()=>{s.destroy();resolve(output)},700);
  });
}
async function screen() {
  let page = await command('m 0288 0288');
  if(!page.includes('>C:')) page = await command('m 0288 0288');
  const base = parseInt(page.match(/>C:0288\s+([0-9a-f]{2})/i)[1],16)*256;
  await command('bank ram');
  const raw = await command('m '+base.toString(16)+' '+(base+999).toString(16));
  await command('bank cpu');
  const bytes=[];
  for(const line of raw.split('\n')) {
    const m=line.match(/>C:([0-9a-f]{4})  (.{1,50})/i);
    if(m) bytes.push(...m[2].trim().split(/\s+/).filter(v=>/^[0-9a-f]{2}$/i.test(v)).map(v=>parseInt(v,16)));
  }
  const rows=[];
  for(let i=0;i<1000;i+=40) rows.push(bytes.slice(i,i+40).map(v=>{
    v&=127;
    return v>=1&&v<=26 ? String.fromCharCode(v+96) : v>=65&&v<=90 ? String.fromCharCode(v) : v===0?'@':String.fromCharCode(v);
  }).join('').trimEnd());
  return rows.join('\n').trimEnd();
}
if(require.main===module) (async()=>{
  const mode=process.argv[2];
  if(mode==='screen') console.log(await screen());
  else if(mode==='cmd') console.log(await command(process.argv[3]));
  else if(mode==='keys') {
    console.log(await command('keybuf '+process.argv[3]));
    await command('x'); await delay(Number(process.argv[4]||1500)); console.log(await screen());
  } else if(mode==='script') {
    for(const step of JSON.parse(fs.readFileSync(process.argv[3],'utf8'))) {
      if(step.command) await command(step.command);
      if(step.keys) await command('keybuf '+step.keys);
      await command('x'); await delay(step.wait||500);
      const text=await screen();
      if(step.expect && !text.includes(step.expect)) throw Error('Expected '+step.expect+'\n'+text);
      console.log(step.expect?'PASS '+step.expect:text);
    }
  }
})().catch(e=>{console.error(e);process.exitCode=1});
module.exports={command,screen,delay};

