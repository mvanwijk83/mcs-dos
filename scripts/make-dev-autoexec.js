// Personal preferences run in development; releases include an inactive sample.
const fs=require('fs'),assert=require('assert/strict');
const petscii=require('./petscii');
const source=fs.readFileSync('dev/AUTOEXEC.BAT.txt','utf8');
assert(/^[\r\n\x20-\x7e]*$/.test(source),'Development AUTOEXEC must be printable ASCII or newlines');
const name=process.argv.includes('--release')?'AUTOEXEC.SAMPLE':'AUTOEXEC.BAT';
fs.writeFileSync('build/'+name,petscii(source));
