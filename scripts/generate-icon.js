/**
 * Generate ZeitBlick app icon — a modern clock design
 * Creates 1024x1024 PNG, then converts to .icns (Mac) and .ico (Win)
 */
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZE = 1024;
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');
const cx = SIZE / 2;
const cy = SIZE / 2;

// === Background: Rounded square with gradient ===
const cornerRadius = SIZE * 0.22;

// Gradient: Deep blue to vibrant teal
const bgGrad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
bgGrad.addColorStop(0, '#1a1a2e');
bgGrad.addColorStop(0.5, '#16213e');
bgGrad.addColorStop(1, '#0f3460');

ctx.beginPath();
ctx.moveTo(cornerRadius, 0);
ctx.lineTo(SIZE - cornerRadius, 0);
ctx.quadraticCurveTo(SIZE, 0, SIZE, cornerRadius);
ctx.lineTo(SIZE, SIZE - cornerRadius);
ctx.quadraticCurveTo(SIZE, SIZE, SIZE - cornerRadius, SIZE);
ctx.lineTo(cornerRadius, SIZE);
ctx.quadraticCurveTo(0, SIZE, 0, SIZE - cornerRadius);
ctx.lineTo(0, cornerRadius);
ctx.quadraticCurveTo(0, 0, cornerRadius, 0);
ctx.closePath();
ctx.fillStyle = bgGrad;
ctx.fill();

// Subtle inner glow
const glowGrad = ctx.createRadialGradient(cx, cy * 0.8, SIZE * 0.1, cx, cy, SIZE * 0.6);
glowGrad.addColorStop(0, 'rgba(100, 200, 255, 0.08)');
glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = glowGrad;
ctx.fill();

// === Clock face: Circle with soft shadow ===
const clockRadius = SIZE * 0.36;

// Shadow
ctx.save();
ctx.shadowColor = 'rgba(0,0,0,0.35)';
ctx.shadowBlur = 30;
ctx.shadowOffsetY = 8;

// Clock face background
const faceGrad = ctx.createRadialGradient(cx, cy - 10, clockRadius * 0.1, cx, cy, clockRadius);
faceGrad.addColorStop(0, '#ffffff');
faceGrad.addColorStop(1, '#f0f0f5');
ctx.beginPath();
ctx.arc(cx, cy, clockRadius, 0, Math.PI * 2);
ctx.fillStyle = faceGrad;
ctx.fill();
ctx.restore();

// Clock border ring
ctx.beginPath();
ctx.arc(cx, cy, clockRadius, 0, Math.PI * 2);
ctx.strokeStyle = '#e0e0e8';
ctx.lineWidth = 4;
ctx.stroke();

// Outer accent ring
ctx.beginPath();
ctx.arc(cx, cy, clockRadius + 8, 0, Math.PI * 2);
const ringGrad = ctx.createLinearGradient(cx - clockRadius, cy, cx + clockRadius, cy);
ringGrad.addColorStop(0, '#4a7dff');
ringGrad.addColorStop(1, '#06b6d4');
ctx.strokeStyle = ringGrad;
ctx.lineWidth = 6;
ctx.stroke();

// === Hour markers ===
for (let i = 0; i < 12; i++) {
  const angle = (i * 30 - 90) * Math.PI / 180;
  const isMain = i % 3 === 0;
  const outerR = clockRadius - 16;
  const innerR = isMain ? clockRadius - 48 : clockRadius - 36;
  
  const x1 = cx + Math.cos(angle) * innerR;
  const y1 = cy + Math.sin(angle) * innerR;
  const x2 = cx + Math.cos(angle) * outerR;
  const y2 = cy + Math.sin(angle) * outerR;
  
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = isMain ? '#1a1a2e' : '#888899';
  ctx.lineWidth = isMain ? 10 : 5;
  ctx.lineCap = 'round';
  ctx.stroke();
}

// === Clock hands ===
// Hour hand — pointing to ~10 (roughly 10:10 position, classic clock display)
const hourAngle = (300 - 90) * Math.PI / 180; // 10 o'clock
const hourLen = clockRadius * 0.52;
ctx.beginPath();
ctx.moveTo(cx, cy);
ctx.lineTo(cx + Math.cos(hourAngle) * hourLen, cy + Math.sin(hourAngle) * hourLen);
ctx.strokeStyle = '#1a1a2e';
ctx.lineWidth = 16;
ctx.lineCap = 'round';
ctx.stroke();

// Minute hand — pointing to ~2 (10:10 display)
const minAngle = (60 - 90) * Math.PI / 180; // 2 o'clock position (10 min)
const minLen = clockRadius * 0.72;
ctx.beginPath();
ctx.moveTo(cx, cy);
ctx.lineTo(cx + Math.cos(minAngle) * minLen, cy + Math.sin(minAngle) * minLen);
ctx.strokeStyle = '#1a1a2e';
ctx.lineWidth = 10;
ctx.lineCap = 'round';
ctx.stroke();

// Second hand accent — subtle, a tiny one
const secAngle = (180 - 90) * Math.PI / 180; // 6 o'clock
const secLen = clockRadius * 0.65;
ctx.beginPath();
ctx.moveTo(cx - Math.cos(secAngle) * 20, cy - Math.sin(secAngle) * 20);
ctx.lineTo(cx + Math.cos(secAngle) * secLen, cy + Math.sin(secAngle) * secLen);
const secGrad = ctx.createLinearGradient(cx, cy, cx + Math.cos(secAngle) * secLen, cy + Math.sin(secAngle) * secLen);
secGrad.addColorStop(0, '#4a7dff');
secGrad.addColorStop(1, '#06b6d4');
ctx.strokeStyle = secGrad;
ctx.lineWidth = 4;
ctx.lineCap = 'round';
ctx.stroke();

// Center dot
ctx.beginPath();
ctx.arc(cx, cy, 12, 0, Math.PI * 2);
const dotGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 12);
dotGrad.addColorStop(0, '#4a7dff');
dotGrad.addColorStop(1, '#06b6d4');
ctx.fillStyle = dotGrad;
ctx.fill();

// Inner center dot
ctx.beginPath();
ctx.arc(cx, cy, 5, 0, Math.PI * 2);
ctx.fillStyle = '#ffffff';
ctx.fill();

// === "ZB" text below clock ===
ctx.font = 'bold 88px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

// Text gradient
const textGrad = ctx.createLinearGradient(cx - 60, cy + clockRadius + 70, cx + 60, cy + clockRadius + 70);
textGrad.addColorStop(0, '#4a7dff');
textGrad.addColorStop(1, '#06b6d4');
ctx.fillStyle = textGrad;
ctx.fillText('ZB', cx, cy + clockRadius + 75);

// === Save PNG ===
const buildDir = path.join(__dirname, 'build');
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir);

const pngPath = path.join(buildDir, 'icon.png');
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync(pngPath, buffer);
console.log(`✅ icon.png saved (${SIZE}x${SIZE})`);
