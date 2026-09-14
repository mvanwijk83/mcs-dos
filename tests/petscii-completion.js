// Preserve exact PETSCII filenames through completion, history and COPY.
const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {tool}=require('./setup');
require('./shell')('petscii',async({disk,command,keys,enter,screen})=>{
 await command('detach 8');
 for(const [name,text] of [['g1x','EXACT GRAPHIC'],['g1a','WRONG ORDINARY']]){
  fs.writeFileSync('build/petscii-data',text+'\r');
  execFileSync(tool('vice','c1541'),['-attach',disk,'-write','build/petscii-data',name+',s'],{stdio:'pipe'});
 }
 const image=fs.readFileSync(disk);
 function offset(t,s){let n=0;for(let i=1;i<t;i++)n+=i<=17?21:i<=24?19:i<=30?18:17;return(n+s)*256;}
 let t=18,s=1,renamed=false;
 while(t){const base=offset(t,s);for(let i=0;i<8;i++){
  const p=base+i*32+5;
  if(image.subarray(p,p+3).equals(Buffer.from('G1X'))){image[p+2]=0xc1;renamed=true;}
 }t=image[base];s=image[base+1];}
 assert(renamed);fs.writeFileSync(disk,image);
 await command(`attach "${disk}" 8`);await enter('dir /b');
 async function complete(){
  for(let i=0;i<5;i++){
   await command('> 028d 02');await command('x');
   await new Promise(r=>setTimeout(r,700));
   await command('> 028d 00');await command('x');
   await new Promise(r=>setTimeout(r,150));
   if(/"G1A"/i.test((await screen()).split('\n').at(-1)))return;
  }
  throw Error('Filename completion did not occur: '+await screen());
 }
 await enter('cls');await keys('type g1');await complete();
 let out=await enter('');assert(out.includes('exact graphic')&&!out.includes('wrong ordinary'),out);
 await enter('dir /b');await keys('\\x91\\x91');
 out=await enter('');assert(out.includes('exact graphic'),out);
 await keys('type g1');await complete();await keys('\\x91\\x11');
 out=await enter('');assert(out.includes('exact graphic'),out);
 await enter('cls');await keys('type g1');await complete();await keys('\\x9d\\x14a');
 out=await enter('');assert(out.includes('wrong ordinary'),out);
 await keys('copy g1');await complete();
 await keys('\\x20copied');out=await enter('');assert(out.includes('1 file(s) copied.'),out);
 await enter('cls');out=await enter('type copied');assert(out.includes('exact graphic'),out);
 console.log('PASS exact PETSCII completion, cache/history, draft, edited-name fallback and COPY source preservation');
}).catch(error=>{console.error(error);process.exitCode=1;});
