// Personal startup preferences: included only by development builds.
const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync('dev/AUTOEXEC.BAT.txt','utf8');
const bytes=Buffer.from([...source.replace(/\r?\n/g,'\r')].map(c=>{
 const n=c.charCodeAt(0);
 assert(n===13 || n>=32&&n<=126,'Development AUTOEXEC must be printable ASCII or newlines');
 return n>=97&&n<=122?n-32:n>=65&&n<=90?n+128:n;
}));
fs.writeFileSync('build/AUTOEXEC.BAT',bytes);
