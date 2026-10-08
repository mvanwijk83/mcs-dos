const fs=require('fs'),path=require('path'),{execFileSync:exec}=require('child_process');
const {tool,setup}=require('./toolchain'); setup();
const out='build/easyflash'; fs.mkdirSync(out,{recursive:true});
const compile=args=>exec(tool('oscar64','oscar64'),args,{stdio:'inherit',windowsHide:true});
const binary=(name,source=`src/easyflash/${name}.c`,extra=[])=>compile(['-n','-Os','-Oo','-psci','-rt=','-tf=bin',...extra,`-o=${out}/${name}.bin`,source]);
exec(process.execPath,['scripts/make-hardware.js'],{stdio:'inherit',windowsHide:true});
exec(process.execPath,['scripts/make-help.js'],{stdio:'inherit',windowsHide:true});
binary('wedge');
const wedge=fs.readFileSync(`${out}/wedge.bin`);
if(wedge.length>480)throw Error('BASIC wedge overlaps handoff descriptor');
fs.writeFileSync(`${out}/wedge.h`,'static const unsigned char wedge_image[]={'+[...wedge].join(',')+'};\n');
binary('bridge');
binary('run');
const run=fs.readFileSync(`${out}/run.bin`); if(run.length>172) throw Error('Cartridge launch loader overflow');
fs.writeFileSync(`${out}/run.h`,'static const unsigned char cart_run[]={'+[...run].join(',')+'};\n');
const bridge=fs.readFileSync(`${out}/bridge.bin`);
if(bridge.length>255) throw Error('Bank bridge exceeds bootstrap copy loop');
fs.writeFileSync(`${out}/bridge.h`,'static const unsigned char cart_bridge[]={'+[...bridge].join(',')+'};\n');
// Keep the installed compiler's arithmetic runtime, but use our bank entry
// instead of its program startup. No fork of compiler runtime is vendored.
const executable=tool('oscar64','oscar64');
const compiler=path.isAbsolute(executable)?executable:(process.env.PATH||'').split(path.delimiter)
 .map(dir=>path.resolve(dir,executable)).find(file=>fs.existsSync(file));
if(!compiler) throw Error('Cannot locate Oscar64 runtime; set OSCAR64_HOME');
const runtime=fs.readFileSync(path.resolve(path.dirname(compiler),'../include/crt.c'),'utf8')
 .replace('#pragma startup(startup)','').replace(/\bstartup\b/g,'runtime_startup');
fs.writeFileSync(`${out}/runtime.c`,runtime);
binary('tape-bridge');
const tapeBridge=fs.readFileSync(`${out}/tape-bridge.bin`);
if(tapeBridge.length>0x300)throw Error('Tape bridge overlaps parameter area');
fs.writeFileSync(`${out}/tape-bridge.h`,'static const unsigned char tape_bridge[]={'+[...tapeBridge].join(',')+'};\n');
compile(['-n','-Os','-Oo','-psci',`-rt=${out}/runtime.c`,'-tf=bin',`-o=${out}/tape.bin`,'src/easyflash/tape.c']);
compile(['-n','-Os','-Oo','-psci',`-dCART_RUN_SIZE=${run.length}`,`-rt=${out}/runtime.c`,'-tf=bin',`-o=${out}/fs.bin`,'src/easyflash/fs.c']);
// Identical runtime and layout for both links: PRG supplies resident RAM,
// CRT supplies named ROM banks. Assert the complete generated code agrees.
fs.writeFileSync(`${out}/shell-runtime.c`,'#undef OSCAR_TARGET_CRT_EASYFLASH\n#undef OSCAR_BASIC_START\n#define OSCAR_BASIC_START 0x0801\n'+
 fs.readFileSync(path.resolve(path.dirname(compiler),'../include/crt.c'),'utf8'));
for(const format of ['prg','crt']) compile(['-n','-Os','-Oo','-psci',`-rt=${out}/shell-runtime.c`,
 `-tf=${format}`,`-o=${out}/shell-${format}.${format}`,'src/mcsdos.c']);
