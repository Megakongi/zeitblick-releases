const { parsePDF } = require('../src/main/pdfParser');

parsePDF('/Users/tillpallapies/Desktop/A-Streckmann-Babylon Berlin S5-04.07-04.13.2025.pdf')
  .then(result => {
    console.log('=== Result ===');
    console.log('Header:', JSON.stringify({
      projekt: result.projekt,
      name: result.name,
      position: result.position,
    }));
    console.log('\nDays:');
    for (const d of result.days) {
      console.log(`  ${d.tag} ${d.datum}: ${d.start}-${d.ende} (P:${d.pause}) = ${d.stundenTotal}h | OT25:${d.ueberstunden25} OT50:${d.ueberstunden50} N:${d.nacht25} FZ:${d.fahrzeit} | ${d.anmerkungen}`);
    }
    console.log('\nTotals:', JSON.stringify(result.totals));
  })
  .catch(err => console.error('Error:', err));
