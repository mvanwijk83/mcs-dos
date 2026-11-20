// Own a CMD-HD VICE process and disposable files. ROMs stay in assets/build;
// neither ROM data nor initialized DOS images belong in the repository.
const {tool}=require('./setup');
const fs=require('fs'), net=require('net'), path=require('path'), assert=require('assert/strict');
const {spawn,execFileSync}=require('child_process'), monitor=require('./monitor');
const messages=require('./output');
const copyComplete=messages.SYSOUT_COPY_COMPLETE.trim();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const native=p=>path.resolve(p);
const monitorPath=p=>native(p).replaceAll('\\','/');

/** Start VICE with the purchased boot ROM and an owned HD image. */
async function start(image,disk,crt=false,hdOnly=false) {
    const rom=fs.readFileSync(process.env.CMD_HD_ROM||'assets/cmd_hd_bootrom_v2.80.bin');
    assert(rom.length===16384 || (rom.length===32768 && rom.subarray(0,16384).equals(rom.subarray(16384))),
        'CMD ROM must be 16 KiB or two identical 16 KiB copies');
    const bootrom=image+'.bootrom.bin';
    fs.writeFileSync(bootrom,rom.subarray(0,16384));
    const server=net.createServer();
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const port=server.address().port;
    await new Promise(r=>server.close(r));
    const args=['-console','-default','-sounddev','dummy','-warp','-dosCMDHD',native(bootrom),
        '-drive8type',hdOnly?'4844':'1541','-drive9type',hdOnly?'0':'4844',
        hdOnly?'-drive8fixedsize':'-drive9fixedsize','33554432',
        '-8',native(hdOnly?image:disk),...(hdOnly?[]:['-9',native(image)]),'-remotemonitor','-remotemonitoraddress','127.0.0.1:'+port];
    const child=spawn(tool('vice','x64sc'),args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let socket, launchError, log='';
    child.on('error',e=>launchError=e);
    child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
    const command=require('./vice-command')(()=>socket);
    async function screen(){
        const base=(await monitor.memory(command,0x288))[0]*256;
        await command('bank ram');const bytes=await monitor.memory(command,base,base+999);
        await command('bank cpu');return monitor.rows(bytes).join('\n');
    }
    async function wait(expected,timeout=expected===copyComplete ? 1800000 : 45000){
        const legacyPrompt=expected.endsWith(':>'), prompt=/^[0-9A-W]+:.*>$/.test(expected);
        const device=legacyPrompt ? expected.slice(0,-1) : '';
        const until=Date.now()+timeout;let s='';
        while(Date.now()<until){
            await command('x');await delay(expected===copyComplete ? 10000 : 500);s=await screen();
            if(expected===copyComplete && s.includes(messages.SYSOUT_DISK_COPY_NOT_COMPLETED.trim()))
                assert.fail(s);
            const last=s.trimEnd().split('\n').pop();
            if(legacyPrompt ? last.startsWith(device)&&last.endsWith('>') :
               prompt||expected==='ready.' ? s.trimEnd().endsWith(expected) : s.includes(expected))return s;
        }
        fs.writeFileSync(image+'.timeout.txt',(await command('r'))+'\n'+(await command('m de00 de02')));
        assert.fail('Waiting for '+expected+'\n'+s);
    }
    async function keys(text){await command('keybuf '+text);await command('x');await delay(200);}
    async function enter(text,expected='9:>'){
        await keys(text.replaceAll('\\','\\x5c')+'\\x0d');return wait(expected);
    }
    async function check(text,expected){await enter('cls');const s=await enter(text,expected);console.log('PASS '+text+' => '+expected);return s;}
    async function stop(){socket?.destroy();if(child.exitCode===null){child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),delay(3000)]);}fs.writeFileSync(image+'.vice.log',log);}
    try{
        for(let i=0;i<150;i++){
            if(launchError)throw launchError;
            if(child.exitCode!==null)throw Error('VICE exited: '+log);
            try{socket=net.connect(port,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j)});break;}
            catch{socket.destroy();socket=null;await delay(100);}
        }
        assert(socket,'VICE monitor unavailable: '+log);socket.on('error',()=>{});
        await command('x');await delay(1500);
        const resource=await command('resourceget "Drive9Type"');assert(resource.includes(hdOnly?'=0':'=4844'),resource);
        if(crt){
            const cartridge=image+'.crt';
            fs.copyFileSync('build/easyflash/MCS-DOS.crt',cartridge);
            await command('attach "'+monitorPath(cartridge)+'" $20');
            await command('reset 1');await wait('0:>');await enter(hdOnly?'8:':'9:',hdOnly?'8:>':'9:>');
        }
        return{command,screen,wait,keys,enter,check,stop};
    }catch(e){await stop();throw e;}
}

