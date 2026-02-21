// Script to convert og-image.svg to og-image.png using sharp
// Run: node scripts/generate-og-image.js

import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = join(__dirname, '../public/og-image.svg');
const pngPath = join(__dirname, '../public/og-image.png');

const svgBuffer = readFileSync(svgPath);

await sharp(svgBuffer)
    .resize(1200, 630)
    .png({ quality: 95 })
    .toFile(pngPath);

console.log('✅ og-image.png generated successfully at public/og-image.png');
