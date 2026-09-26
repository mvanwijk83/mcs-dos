const fs=require('fs');
function crc(bytes,initial=65535){let c=initial;for(const v of bytes){c^=v<<8;for(let i=0;i<8;i++)c=((c<<1)^((c&32768)?0x1021:0))&65535;}return c;}
module.exports=function(names){
 if(names.length>40)throw Error('Too many bundled files');
 const image=Buffer.alloc(65536,255);let used=32,fileBytes=0;
 names.forEach((name,slot)=>{
  if(!name.length||name.length>16)throw Error('Invalid bundled filename: '+name);
  const data=fs.readFileSync('build/'+name),h=Buffer.alloc(32);h.write(name,0,'ascii');h[17]=16;
  h.writeUInt16LE(used+32,18);h.writeUInt16LE(data.length,20);h[23]=slot;
  h.writeUInt16LE(data.length+32,24);h[28]=74;h[29]=1;h[30]=255;h[31]=165;
  h.writeUInt16LE(crc(Buffer.concat([data,h.subarray(0,26),h.subarray(28,31)])),26);
  h.copy(image,used);data.copy(image,used+32);used+=32+data.length;fileBytes+=data.length;
 });
 if(fileBytes>64000||used>65504)throw Error('Bundled files exceed journal capacity');
 image.write('MFJ',0);image[3]=3;image.writeUInt16LE(0,4);image.writeUInt16LE(used,6);
 image.writeUInt16LE(crc(image.subarray(0,8)),8);image[15]=165;
 return {image,used,fileBytes,available:64000-fileBytes};
};
