// Verify the added X? query falls back safely on a real emulated CMD DOS.
require('./setup');
const assert=require('assert/strict'), {start,fixture}=require('./cmd-hd-session');
async function main(){
    const image='build/test-cmd-probe.dhd';
    await fixture(image);
    const s=await start(image,null,true,true);
    try {
        async function check(command, expected) {
            await s.enter('cls','8:>');
            const out=await s.enter(command,'8:>');
            assert(out.includes(expected),out);
        }
        await s.enter('cls','8:>');
        const info=await s.enter('sysinfo','8:>');
        assert(info.includes('Drive 8:  CMD HD'),info);
        assert(!info.includes('SD2IEC'),info);
        await check('echo preserved > probe','8:>');
        await check('type probe','preserved');
        await check('dir','PROBE');
        await check('type probe','preserved');
        console.log('PASS CMD identification and file access after non-resetting SD2IEC version query');
    } finally {await s.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
