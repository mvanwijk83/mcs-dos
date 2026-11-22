// Build a reviewable first reduction; this does not define the COUNTRY.SYS binary format.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '..');
const source = path.resolve(process.argv[2] || path.join(root, 'assets/cldr-49.0.0-json-full'));
// Explicit regional locales preserve regional overrides. Bare language locales below
// are CLDR's default region for that language, not an arbitrary fallback search.
const selected = [
    ['AR', 'Argentina', 'es-AR'], ['AT', 'Austria', 'de-AT'],
    ['AU', 'Australia', 'en-AU'], ['BE', 'Belgium', 'nl-BE'],
    ['BG', 'Bulgaria', 'bg'], ['BR', 'Brazil', 'pt-BR'],
    ['CA', 'Canada', 'en-CA'], ['CH', 'Switzerland', 'de-CH'],
    ['CN', 'China', 'zh-Hans'],
    ['CZ', 'Czechia', 'cs'], ['DE', 'Germany', 'de'],
    ['DK', 'Denmark', 'da'], ['EE', 'Estonia', 'et'],
    ['ES', 'Spain', 'es'], ['FI', 'Finland', 'fi'],
    ['FR', 'France', 'fr'], ['GB', 'United Kingdom', 'en-GB'],
    ['GR', 'Greece', 'el'], ['HR', 'Croatia', 'hr'],
    ['HU', 'Hungary', 'hu'], ['IE', 'Ireland', 'en-IE'],
    ['IS', 'Iceland', 'is'], ['IT', 'Italy', 'it'],
    ['IN', 'India', 'hi'],
    ['JP', 'Japan', 'ja'], ['LT', 'Lithuania', 'lt'],
    ['LU', 'Luxembourg', 'fr-LU'], ['LV', 'Latvia', 'lv'],
    ['NL', 'Netherlands', 'nl'], ['NO', 'Norway', 'nb'],
    ['NZ', 'New Zealand', 'en-NZ'], ['PL', 'Poland', 'pl'],
    ['PT', 'Portugal', 'pt-PT'], ['RO', 'Romania', 'ro'],
    ['RU', 'Russia', 'ru'],
    ['RS', 'Serbia', 'sr-Latn'], ['SE', 'Sweden', 'sv'],
    ['SI', 'Slovenia', 'sl'], ['SK', 'Slovakia', 'sk'],
    ['TR', 'Turkey', 'tr'], ['UA', 'Ukraine', 'uk'],
    ['US', 'United States', 'en'], ['ZA', 'South Africa', 'en-ZA'],
];
// Standard language-region tags distinguish communities without changing the
// established country-only defaults. Macroregional selectors use UN M49 regions.
const variants = [
    ['de-BE', 'Belgium (German)', 'de-BE'],
    ['fr-BE', 'Belgium (French)', 'fr-BE'],
    ['nl-BE', 'Belgium (Dutch)', 'nl-BE'],
    ['en-CA', 'Canada (English)', 'en-CA'],
    ['fr-CA', 'Canada (French)', 'fr-CA'],
];
const macroregions = [
    ['es-419', 'Latin America and the Caribbean (Spanish)', 'es-419'],
    ['ar-001', 'Arabic (general/world)', 'ar'],
];
// CLDR also elides the region in the default Portuguese (Brazil) locale.
const defaultAliases = {'pt-BR': 'pt'};
function json(relative) {
    return JSON.parse(fs.readFileSync(path.join(source, relative), 'utf8'));
}
const supplemental = name => json(`cldr-core/supplemental/${name}.json`).supplemental;
const version = supplemental('timeData').version._cldrVersion;
assert.equal(version, '49', 'This reduction must be reviewed against CLDR 49');
const timeData = supplemental('timeData').timeData;
function main(pkg, locale, file) {
    const actual = defaultAliases[locale] || locale;
    const document = json(`${pkg}/main/${actual}/${file}.json`);
    return {locale: actual, data: document.main[actual]};
}
function separator(value) {
    return value.replace(/[\u00a0\u202f]/g, ' ').replace(/[\u2019\u02bc]/g, "'");
}
function dateFields(pattern) {
    // Strip quoted CLDR literals and directional controls before extracting fields.
    const clean = pattern.replace(/'[^']*'/g, '').replace(/[\u200e\u200f\u061c]/g, '');
    const fields = [...clean.matchAll(/([yMd])\1*/g)];
    assert.equal(fields.length, 3, `Unsupported numeric date: ${pattern}`);
    const order = fields.map(field => field[1].toUpperCase()).join('');
    assert(['DMY', 'MDY', 'YMD'].includes(order), `Unsupported date order: ${pattern}`);
    assert(fields.every(field => field[1] !== 'M' || field[0].length <= 2), 'Text month');
    const gaps = fields.slice(0, 2).map((field, index) =>
        clean.slice(field.index + field[0].length, fields[index + 1].index).replace(/\s/g, ''));
    assert(gaps[0] === gaps[1] && /^[./-]$/.test(gaps[0]), `Unsupported date separators: ${pattern}`);
    return {order, sep: gaps[0]};
}
function timeSeparator(pattern, fallbackSeparator) {
    const found = pattern.match(/[hHKk]+([^hHKkms]+)m+/);
    if (found && /^[.:]$/.test(found[1])) return found[1];
    // e.g. French Canadian HH 'h' mm cannot fit the single-separator record.
    assert(/^[.:]$/.test(fallbackSeparator), `Unsupported time separator: ${pattern}`);
    return fallbackSeparator;
}
const dateEnums = {MDY: 0, DMY: 1, YMD: 2};
const fallback = {
    eciCountryCode: 'ISO', eciDateFormat: 2, eciThousands: '', eciDecimal: '.',
    eciDateSep: '-', eciTimeSep: ':', eciTimeFormat: 1,
};
const selection = [
    ...selected.map(row => [...row, 'country']),
    ...variants.map(row => [...row, 'community']),
    ...macroregions.map(row => [...row, 'macroregion']),
];
const countries = selection.map(([code, name, requestedLocale, kind]) => {
    const dates = main('cldr-dates-full', requestedLocale, 'ca-gregorian');
    const numbers = main('cldr-numbers-full', requestedLocale, 'numbers');
    const calendar = dates.data.dates.calendars.gregorian;
    const numeric = numbers.data.numbers;
    const symbols = numeric['symbols-numberSystem-latn'];
    const date = dateFields(calendar.dateFormats.short);
    const region = code.includes('-') ? code.split('-').at(-1) : code;
    const hours = (timeData[code] || timeData[requestedLocale] || timeData[region] || timeData['001'])._preferred;
    assert(['h', 'H'].includes(hours), `Unsupported hour cycle for ${code}`);
    const clockPattern = calendar.dateTimeFormats.availableFormats[hours === 'H' ? 'Hm' : 'hm'];
    const record = {
        eciCountryCode: code, eciDateFormat: dateEnums[date.order],
        eciThousands: separator(symbols.group), eciDecimal: separator(symbols.decimal),
        eciDateSep: date.sep, eciTimeSep: timeSeparator(clockPattern, symbols.timeSeparator),
        eciTimeFormat: hours === 'H' ? 1 : 0,
    };
    for (const key of ['eciThousands', 'eciDecimal', 'eciDateSep', 'eciTimeSep'])
        assert(/^[\x20-\x7e]$/.test(record[key]), `Unsupported ${key} for ${code}`);
    const notes = [];
    const normalizedDate = date.order.split('').map(field => ({D: 'dd', M: 'MM', Y: 'yyyy'})[field]).join(date.sep);
    if (calendar.dateFormats.short !== normalizedDate) notes.push('Date widths/punctuation normalized');
    if (symbols.group !== record.eciThousands) notes.push('Grouping space/apostrophe normalized');
    if (numeric['decimalFormats-numberSystem-latn'].standard !== '#,##0.###') notes.push('Grouping standardized to thousands');
    if (numeric.minimumGroupingDigits !== '1') notes.push('Group from 1,000 regardless of CLDR threshold');
    if (!clockPattern.match(/[hHKk]+[.:]m+/)) notes.push('Literal time separator replaced with numeric-symbol separator');
    if (/[\u200e\u200f\u061c]/.test(calendar.dateFormats.short)) notes.push('Date direction markers removed');
    return {
        country: name, kind, locale: dates.locale, record,
        source: {
            date: calendar.dateFormats.short, time: calendar.timeFormats.short,
            selectedTimePattern: clockPattern, preferredHours: hours,
            thousands: symbols.group, decimal: symbols.decimal,
            numberPattern: numeric['decimalFormats-numberSystem-latn'].standard,
            minimumGroupingDigits: numeric.minimumGroupingDigits,
            numberingSystem: numeric.defaultNumberingSystem,
        },
        notes,
    };
});
assert.equal(new Set(countries.map(row => row.record.eciCountryCode)).size, countries.length);
function example(record) {
    const order = ['MDY', 'DMY', 'YMD'][record.eciDateFormat];
    const date = order.split('').map(field => ({D: '21', M: '11', Y: '2026'})[field]).join(record.eciDateSep);
    const time = (record.eciTimeFormat ? '15' : '03') + record.eciTimeSep + '18' + (record.eciTimeFormat ? '' : 'p');
    return {date, time, number: ['1', '234', '567'].join(record.eciThousands) + record.eciDecimal + '89'};
}
const output = {
    source: 'Unicode CLDR 49 JSON full',
    license: 'country-cldr49-LICENSE.txt',
    scope: 'Country defaults, selected language communities and macroregions; Gregorian, Latin digits, grouping by thousands',
    identifiers: 'ISO alpha-2 country defaults; BCP 47 language-region variants; ISO reserved fallback. Match selectors case-insensitively, retaining language-region order.',
    encoding: 'ASCII subset of PETSCII; no localized names or AM/PM strings',
    enums: {eciDateFormat: dateEnums, eciTimeFormat: {'12-hour': 0, '24-hour': 1}},
    fallback, countries,
};
fs.writeFileSync(path.join(root, 'assets/country-cldr49.json'), JSON.stringify(output, null, 2) + '\n');
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(root, 'assets/country-cldr49-LICENSE.txt'));
const rows = [
    ['ISO', 'Fallback', 'built in', fallback],
    ...countries.map(row => [row.record.eciCountryCode, row.country, row.locale, row.record]),
];
const lines = [
    '# CLDR 49 country and community reduction', '',
    'Generated by `node scripts/reduce-cldr-country.js` from the locally extracted CLDR 49 JSON release. This is review data, not the COUNTRY.SYS file or its final binary format.', '',
    '## Selection', '',
    `${selected.length} country defaults, ${variants.length} community variants and ${macroregions.length} macroregional presets, plus ISO fallback. The original European emphasis is retained, with Russia, China and India added explicitly. Selection follows the intended C64 audience, not population alone; it is an editorial starting point, not measured user demand. Other countries and language variants are deferred, not technically rejected.`, '',
    'Country-only defaults remain available: Belgium uses Dutch, Canada English, Switzerland German, India Hindi and Luxembourg French. Community variants add Dutch/French/German Belgium and English/French Canada. Swiss and Indian variants are intentionally omitted by user preference; CH uses the German Swiss default (French Swiss decimal punctuation differs). Bare CLDR language identifiers refer to default-region data, not an arbitrary fallback search.', '',
    'Selectors use standard BCP 47 language-region order: fr-BE, nl-BE and fr-CA (not CA-FR). Case-insensitive matching may accept FR-CA, but must not reverse subtags. Country-only selectors retain strict ISO alpha-2 spelling (GB, not UK). Macroregion es-419 uses the UN M49 region Latin America and the Caribbean; ar-001 means Arabic with world scope, not a geographically defined Arab-world region. It supplies a general Arabic preset, not every Arab country’s conventions. ISO remains the reserved fallback. COUNTRY therefore now accepts supported locale selectors as well as country codes; the record identifier is no longer necessarily two bytes.', '',
    '## Reduction rules', '',
    '- Use Gregorian short-date order and separator; force two-digit day/month and four-digit year. Remove spacing and trailing punctuation around numeric date fields.',
    '- Use CLDR locale-specific hour-cycle preferences before regional preferences (notably fr-CA is 24-hour while en-CA is 12-hour). Use the corresponding hour/minute pattern for the separator. Where a literal separator cannot fit the record, use the CLDR Latin-number timeSeparator (fr-CA becomes 15:18). Always pad hours/minutes; append a/p for a 12-hour clock. Seconds remain optional input and are not shown here.',
    '- Use Latin digits and CLDR Latin-number symbols. Convert nonbreaking spaces to ordinary spaces and typographic apostrophes to ASCII apostrophes.',
    '- Always group by thousands starting at 1,000, regardless of CLDR grouping sizes or minimum grouping threshold. Decimal separators apply to numbers only, not to clock parsing.',
    '- ISO fallback uses yyyy-mm-dd, a 24-hour clock with colon, no digit grouping, and decimal point. ISO is a reserved MCS-DOS selector, not a country code.',
    '- All resulting separators are single printable ASCII/PETSCII characters. Empty thousands separator means no grouping.', '',
    '## Results', '',
    'Examples use 21 November 2026 at 15:18 and the number 1234567.89. The number column illustrates separators; it does not add fractional output to integer-only commands. `SPACE` below means an ordinary space.', '',
    '| Code | Country | CLDR locale | Date | Time | Thousands | Decimal | Number example |',
    '|---|---|---|---|---|---|---|---|',
];
for (const [code, name, locale, record] of rows) {
    const ex = example(record);
    const group = record.eciThousands === '' ? 'none' : record.eciThousands === ' ' ? 'SPACE' : '`' + record.eciThousands + '`';
    lines.push(`| ${code} | ${name} | ${locale} | ${ex.date} | ${ex.time} | ${group} | \`${record.eciDecimal}\` | ${ex.number} |`);
}
const shapes = new Set(countries.map(row => JSON.stringify(Object.values(row.record).slice(1))));
const payload = countries.reduce((total, row) => total + row.record.eciCountryCode.length + 6, 0);
lines.push('', `${countries.length} locale records reduce to ${shapes.size} distinct formatting combinations. ASCII identifiers plus six one-byte formatting fields total ${payload} bytes, excluding identifier framing, headers and ISO fallback. The previous eight-byte fixed-record estimate no longer applies to language-region selectors. No binary layout is finalized by this reduction. Source patterns, locale choices and transformation notes are retained in assets/country-cldr49.json for review.`, '',
    '## Source patterns and normalization notes', '',
    '| Code | CLDR short date | CLDR short time | Extraction notes |',
    '|---|---|---|---|');
for (const row of countries) lines.push(`| ${row.record.eciCountryCode} | \`${row.source.date}\` | \`${row.source.time}\` | ${row.notes.join('; ') || 'No date/number normalization needed'} |`);
lines.push('', 'Widths, Latin digits, Gregorian calendar, compact a/p suffixes and uniform grouping are deliberate MCS-DOS conventions. This does not claim full CLDR localization. COUNTRY.SYS loading, CONFIG.SYS parsing, clock protocols and shell formatting are outside this first extraction pass.', '',
    'Identifier reference: [BCP 47 / RFC 5646](https://www.rfc-editor.org/rfc/rfc5646.html) permits language-region tags with ISO alpha-2 or UN M49 region subtags. Macroregional definitions and locale preferences come from the local CLDR 49 data.', '',
    'CLDR source: https://github.com/unicode-org/cldr-json. The Unicode license is preserved in [assets/country-cldr49-LICENSE.txt](assets/country-cldr49-LICENSE.txt).', '');
fs.writeFileSync(path.join(root, 'COUNTRY-REDUCTION.md'), lines.join('\n'));
console.log(`Extracted ${selected.length} countries, ${variants.length} community variants, ${macroregions.length} macroregions; ${shapes.size} formatting combinations; ISO fallback included.`);
