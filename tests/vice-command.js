// A connection per request avoids consuming a delayed prompt from the preceding
// resume as if it were the response to a memory read.
const net=require('net');
module.exports=getSocket=>async text=>{
 const initial=getSocket(),port=initial.remotePort || initial.monitorPort;
 initial.monitorPort=port;initial.destroy();
 return new Promise((resolve,reject)=>{
  let out='',idle;
  const conn=net.connect(port,'127.0.0.1',()=>conn.write(text+'\n'));
  const deadline=setTimeout(()=>finish(Error('Monitor timeout: '+text)),5000);
  function finish(error){clearTimeout(deadline);clearTimeout(idle);conn.destroy();error?reject(error):resolve(out);}
  conn.on('error',finish);
  conn.on('data',d=>{out+=d;clearTimeout(idle);idle=setTimeout(()=>finish(),180);});
 });
};
