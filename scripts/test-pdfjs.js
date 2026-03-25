// Test pdfjs-dist text extraction
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
const filePath = process.argv[2];
if (!filePath) { console.error('Usage: node test-pdfjs.js <file>'); process.exit(1); }

async function main() {
  const doc = await pdfjsLib.getDocument(filePath).promise;
  console.log('Pages:', doc.numPages);
  
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const items = tc.items.filter(it => it.str && it.str.trim());
    console.log(`\nPage ${i}: ${items.length} non-empty text items`);
    items.forEach(item => {
      const x = item.transform[4].toFixed(2);
      const y = item.transform[5].toFixed(2);
      console.log(`  [${x}, ${y}] "${item.str}"`);
    });
  }
}

main().catch(e => console.error(e));
