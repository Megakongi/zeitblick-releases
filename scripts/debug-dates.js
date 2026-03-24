const fs = require('fs');
const path = require('path');
const dataPath = path.join(require('os').homedir(), 'Library/Application Support/ZeitBlick/zeitblick-data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
const ts = data.timesheets || [];

const byPerson = {};
for (const s of ts) {
  const name = s.name || 'Unbekannt';
  if (!byPerson[name]) byPerson[name] = [];
  for (const d of s.days) {
    if (d.datum) byPerson[name].push(d.datum);
  }
}

for (const [name, dates] of Object.entries(byPerson)) {
  dates.sort((a, b) => {
    const [ad, am, ay] = a.split('.').map(Number);
    const [bd, bm, by2] = b.split('.').map(Number);
    return new Date(2000 + ay, am - 1, ad) - new Date(2000 + by2, bm - 1, bd);
  });
  const first = dates[0];
  const last = dates[dates.length - 1];
  const [fd, fm, fy] = first.split('.').map(Number);
  const [ld, lm, ly] = last.split('.').map(Number);
  const span = Math.round((new Date(2000 + ly, lm - 1, ld) - new Date(2000 + fy, fm - 1, fd)) / 86400000) + 1;
  
  // Count work days vs free days
  const workDates = new Set();
  const freeDates = new Set();
  for (const s of ts) {
    if ((s.name || 'Unbekannt') !== name) continue;
    for (const d of s.days) {
      if (!d.datum) continue;
      const hrs = Number(d.stundenTotal) || 0;
      const hasStart = d.start && String(d.start).includes(':');
      const anm = (d.anmerkungen || '').toLowerCase().trim();
      if (hrs > 0 || hasStart || anm.includes('krank') || anm.includes('urlaub') || anm === 'u') {
        workDates.add(d.datum);
      } else {
        freeDates.add(d.datum);
      }
    }
  }
  const workOnly = [...workDates].sort();
  console.log(`${name}: ${first} - ${last} = ${span} Kalendertage, ${workDates.size} Arbeitstage, ${freeDates.size} freie Tage`);
  console.log(`  Erster Arbeitstag: ${workOnly[0] || '-'}, Letzter Arbeitstag: ${workOnly[workOnly.length-1] || '-'}`);
}