/** Install DOS through the supplied utility, retaining only a private build cache. */
async function seed(){
    const file='build/cmd-hd-seed.dhd';
    if(fs.existsSync(file)){
        const b=fs.readFileSync(file);if(b.subarray(384*512+0x5f0,384*512+0x5f8).toString()==='CMD HD  ')return b;
    }
    fs.writeFileSync(file,Buffer.alloc(0));
    fs.copyFileSync(process.env.CMD_HD_UTILITIES||'assets/hd-utilities.d64','build/cmd-hd-utilities.d64');
    const s=await start(file,'build/cmd-hd-utilities.d64');
    try{
        await s.enter('load"create sys",8','ready.');
        await s.enter('run','press <return>');
        await s.keys('\\x0d');await s.wait('total storage =');
        await s.keys('\\x0d');await s.wait('clear area below system?');
        await s.keys('n');await s.wait('press reset on hd to reboot dos',60000);
        console.log('PASS CREATE SYS installed CMD HD DOS from supplied utilities');
    }finally{await s.stop();}
    const b=fs.readFileSync(file);assert.equal(b.subarray(384*512+0x5f0,384*512+0x5f8).toString(),'CMD HD  ');return b;
}

/** Embed independent c1541 floppy images in a documented CMD partition table. */
async function fixture(file,nativeSectors=256){
    const b=Buffer.alloc(33554432);(await seed()).copy(b);
    const table=384*512+65536;
    const specs=[[1,2,'1541'],[2,3,'1571'],[3,4,'1581'],[4,1,'NATIVE'],[5,2,'TARGET41'],[6,3,'TARGET71'],[7,4,'TARGET81'],[13,2,'PART13']];
    let lba=384+144;
    const parts=specs.map(([number,type,name])=>{
        const sectors=type===2?684:type===3?1368:type===4?3200:nativeSectors,entry=table+number*32;
        b[entry+2]=type;b.fill(160,entry+5,entry+21);b.write(name,entry+5,'ascii');
        b.writeUIntBE(lba,entry+21,3);b.writeUInt16BE(sectors/2,entry+30);
        if(type>1){const ext=type===2?'d64':type===3?'d71':'d81',p='build/cmd-part-'+number+'.'+ext;
            execFileSync(tool('vice','c1541'),['-format',name.toLowerCase()+',ct',ext,p],{stdio:'pipe',windowsHide:true});
            fs.readFileSync(p).copy(b,lba*512);
        }
        if(type===1){
            const o=lba*512;
            b[o+256]=1;b[o+257]=34;b[o+258]=72;
            b.fill(160,o+260,o+276);b.write('NATIVE',o+260,'ascii');
            b.write('CT',o+278,'ascii');b[o+280]=160;b[o+281]=49;b[o+282]=72;b[o+283]=b[o+284]=160;
            b[o+256+32]=1;b[o+256+33]=1;
            b[o+512+2]=72;b[o+512+3]=183;b.write('CT',o+516,'ascii');b[o+518]=192;b[o+512+8]=sectors/256;
            b.fill(255,o+512+40,o+512+64);
            b[o+34*256+1]=255;
        }
        const result={number,type,name,offset:lba*512,bytes:sectors*256};lba+=sectors/2;return result;
    });
    for(let i=0;i<32;i++){b[table+i*256]=i===31?0:1;b[table+i*256+1]=i===31?255:i+1;}
    fs.writeFileSync(file,b);return parts;
}
module.exports={start,fixture,monitorPath};
