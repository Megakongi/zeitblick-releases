const PDFParser = require('pdf2json');
const p = new PDFParser(null, true); // raw mode
p.on('pdfParser_dataReady', d => {
  if (d.Pages && d.Pages[0]) {
    const fills = d.Pages[0].Fills || [];
    console.log('Fills:', fills.length);
    const fields = d.Pages[0].Fields || [];
    console.log('Fields:', fields.length);
    fields.forEach((f,i) => console.log('  Field', i, JSON.stringify(f)));
    const texts = d.Pages[0].Texts || [];
    const withValues = texts.filter(t => {
      const decoded = t.R.map(r => decodeURIComponent(r.T)).join('');
      return decoded.trim().length > 0;
    });
    console.log('Non-empty texts:', withValues.length, '/', texts.length);
    // Show ALL texts including empty ones near NAME area
    texts.filter(t => t.y >= 6 && t.y <= 10).forEach((t,i) => {
      const decoded = t.R.map(r => decodeURIComponent(r.T)).join('');
      const rawT = t.R.map(r => r.T).join('');
      console.log('  ALL['+t.x.toFixed(2)+','+t.y.toFixed(2)+']', JSON.stringify(decoded), 'empty:', decoded.trim().length === 0, 'rawLen:', rawT.length);
    });
    console.log('\n--- ALL texts in y range 18-42 (day rows) ---');
    texts.filter(t => t.y >= 18 && t.y <= 42).forEach((t,i) => {
      const decoded = t.R.map(r => decodeURIComponent(r.T)).join('');
      console.log('  ['+t.x.toFixed(2)+','+t.y.toFixed(2)+']', JSON.stringify(decoded));
    });
  }
});
p.loadPDF('/Users/tillpallapies/Desktop/2025_KW47_TillPallapies.pdf');
