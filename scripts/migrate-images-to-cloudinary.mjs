/**
 * This script:
 * 1. Reads all .json files in public/
 * 2. Finds all local /images/<filename> references
 * 3. Uploads each image file to Cloudinary
 * 4. Rewrites the JSON files with the Cloudinary URLs
 *
 * Run: node scripts/migrate-images-to-cloudinary.mjs
 * Requires env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 * OR: set in .env.local file
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';

// Load env from .env.local if exists
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) {
      process.env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
    }
  }
}

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error('❌ Missing Cloudinary env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
  process.exit(1);
}

const FOLDER = 'gst-question-images';
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');

/**
 * Upload a file buffer to Cloudinary and return the secure URL
 */
async function uploadToCloudinary(filePath) {
  const fileName = path.basename(filePath);
  // Remove extension and sanitize
  const rawPublicId = fileName.replace(/\.[^/.]+$/, '');
  const publicId = rawPublicId.replace(/[^a-zA-Z0-9_\-]/g, '_');

  const timestamp = Math.floor(Date.now() / 1000);
  // Sign ONLY the params that are included for authentication
  const signStr = `folder=${FOLDER}&public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`;
  const signature = crypto.createHash('sha1').update(signStr).digest('hex');

  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer]);

  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('api_key', API_KEY);
  formData.append('timestamp', String(timestamp));
  formData.append('folder', FOLDER);
  formData.append('public_id', publicId);
  formData.append('signature', signature);
  // Note: transformation is NOT signed, it's applied server-side as eager
  // We skip transformation here to keep signature simple and correct

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  const response = await fetch(url, { method: 'POST', body: formData });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloudinary error for ${fileName}: ${response.status} ${text}`);
  }

  const json = await response.json();
  return json.secure_url || json.url;
}

async function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`❌ images directory not found: ${IMAGES_DIR}`);
    process.exit(1);
  }

  // Collect all image files
  const imageFiles = fs.readdirSync(IMAGES_DIR);
  console.log(`📂 Found ${imageFiles.length} images in public/images/`);

  // Build a map: local path → cloudinary url
  const urlMap = new Map(); // key: /images/filename → cloudinary url

  // Upload each image
  let uploaded = 0;
  let failed = 0;

  for (const imgFile of imageFiles) {
    const localKey = `/images/${imgFile}`;
    const filePath = path.join(IMAGES_DIR, imgFile);

    try {
      process.stdout.write(`⬆️  ${imgFile}... `);
      const cloudUrl = await uploadToCloudinary(filePath);
      urlMap.set(localKey, cloudUrl);
      uploaded++;
      console.log(`✅ ${cloudUrl}`);
    } catch (err) {
      failed++;
      console.error(`❌ FAILED: ${err.message}`);
    }

    // Slight delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n📊 Upload summary: ${uploaded} success, ${failed} failed`);
  if (uploaded === 0) {
    console.error('No images uploaded, aborting JSON rewrite.');
    process.exit(1);
  }

  // Rewrite all JSON files
  const jsonFiles = fs.readdirSync(PUBLIC_DIR).filter(f => f.endsWith('.json'));
  let rewrittenFiles = 0;
  let totalRewrites = 0;

  for (const jsonFile of jsonFiles) {
    const jsonPath = path.join(PUBLIC_DIR, jsonFile);
    const content = fs.readFileSync(jsonPath, 'utf-8');

    let newContent = content;
    let rewrites = 0;

    for (const [localPath, cloudUrl] of urlMap.entries()) {
      // JSON strings have the path in quotes, so replace as string
      const escaped = localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      const before = newContent;
      newContent = newContent.replace(regex, cloudUrl);
      if (before !== newContent) rewrites++;
    }

    if (rewrites > 0) {
      fs.writeFileSync(jsonPath, newContent, 'utf-8');
      rewrittenFiles++;
      totalRewrites += rewrites;
      console.log(`✏️  ${jsonFile}: replaced ${rewrites} image paths`);
    }
  }

  console.log(`\n✅ Done! Rewrote ${totalRewrites} paths in ${rewrittenFiles} JSON files.`);
  console.log('🚀 Now commit the updated JSON files and push to GitHub — Vercel will deploy successfully!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
