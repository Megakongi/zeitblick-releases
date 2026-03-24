const fs = require('fs');
const path = require('path');
const dataPath = path.join(require('os').homedir(), 'Library/Application Support/ZeitBlick/zeitblick-data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
const ts = data.timesheets || [];

// Focus on Stammteam
const focus = ['Fabian Zenker', 'Till Pallapies', 'Michael Mayr'];

for (const name of focus) {
  console.log('\n=== ' + name + ' ===');
  const dayMap = {};
  for (const s of ts) {
    if ((s.name || '') !== name) continue;
    console.log('Stundenzettel: KW' + (s.calendarWeek || '?') + ' (' + s.days.length + ' Tage)');
    for (const d of s.days) {
      if (!d.datum) continue;
      const hrs = Number(d.stundenTotal) || 0;
      const anm = (d.anmerkungen || '').trim();
      const start = d.start || '';
      const ende = d.ende || '';
      const typ = d.typ || '';
      const key = d.datum;
      if (!dayMap[key]) {
        dayMap[key] = { hrs, anm, start, ende, typ };
      }
    }
  }
  const allDates = Object.keys(dayMap).sort((a, b) => {
    const [ad, am, ay] = a.split('.').map(Number);
    const [bd, bm, by2] = b.split('.').map(Number);
    return new Date(2000 + ay, am - 1, ad) - new Date(2000 + by2, bm - 1, bd);
  });
  let workDays = 0, freeDays = 0, krankDays = 0, urlaubDays = 0;
  for (const dt of allDates) {
    const info = dayMap[dt];
    const anmLow = info.anm.toLowerCase();
    let cat = 'frei';
    if (info.hrs > 0 || (info.start && info.start.includes(':'))) cat = 'arbeit';
    if (anmLow.includes('krank')) cat = 'krank';
    if (anmLow.includes('urlaub') || anmLow === 'u') cat = 'urlaub';
    if (anmLow.includes('frei') || anmLow.includes('ruhetag') || anmLow.includes('rt') || info.typ === 'frei') cat = 'frei';
    if (cat === 'arbeit') workDays++;
    else if (cat === 'krank') krankDays++;
    else if (cat === 'urlaub') urlaubDays++;
    else freeDays++;
    console.log('  ' + dt + ': ' + cat + ' (hrs=' + info.hrs + ', anm="' + info.anm + '", typ="' + info.typ + '", start="' + info.start + '")');
  }
  console.log('TOTAL: ' + allDates.length + ' Tage | Arbeit: ' + workDays + ' | Frei: ' + freeDays + ' | Krank: ' + krankDays + ' | Urlaub: ' + urlaubDays);
}
