// COUNTRY.SYS v1: MCN\x01, record-size, reserved, LE count; fixed 13-byte records.
// Seven-byte NUL-padded ASCII selector, then six LocaleFormat bytes in declaration order.
const fs = require('fs');
const assert = require('assert/strict');
const data = JSON.parse(fs.readFileSync(process.argv[2] || 'assets/country-cldr49.json', 'utf8'));
const records = [data.fallback, ...data.countries.map(row => row.record)];
const header = Buffer.from([77, 67, 78, 1, 13, 0, records.length & 255, records.length >> 8]);
assert(records.length <= 512);
const encoded = records.map(record => {
    const out = Buffer.alloc(13);
    const code = record.eciCountryCode.toUpperCase();
    assert(/^(?:[A-Z]{2}|[A-Z]{2}-(?:[A-Z]{2}|[0-9]{3})|INT)$/.test(code));
    out.write(code, 0, 'ascii');
    const byte = s => { assert(s.length <= 1 && (!s || /^[\x20-\x7e]$/.test(s))); return s ? s.charCodeAt(0) : 0; };
    assert([0, 1, 2].includes(record.eciDateFormat));
    assert([0, 1].includes(record.eciTimeFormat));
    out[7] = record.eciDateFormat;
    out[8] = byte(record.eciThousands); out[9] = byte(record.eciDecimal);
    out[10] = byte(record.eciDateSep); out[11] = byte(record.eciTimeSep);
    out[12] = record.eciTimeFormat;
    return out;
});
fs.mkdirSync('build', {recursive: true});
fs.writeFileSync('build/COUNTRY.SYS', Buffer.concat([header, ...encoded]));
console.log(`COUNTRY.SYS: ${records.length} records, ${8 + records.length * 13} bytes`);
