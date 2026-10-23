// Helpers and callback scenarios are intentionally absent from this manifest.
const entry = (id, file = id, args = []) => ({id, file, args});
const cartridge = (id, ...args) => entry(id, 'easyflash', args);
const groups = {
    unit: [
        'helpers', 'amount-switches', 'chkdsk-stats', 'disk-validation', 'root-metadata', 'channel-buffer', 'host-protocol', 'host-directories', 'softiec-target', 'softiec-rename', 'rename-dispatch', 'cache-capacity', 'concat-limits', 'delete-wildcards',
        'dir-sort', 'dir-filter', 'dir-layout', 'directory-walk', 'optional-diskid', 'diskinit', 'path-resolution', 'path-display', 'location-selection', 'raw-readers', 'transfer-failures', 'cmd-storage', 'cmd-part-directory', 'format-label', 'editor-lines', 'find', 'find-redirection', 'help-wrap', 'print',
        'prompt', 'pause', 'run-command', 'key-bindings', 'key-input', 'startup-settings', 'type-wrap', 'type-options', 'journal-crc'
    ].map(id => entry(id)),
    image: [entry('banked-image')],
    shell: [
        cartridge('commands', '--commands'), cartridge('find-files', '--find-redirection'),
        cartridge('delete-files', '--delete'), cartridge('initialize-disk', '--diskinit'),
        entry('input-history'), entry('key-session'), entry('key-scanner'), entry('implicit-batch'), entry('filename-completion'), entry('petscii-completion'), entry('sample-startup'),
        entry('editor-session'), entry('copy-wildcards'), entry('find-vice'), entry('help-session'),
        cartridge('cartridge-workflow', '--banked')
    ],
    storage: [
        cartridge('journal', '--journal'), cartridge('compaction', '--compact'),
        cartridge('large-program', '--large-launch'), cartridge('redirection', '--redirection')
    ],
    session: [cartridge('basic-session', '--session'), cartridge('program-return', '--run-return')],
    hardware: [
        entry('c64-support'), entry('kernal-models'), entry('ultimate-models'), entry('sd2iec-models'),
        entry('drive-models'), cartridge('drive-info', '--drive-info'),
        cartridge('sysinfo-pal', '--sysinfo'), cartridge('sysinfo-ntsc', '--sysinfo', '--ntsc'),
        cartridge('sysinfo-c128', '--sysinfo', '--c128'),
        cartridge('sysinfo-sx64', '--sysinfo', '--sx64'),
        cartridge('ultimate-report', '--ultimate-report'),
        cartridge('mega65-report', '--mega65-report'),
        cartridge('c65-report', '--c65-report'),
        cartridge('startup-display', '--sysinfo', '--boot-info'),
        cartridge('fonts-pal', '--display', '--display-fonts'),
        cartridge('fonts-ntsc', '--display', '--ntsc')
    ],
    drives: [
        [1541], [1571], [1581], [1581, '--large'], [1571, '--rel'], [1581, '--rel'],
        [1571, '--format'], [1581, '--format'], [1581, '--mismatch'], [1541, '--badformat'],
        [1571, '--single']
    ].map(([model, mode]) => entry('drive-' + model + (mode || '').replace('--', '-'),
              'drive-compat', [String(model), ...(mode ? [mode] : [])])),
    tape:
        [cartridge('tape-transfer', '--tape'), cartridge('tape-search', '--tape', '--tape-search')]
};
groups.all = Object.values(groups).flat();
// Private CMD ROM/utilities are optional and are never redistributed.
groups.directories = [entry('directories'), entry('dos-directories'), entry('partition-channels'), entry('format-disk'), entry('disk-tree'), entry('dos-fileops'), entry('dir-layout-session'), entry('host-session')];
groups.cmd = [entry('cmd-hd'), entry('cmd-rel'), entry('cmd-sysinfo'), entry('cmd-overview'), entry('cmd-navigation'), entry('cmd-probe')];
groups.smoke = ['banked-image', 'commands', 'basic-session', 'sysinfo-pal'].map(
    id => groups.all.find(test => test.id === id));
module.exports = groups;
