const fs = require('fs');
const {setup} = require('./toolchain');

const ultimate = 'http://192.168.178.170';

async function runOnUltimate(cartridge) {
    const headers = {};
    if (process.env.C64_ULTIMATE_PASSWORD)
        headers['X-Password'] = process.env.C64_ULTIMATE_PASSWORD;

    let probe;
    try {
        probe = await fetch(ultimate + '/v1/version', {
            headers, redirect: 'error', signal: AbortSignal.timeout(2000)
        });
    } catch {
        console.log(`C64 Ultimate at ${ultimate} is unreachable. Cartridge saved locally.`);
        return;
    }

    try {
        if (!probe.ok) throw Error(`version check returned HTTP ${probe.status}`);
        const version = await probe.json();
        if (!version.version || version.errors?.length) throw Error('invalid REST API version');

        const body = new FormData();
        body.append('crt', new Blob([fs.readFileSync(cartridge)]), 'MCS-DOS.crt');
        const response = await fetch(ultimate + '/v1/runners:run_crt', {
            method: 'POST', body, headers, redirect: 'error', signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw Error(`cartridge launch returned HTTP ${response.status}`);
        const result = await response.json();
        if (result.errors?.length) throw Error(result.errors.join(', '));
        console.log(`Started MCS-DOS.crt on the C64 Ultimate at ${ultimate}.`);
    } catch (error) {
        console.warn(`C64 Ultimate deployment failed: ${error.message}. Cartridge saved locally.`);
    }
}

async function main() {
    setup();
    // The compiler and packer share intermediate files across builds.
    const lock = 'build/easyflash.lock';
    try {
        fs.closeSync(fs.openSync(lock, 'wx'));
    } catch (error) {
        if (error.code === 'EEXIST') throw Error(`A cartridge build holds ${lock}`);
        throw error;
    }
    try {
        require('./build-easyflash');
        await runOnUltimate('build/easyflash/MCS-DOS.crt');
    } finally {
        fs.unlinkSync(lock);
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