if(!fs.readFileSync(`${out}/shell-prg.asm`).equals(fs.readFileSync(`${out}/shell-crt.asm`)))
 throw Error('Resident and banked links disagree');
for(const extension of ['prg','map','asm','lbl'])fs.copyFileSync(`${out}/shell-prg.${extension}`,`${out}/shell.${extension}`);
const map=fs.readFileSync(`${out}/shell.map`,'utf8');
const bss=map.match(/^[\da-f]+ - ([\da-f]+) : BSS, bss/m);
if(!bss||parseInt(bss[1],16)>0xa000) throw Error('Resident shell overlaps ROM window');
const code=map.match(/^([\da-f]+) - ([\da-f]+) : DATA, code/m);
// Filesystem calls temporarily expose ROML too; resident services must be
// below $8000 even though persistent data may extend through $9FFF.
if(!code||parseInt(code[2],16)>0x8000)throw Error('Resident code overlaps filesystem ROML');
const commandBanks=['edit','fileutil','filemgmt','disk','boot'].map((name,i)=>{
 const sections=[...map.matchAll(new RegExp(`^([\\da-f]+) - ([\\da-f]+) : DATA, ${name}_(?:code|data)$`,'gm'))]
  .map(m=>[parseInt(m[1],16),parseInt(m[2],16)]).filter(([a,b])=>b>a);
 if(!sections.length||sections.some(([a,b])=>a<0xa000||b>0xc000))throw Error('Command bank overflow: '+name);
 const used=Math.max(...sections.map(s=>s[1]))-0xa000;
 return {name,bank:i+5,used,free:8192-used};
});
const prg=fs.readFileSync(`${out}/shell.prg`),payload=prg.subarray(2);
const entry=Number(prg.subarray(6,32).toString('latin1').match(/\x9e(\d+)\x00/)[1]);
if(prg.readUInt16LE(0)!==0x0801||payload.length>3*16384) throw Error('Shell payload overlaps driver bank');
binary('loader','src/easyflash/loader.c',[`-dPAYLOAD_PAGES=${Math.ceil(payload.length/256)}`,`-dPAYLOAD_ENTRY=${entry}`,`-dBRIDGE_LENGTH=${bridge.length}`]);
const loader=fs.readFileSync(`${out}/loader.bin`);
if(loader.length>172||loader.indexOf(Buffer.from([0xa9,0x37,0x85,1,0x4c,0x74,0xa4]))+0x0334<0x0380) throw Error('Loader/caret collision');
fs.writeFileSync(`${out}/init.c`,`#pragma section(startup,0)
#pragma region(startup,0x8000,0xa000,,, {startup})
#pragma optimize(noasm)
__asm startup {
 lda #0
 sta 0xc1e0
 jsr 0xff84
 jsr 0xff87
 jsr 0xff8a
 jsr 0xff81
 jsr 0xe453
 jsr 0xe3bf
 sei
 ldx #0
copy:
 lda bytes,x
 sta 0x0334,x
 inx
 cpx #${loader.length}
 bne copy
 jmp 0x0334
bytes:
 byt ${[...loader].join(',')}
}
#pragma startup(startup)`);
binary('init',`${out}/init.c`); binary('boot');
const rom=Buffer.alloc(1048576,255);
function insert(bank,chip,bytes,offset=0){if(bytes.length+offset>8192)throw Error('ROM overflow');bytes.copy(rom,bank*16384+chip*8192+offset);}
insert(0,0,fs.readFileSync(`${out}/init.bin`)); insert(0,1,fs.readFileSync(`${out}/boot.bin`));
insert(0,1,fs.readFileSync('src/easyflash/eapi.bin'),0x1800);
insert(0,1,bridge,0x1000);
insert(0,0,loader,0x1000);insert(0,0,Buffer.from([loader.length]),0x10ff);
payload.copy(rom,16384);
const banks=fs.readFileSync(`${out}/shell-crt.crt`);
for(let at=64;at<banks.length;at+=banks.readUInt32BE(at+4)){
 const bank=banks.readUInt16BE(at+10),address=banks.readUInt16BE(at+12),length=banks.readUInt16BE(at+14);
 if(bank>=5&&bank<=9)banks.copy(rom,bank*16384+address-0x8000,at+16,at+16+length);
}
const driver=fs.readFileSync(`${out}/fs.bin`); if(driver.length>0x3f00)throw Error('Driver bank overflow'); driver.copy(rom,4*16384);
const executableBytes=prg.length+commandBanks.reduce((n,b)=>n+b.used,0);
if(run.length>120)throw Error('RUN loader exceeds transfer buffer'); insert(4,1,run,0x1f00);
const help=fs.readFileSync(`${out}/help.bin`);insert(10,0,help);
const tape=fs.readFileSync(`${out}/tape.bin`);insert(11,1,tape);
exec(process.execPath,['scripts/make-examples.js'],{stdio:'inherit',windowsHide:true});
fs.copyFileSync('disk-content/CGA.CPI','build/CGA.CPI');
fs.writeFileSync('build/AUTOEXEC.SAMPLE',require('./petscii')(fs.readFileSync('disk-content/AUTOEXEC.SAMPLE','utf8')));
// Configuration keys use unshifted PETSCII, as written by the shell's ECHO.
fs.writeFileSync('build/CONFIG.SAMPLE',require('./petscii')(fs.readFileSync('disk-content/CONFIG.SAMPLE','utf8').toLowerCase()));
const names=['AUTOEXEC.SAMPLE','CGA.CPI','CHANGELOG.TXT','CONFIG.SAMPLE','LICENSE.TXT','MANUAL.TXT'];
const {image,used,fileBytes,available}=require('./journal-image')(names);
for(let i=0;i<8;i++)insert(56+i,0,image.subarray(i*8192,(i+1)*8192));
const header=Buffer.alloc(64);header.write('C64 CARTRIDGE   ');header.writeUInt32BE(64,16);header.writeUInt16BE(0x100,20);header.writeUInt16BE(32,22);header[24]=1;header.write('MCS-DOS 2.1',32);
const packets=[header];
// Include complete filesystem and session sectors, including erased sides.
for(let bank=0;bank<64;bank++)if(bank<=11||bank>=48)for(let chip=0;chip<2;chip++){
 const h=Buffer.alloc(16);h.write('CHIP');h.writeUInt32BE(8208,4);h.writeUInt16BE(2,8);h.writeUInt16BE(bank,10);h.writeUInt16BE(chip?0xa000:0x8000,12);h.writeUInt16BE(8192,14);
 packets.push(h,rom.subarray(bank*16384+chip*8192,bank*16384+(chip+1)*8192));
}
fs.writeFileSync(`${out}/MCS-DOS.crt`,Buffer.concat(packets));
fs.writeFileSync(`${out}/SHA256SUMS.txt`,require('crypto').createHash('sha256').update(Buffer.concat(packets)).digest('hex')+'  MCS-DOS.crt\n');
const bssEnd=parseInt(bss[1],16),residentBytes=bssEnd-0x0801;
fs.writeFileSync(`${out}/layout.json`,JSON.stringify({entry,payload:payload.length,driver:driver.length,bridge:bridge.length,
 executableBytes,commandBanks,residentBytes,bssEnd,romWindow:{start:0xa000,end:0xc000},
 wedge:wedge.length,sessionBytes:3349,sessionBanks:[48,55],tapeBank:11,tapeBytes:tape.length,tapeBufferBytes:45056,
 freeRam:0xa000-bssEnd+0x400,freeRanges:[[bssEnd,0xa000],[0xc300,0xc700]],
 helpBank:10,helpBytes:help.length,filesystemVersion:3,used,fileBytes,available},null,2));
console.log('Built '+out+'/MCS-DOS.crt');

