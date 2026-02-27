/**
 * scrape_porikkhok.js
 *
 * Usage:
 *   node scrape_porikkhok.js <URL> [output-name]
 *
 * Examples:
 *   node scrape_porikkhok.js "https://www.porikkhok.com/exam/Fk2tL47QYi?teacher=true"
 *   node scrape_porikkhok.js "https://www.porikkhok.com/exam/Fk2tL47QYi?teacher=true" "Blood-Circulation"
 *
 * Output:
 *   public/<output-name>.json     ← question data
 *   public/<output-name>.zip      ← zip with JSON + images (only created if images exist)
 *   public/images/<filename>.png  ← downloaded images
 */

const puppeteer = require('puppeteer');
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// ─── helpers ─────────────────────────────────────────────────────────────────

function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9\-_.\u0980-\u09FF]/g, '_').slice(0, 80);
}

function downloadFile(fileUrl, destPath) {
  return new Promise((resolve, reject) => {
    const proto = fileUrl.startsWith('https') ? https : http;
    const file  = fs.createWriteStream(destPath);
    proto.get(fileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlink(destPath, () => {});
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function createZip(zipPath, filePaths, baseDir) {
  const archiver = require('archiver');
  return new Promise((resolve, reject) => {
    const output  = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    for (const fp of filePaths) {
      archive.file(fp, { name: path.relative(baseDir, fp) });
    }
    archive.finalize();
  });
}

// ─── main ────────────────────────────────────────────────────────────────────

async function scrape(examUrl, outputName) {
  console.log(`\n🚀 Opening: ${examUrl}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    // Go to the page and wait for questions to render
    await page.goto(examUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Scroll to bottom to trigger lazy loading of all questions
    console.log('⏳ Scrolling page to load all questions…');
    await autoScroll(page);
    await page.waitForTimeout(2000);

    // ── Extract exam metadata ──────────────────────────────────────────────
    const examTitle = await page.evaluate(() => {
      // Try various heading selectors
      const h = document.querySelector('h1, h2, [class*="title"], [class*="heading"]');
      return h ? h.innerText.trim() : 'Exam';
    });
    console.log(`📋 Exam title: ${examTitle}`);

    // ── Extract questions from rendered DOM ─────────────────────────────────
    console.log('📝 Extracting questions…');
    const questions = await page.evaluate(() => {
      const results = [];

      // Each question block: look for elements containing Bengali option letters ক খ গ ঘ
      // Strategy: find all buttons that contain option letters, walk up to find parent question block
      
      // Try to find question containers by common patterns
      // The site uses a card/container structure for each question
      let questionBlocks = [];

      // Method 1: look for divs containing question numbers (1., 2., etc.)
      const allDivs = Array.from(document.querySelectorAll('div'));
      
      // Find the container that holds all questions
      // Look for a div that has many children each representing a question
      // Heuristic: find divs that contain the Bengali option buttons (ক, খ, গ, ঘ)
      
      // Get buttons with Bengali letters
      const optionButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
        const text = btn.innerText.trim();
        return text.startsWith('ক') || text.startsWith('খ') || text.startsWith('গ') || text.startsWith('ঘ');
      });

      if (optionButtons.length === 0) {
        // Fallback: just get all buttons and try to group them
        return [];
      }

      // Get parent question containers - walk up from ক button until we find a common ancestor
      // that contains all 4 options for a question
      const processedContainers = new Set();

      // Group buttons by their question container
      // Walk up from each "ক" button to find the question wrapper
      const kaButtons = optionButtons.filter(btn => btn.innerText.trim().startsWith('ক'));

      for (const kaBtn of kaButtons) {
        // Walk up to find the container that has all 4 option buttons
        let container = kaBtn.parentElement;
        let attempts = 0;
        while (container && attempts < 10) {
          const btns = container.querySelectorAll('button');
          const texts = Array.from(btns).map(b => b.innerText.trim());
          const hasKa = texts.some(t => t.startsWith('ক'));
          const hasKha = texts.some(t => t.startsWith('খ'));
          const hasGa = texts.some(t => t.startsWith('গ'));
          const hasDa = texts.some(t => t.startsWith('ঘ'));
          if (hasKa && hasKha && hasGa && hasDa) {
            // Found the question container
            // Make sure it's not already in our list
            if (!processedContainers.has(container)) {
              // Check if a parent also satisfies this (we want the SMALLEST container)
              let parent = container.parentElement;
              if (parent) {
                const parentBtns = parent.querySelectorAll('button');
                const parentTexts = Array.from(parentBtns).map(b => b.innerText.trim());
                const parentHas4 = parentTexts.filter(t => t.startsWith('ক')).length === 1;
                if (!parentHas4) {
                  // parent has more than 1 ক, so current container is the right one
                  processedContainers.add(container);
                  questionBlocks.push(container);
                } else {
                  // parent also has exactly 1 ক, keep going up to find smallest
                  processedContainers.add(container);
                  questionBlocks.push(container);
                }
              } else {
                processedContainers.add(container);
                questionBlocks.push(container);
              }
            }
            break;
          }
          container = container.parentElement;
          attempts++;
        }
      }

      // Process each question block
      for (let i = 0; i < questionBlocks.length; i++) {
        const block = questionBlocks[i];

        // Get all buttons in this block
        const buttons = Array.from(block.querySelectorAll('button'));

        // Map options: find buttons starting with ক, খ, গ, ঘ
        const optionMap = {};
        const correctMap = {};
        const optionLetters = ['ক', 'খ', 'গ', 'ঘ'];
        const keyMap = { 'ক': 'a', 'খ': 'b', 'গ': 'c', 'ঘ': 'd' };

        for (const btn of buttons) {
          const text = btn.innerText.trim();
          for (const letter of optionLetters) {
            if (text.startsWith(letter)) {
              const key = keyMap[letter];
              // Remove the Bengali letter prefix and any separating char
              const optionText = text.replace(new RegExp(`^${letter}[\\s\\u0964\\.\\)]*`), '').trim();
              optionMap[key] = optionText;

              // Detect correct answer: green background, ring, or specific class
              const style = window.getComputedStyle(btn);
              const bgColor = style.backgroundColor;
              const classList = btn.className;
              
              // Green color means correct answer in teacher mode
              // Check for green-ish background OR specific classes
              const isGreen = bgColor.includes('34, 197, 94') ||    // rgb(34,197,94) - tailwind green-500
                              bgColor.includes('22, 163, 74') ||     // rgb(22,163,74) - tailwind green-600
                              bgColor.includes('21, 128, 61') ||     // tailwind green-700
                              bgColor.includes('74, 222, 128') ||    // tailwind green-400
                              bgColor.includes('20, 184, 166') ||    // teal
                              classList.includes('green') ||
                              classList.includes('correct') ||
                              classList.includes('bg-green') ||
                              classList.includes('success');

              if (isGreen) {
                correctMap[key] = true;
              }
              break;
            }
          }
        }

        // Get question text (all text in block except the option buttons)
        // Clone the block and remove option buttons, then get text
        const blockClone = block.cloneNode(true);
        const clonedBtns = blockClone.querySelectorAll('button');
        clonedBtns.forEach(b => b.remove());

        // Get images inside the block
        const images = Array.from(block.querySelectorAll('img'));
        const imageUrls = images.map(img => img.src).filter(src => src && !src.startsWith('data:') && src.length > 10);

        // Get question text - remove leading number if present
        let questionText = blockClone.innerText.replace(/\s+/g, ' ').trim();
        // Remove leading question number like "12." or "12 ."
        questionText = questionText.replace(/^\d+\s*[\.।]\s*/, '').trim();

        const correctAnswer = Object.keys(correctMap)[0] || null;

        results.push({
          questionText,
          options: optionMap,
          correctAnswer,
          imageUrls,
          hasImage: imageUrls.length > 0,
        });
      }

      return results;
    });

    console.log(`✅ Found ${questions.length} questions`);

    if (questions.length === 0) {
      console.error('❌ No questions found! The page structure may have changed.');
      await browser.close();
      return;
    }

    // ── Ensure output dirs exist ───────────────────────────────────────────
    const publicDir = path.join(__dirname, 'public');
    const imagesDir = path.join(publicDir, 'images');
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

    // ── Download images ────────────────────────────────────────────────────
    const downloadedImages = [];
    let imageCounter = 1;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (q.imageUrls.length > 0) {
        q.localImages = [];
        for (const imgUrl of q.imageUrls) {
          try {
            const ext  = path.extname(new URL(imgUrl).pathname) || '.png';
            const fname = `${outputName}_q${i + 1}_${imageCounter}${ext}`;
            const dest  = path.join(imagesDir, fname);
            process.stdout.write(`  ⬇  Downloading image for Q${i + 1}: ${imgUrl} … `);
            await downloadFile(imgUrl, dest);
            console.log('✓');
            q.localImages.push(`/images/${fname}`);
            downloadedImages.push(dest);
            imageCounter++;
          } catch (err) {
            console.log(`⚠ Failed: ${err.message}`);
          }
        }
      }
    }

    // ── Build output JSON ──────────────────────────────────────────────────
    const jsonData = questions.map((q, idx) => {
      const imagePath = q.localImages && q.localImages.length > 0 ? q.localImages[0] : null;
      
      // Embed image reference in question text if it has one
      let questionFinal = q.questionText;
      if (imagePath) {
        questionFinal = `[IMAGE:${imagePath}] ${questionFinal}`;
      }

      return {
        id: idx + 1,
        subject: examTitle,
        question: questionFinal,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: '',
        hasDiagram: q.hasImage,
        svg_code: '',
        topic: '',
      };
    });

    // ── Save JSON ──────────────────────────────────────────────────────────
    const jsonPath = path.join(publicDir, `${outputName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf-8');
    console.log(`\n💾 JSON saved → ${jsonPath}`);
    console.log(`   ${jsonData.length} questions`);
    const withImages = jsonData.filter(q => q.hasDiagram).length;
    if (withImages > 0) console.log(`   ${withImages} questions have images`);

    // ── Create ZIP if images exist ─────────────────────────────────────────
    if (downloadedImages.length > 0) {
      try {
        const archiver = require('archiver');
        const zipPath = path.join(publicDir, `${outputName}.zip`);
        const filesToZip = [jsonPath, ...downloadedImages];
        await createZip(zipPath, filesToZip, publicDir);
        console.log(`🗜  ZIP saved  → ${zipPath}`);
      } catch (err) {
        console.log(`⚠ Could not create zip (archiver not installed?): ${err.message}`);
        console.log('  Run: npm install archiver');
      }
    }

    console.log('\n🎉 Done!\n');

  } finally {
    await browser.close();
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance  = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 150);
    });
  });
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

(async () => {
  const examUrl    = process.argv[2];
  const outputArg  = process.argv[3];

  if (!examUrl) {
    console.log('Usage: node scrape_porikkhok.js <URL> [output-name]');
    console.log('Example: node scrape_porikkhok.js "https://www.porikkhok.com/exam/Fk2tL47QYi?teacher=true" "Blood-Circulation"');
    process.exit(1);
  }

  // Derive output name from URL or argument
  let outputName = outputArg;
  if (!outputName) {
    try {
      const parsed   = new URL(examUrl);
      const examId   = parsed.pathname.split('/').filter(Boolean).pop();
      outputName     = `porikkhok-${examId}`;
    } catch {
      outputName = 'porikkhok-exam';
    }
  }
  outputName = sanitizeFilename(outputName);

  await scrape(examUrl, outputName);
})();
