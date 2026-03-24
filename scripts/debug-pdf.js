const PDFParser = require('pdf2json');
const { parsePDF } = require('../src/main/pdfParser');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/debug-pdf.js <path-to-pdf>');
  process.exit(1);
}

const absPath = path.resolve(filePath);
console.log('=== Parsing:', absPath, '===\n');

// Step 1: Raw PDF text extraction
const pdfParser = new PDFParser(null, 1);
pdfParser.on('pdfParser_dataReady', pdfData => {
  const page = pdfData.Pages[0];
  if (!page) { console.error('No pages'); return; }

  const items = page.Texts.map(t => ({
    x: t.x,
    y: t.y,
    text: decodeURIComponent(t.R.map(r => r.T).join(''))
  })).sort((a, b) => a.y - b.y || a.x - b.x);

  console.log('=== PDF Metadata ===');
  console.log(JSON.stringify(pdfData.Meta, null, 2));
  
  console.log('\n=== All text items (sorted by y, x) ===');
  const formItems = items.filter(it => it.y < 0 || it.x < 0);
  const posItems = items.filter(it => it.y >= 0 && it.x >= 0);
  
  console.log(`\nForm field items (y<0 or x<0): ${formItems.length}`);
  for (const it of formItems) {
    console.log(`  [${it.x.toFixed(2)}, ${it.y.toFixed(2)}] "${it.text}"`);
  }
  
  console.log(`\nPositioned items: ${posItems.length}`);
  for (const it of posItems) {
    console.log(`  [${it.x.toFixed(2)}, ${it.y.toFixed(2)}] "${it.text}"`);
  }

  // Step 2: Parse with the actual parser
  console.log('\n\n=== Parser Result ===');
  parsePDF(absPath)
    .then(result => {
      console.log('Header:', JSON.stringify({
        projekt: result.projekt,
        projektnummer: result.projektnummer,
        produktionsfirma: result.produktionsfirma,
        name: result.name,
        position: result.position,
        abteilung: result.abteilung,
        pause: result.pause,
      }, null, 2));
      console.log('\nDays:');
      for (const d of result.days) {
        console.log(`  ${d.tag} ${d.datum}: ${d.start}-${d.ende} (P:${d.pause}) = ${d.stundenTotal}h | OT25:${d.ueberstunden25} OT50:${d.ueberstunden50} OT100:${d.ueberstunden100} N:${d.nacht25} FZ:${d.fahrzeit} | ${d.anmerkungen}`);
      }
      console.log('\nTotals:', JSON.stringify(result.totals));
    })
    .catch(err => console.error('Parse Error:', err));
});

pdfParser.on('pdfParser_dataError', err => console.error('PDF Error:', err));
pdfParser.loadPDF(absPath);
