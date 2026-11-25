// Generates the Umm al-Qura year start dates (Riyadh time) used by supabase/schema.sql.
const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { year: 'numeric', timeZone: 'Asia/Riyadh' });
const hijri = (ms) => Number(fmt.formatToParts(ms).find((p) => p.type === 'year').value);
const day = 86_400_000;
let t = Date.UTC(2025, 0, 1, 12);
let prev = hijri(t);
const rows = [];
while (t < Date.UTC(2080, 0, 1)) {
  t += day;
  const y = hijri(t);
  if (y !== prev) { rows.push(`  (${y}, '${new Date(t).toISOString().slice(0, 10)}')`); prev = y; }
}
console.log(rows.join(',\n'));
