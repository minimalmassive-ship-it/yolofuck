import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const sharp = require('I:/VideoHub/node_modules/sharp');

const PUBLIC_DIR = 'I:/yolofuck journal/public';
const GLYPH_PATH = path.join(PUBLIC_DIR, 'memcut-glyph.png');

function createIco(pngBuffers, sizes) {
  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;
  const header = Buffer.alloc(headerSize);

  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(count, 4); // number of images

  let currentOffset = headerSize;
  for (let i = 0; i < count; i++) {
    const size = sizes[i];
    const buf = pngBuffers[i];
    const entryOffset = 6 + i * 16;

    header.writeUInt8(size >= 256 ? 0 : size, entryOffset); // width
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1); // height
    header.writeUInt8(0, entryOffset + 2); // color count
    header.writeUInt8(0, entryOffset + 3); // reserved
    header.writeUInt16LE(1, entryOffset + 4); // color planes
    header.writeUInt16LE(32, entryOffset + 6); // bits per pixel
    header.writeUInt32LE(buf.length, entryOffset + 8); // image size in bytes
    header.writeUInt32LE(currentOffset, entryOffset + 12); // image offset

    currentOffset += buf.length;
  }

  return Buffer.concat([header, ...pngBuffers]);
}

async function renderFramedIcon(glyphBuffer, canvasSize, scaleRatio = 0.72) {
  const targetH = Math.round(canvasSize * scaleRatio);
  const targetW = Math.round(targetH * (880 / 966));
  const top = Math.round((canvasSize - targetH) / 2);
  const left = Math.round((canvasSize - targetW) / 2);

  const resizedGlyph = await sharp(glyphBuffer)
    .resize(targetW, targetH)
    .toBuffer();

  return await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1.0 },
    },
  })
    .composite([{ input: resizedGlyph, top, left }])
    .png()
    .toBuffer();
}

async function generateAll() {
  console.log('[Memcut Icon Generator] Reading glyph from:', GLYPH_PATH);
  if (!fs.existsSync(GLYPH_PATH)) {
    throw new Error(`Glyph file not found at ${GLYPH_PATH}`);
  }

  const glyphBuffer = fs.readFileSync(GLYPH_PATH);

  // 1. Master Square (1024x1024)
  console.log('Generating master 1024x1024 square...');
  const square1024 = await renderFramedIcon(glyphBuffer, 1024, 0.72);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'memcut-square.png'), square1024);

  const square1024Jpg = await sharp(square1024).jpeg({ quality: 95 }).toBuffer();
  fs.writeFileSync(path.join(PUBLIC_DIR, 'memcut-square.jpg'), square1024Jpg);

  // 2. Standard PWA Icons (purpose: "any")
  console.log('Generating 512x512 standard PWA icon...');
  const icon512 = await renderFramedIcon(glyphBuffer, 512, 0.72);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-512.png'), icon512);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-512-v2.png'), icon512);

  console.log('Generating 192x192 standard PWA icon...');
  const icon192 = await renderFramedIcon(glyphBuffer, 192, 0.72);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-192.png'), icon192);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-192-v2.png'), icon192);

  // 3. Android Adaptive / Maskable PWA Icons (purpose: "maskable" with safe zone 58%)
  console.log('Generating 512x512 maskable PWA icon (safe-zone padding)...');
  const icon512Maskable = await renderFramedIcon(glyphBuffer, 512, 0.58);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-512-maskable.png'), icon512Maskable);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-512-maskable-v2.png'), icon512Maskable);

  console.log('Generating 192x192 maskable PWA icon (safe-zone padding)...');
  const icon192Maskable = await renderFramedIcon(glyphBuffer, 192, 0.58);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-192-maskable.png'), icon192Maskable);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-192-maskable-v2.png'), icon192Maskable);

  // 4. iOS Apple Touch Icons (180x180)
  console.log('Generating 180x180 Apple Touch Icon...');
  const apple180 = await renderFramedIcon(glyphBuffer, 180, 0.72);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), apple180);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon-v2.png'), apple180);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon-180x180.png'), apple180);

  // 5. Small Icons & Favicons
  console.log('Generating 64x64, 48x48, 32x32, 16x16 favicons...');
  const icon64 = await renderFramedIcon(glyphBuffer, 64, 0.72);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-64.png'), icon64);

  const icon48 = await renderFramedIcon(glyphBuffer, 48, 0.72);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon-48x48.png'), icon48);

  const icon32 = await renderFramedIcon(glyphBuffer, 32, 0.72);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon-32x32.png'), icon32);

  const icon16 = await renderFramedIcon(glyphBuffer, 16, 0.72);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon-16x16.png'), icon16);

  // 6. Multi-resolution favicon.ico
  console.log('Generating multi-resolution favicon.ico...');
  const icoBuf = createIco([icon16, icon32, icon48], [16, 32, 48]);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), icoBuf);

  // 7. SVG Favicon with high-res base64 PNG
  console.log('Generating vector SVG favicon...');
  const base64Png = icon192.toString('base64');
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <rect width="128" height="128" fill="#000000" rx="28"/>
  <image href="data:image/png;base64,${base64Png}" x="0" y="0" width="128" height="128"/>
</svg>
`;
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), svgContent);

  console.log('[Memcut Icon Generator] All PWA & web icons generated successfully!');
}

generateAll().catch((err) => {
  console.error('[Memcut Icon Generator] Error:', err);
  process.exit(1);
});
