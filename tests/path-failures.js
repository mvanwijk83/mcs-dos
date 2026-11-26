// Rejected transfers must emit one error and leave every physical byte intact.
const assert = require('assert/strict');
const fs = require('fs');
module.exports = async function pathFailures(run, command, image, dev, source, targets,
                                           verbs = ['copy', 'move']) {
    for (const target of targets) {
        for (const verb of verbs) {
            await command('detach ' + dev);
            const before = fs.readFileSync(image);
            await command('attach "' + require('./cmd-hd-session').monitorPath(image) + '" ' + dev);
            const out = await run(verb + ' ' + source + ' ' + target);
            assert.equal(out.split('Path not found').length - 1, 1, out);
            assert(!/Directory not found|Partition not found|File not found/i.test(out), out);
            assert(!/Copy not completed|Disk error:|file\(s\) (copied|moved)/i.test(out), out);
            await command('detach ' + dev);
            assert.deepEqual(fs.readFileSync(image), before, verb + ' must preserve the entire image');
            await command('attach "' + require('./cmd-hd-session').monitorPath(image) + '" ' + dev);
        }
    }
};
