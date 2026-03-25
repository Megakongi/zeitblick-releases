const PDFParser = require('pdf2json');
const p = new PDFParser(null, 1);
const filePath = process.argv[2];
if (!filePath) { console.error('Usage: node check-pdf-raw.js <file>'); process.exit(1); }
p.on('pdfParser_dataReady', data => {
  const page = data.Pages[0];
  console.log('Total Texts count:', page.Texts.length);
  console.log('HLines:', (page.HLines||[]).length);
  console.log('VLines:', (page.VLines||[]).length);
  console.log('Fills:', (page.Fills||[]).length);
  console.log('Fields:', (page.Fields||[]).length);
  console.log('Boxsets:', (page.Boxsets||[]).length);
  page.Texts.forEach(t => {
    const txt = decodeURIComponent(t.R.map(r=>r.T).join(''));
    if (txt.trim() && txt.trim() !== ' ') {
      console.log('[' + t.x.toFixed(2) + ',' + t.y.toFixed(2) + '] TS:' + JSON.stringify(t.R[0]?.TS) + ' "' + txt.substring(0,80) + '"');
    }
  });
});
p.on('pdfParser_dataError', e => console.error(e));
p.loadPDF(filePath);
