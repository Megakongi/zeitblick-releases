/**
 * Convert PNG to ICO format for Windows
 * ICO = header + directory entries + PNG data for each size
 */
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

async function createIco(inputPng, outputIco) {
  const img = await loadImage(inputPng);
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    pngBuffers.push(canvas.toBuffer('image/png'));
  }

  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);           // Reserved
  header.writeUInt16LE(1, 2);           // Type: 1 = ICO
  header.writeUInt16LE(sizes.length, 4); // Number of images

  // Directory entries: 16 bytes each
  const dirSize = sizes.length * 16;
  const directory = Buffer.alloc(dirSize);
  let dataOffset = 6 + dirSize;

  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    const buf = pngBuffers[i];
    const offset = i * 16;

    directory.writeUInt8(size < 256 ? size : 0, offset);      // Width (0 = 256)
    directory.writeUInt8(size < 256 ? size : 0, offset + 1);  // Height
    directory.writeUInt8(0, offset + 2);    // Color palette
    directory.writeUInt8(0, offset + 3);    // Reserved
    directory.writeUInt16LE(1, offset + 4); // Color planes
    directory.writeUInt16LE(32, offset + 6); // Bits per pixel
    directory.writeUInt32LE(buf.length, offset + 8);  // Image size
    directory.writeUInt32LE(dataOffset, offset + 12); // Data offset
    dataOffset += buf.length;
  }

  const icoBuffer = Buffer.concat([header, directory, ...pngBuffers]);
  fs.writeFileSync(outputIco, icoBuffer);
  console.log(`✅ ${path.basename(outputIco)} created (${sizes.join(', ')}px)`);
}

const buildDir = path.join(__dirname, '..', 'build');
createIco(path.join(buildDir, 'icon.png'), path.join(buildDir, 'icon.ico'));
