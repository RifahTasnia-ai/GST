/**
 * AI-Powered LaTeX Cleanup — Uses OpenClaw (gpt-5.3-codex)
 * 
 * Sends each question's raw text to AI which:
 * 1. Identifies the proper LaTeX version (with \frac, \sin etc.)
 * 2. Removes plain-text duplicate copies
 * 3. Preserves Bengali text
 * 4. Wraps LaTeX in $...$ delimiters
 * 5. Returns clean output
 * 
 * OpenClaw gateway: http://127.0.0.1:18789
 * Uses OpenAI-compatible API at the gateway
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DRY_RUN = process.argv.includes('--dry-run');
const SINGLE_FILE = process.argv.find(a => a.startsWith('--file='))?.split('=')[1];
const BATCH_SIZE = 5; // questions per AI call
const OPENCLAW_HOST = '127.0.0.1';
const OPENCLAW_PORT = 18789;
const OPENCLAW_TOKEN = 'af5706d7693ad611e6f9b31648624713c44a856709b8548c';

// ═══════════════════════════════════════
// OpenClaw HTTP API call (OpenAI-compatible)
// ═══════════════════════════════════════

function callOpenClaw(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'openai-codex/gpt-5.3-codex',
      messages,
      temperature: 0.1,
      max_tokens: 4000,
    });

    const options = {
      hostname: OPENCLAW_HOST,
      port: OPENCLAW_PORT,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': 'Bearer ' + OPENCLAW_TOKEN,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const content = parsed?.choices?.[0]?.message?.content;
          if (content) resolve(content);
          else reject(new Error('No content in response: ' + data.substring(0, 200)));
        } catch (e) {
          reject(new Error('JSON parse error: ' + data.substring(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ═══════════════════════════════════════
// AI PROMPT
// ═══════════════════════════════════════

const SYSTEM_PROMPT = `You are a LaTeX data cleaner for a Bengali educational platform.

You receive questions extracted from a website where each field contains TRIPLE-DUPLICATED content:
1. Plain text copy (with Unicode math like →, ∑, ², 𝑥)
2. Proper LaTeX version (with \\frac, \\sin, \\begin{array} etc.)
3. Another plain text copy

Your job is to:
1. Keep ONLY the proper LaTeX version
2. Remove both plain-text copies
3. Wrap LaTeX math in $ delimiters: $\\frac{1}{2}$
4. For display/block math use $$: $$\\begin{array}...\\end{array}$$
5. Keep Bengali text intact (Bengali script: Unicode range 0980-09FF)
6. Return ONLY the cleaned text, nothing else

RULES:
- If text has NO LaTeX commands (\\frac, \\sin etc.), return it UNCHANGED
- Bengali text before/after math = KEEP
- Latex commands like \\frac{a}{b} = WRAP in $...$
- \\begin{array}..\\end{array} = WRAP in $$...$$
- Unicode math symbols (→, ∑, 𝑥, ², ≥) in plain-text copies = REMOVE
- Simple variables like "x", "y" after removing duplicates = OK to keep

EXAMPLES:
Input: "x→0lim⁡cosx−1x2=? $_{x\\to0}^{\\lim}\\frac{\\cos x-1}{x^2}=?$ x→0limx2cosx−1=?"
Output: "$_{x\\to0}^{\\lim}\\frac{\\cos x-1}{x^2}=?$"

Input: "হলে, (1−x2)dydx+xy= \\left(1-x^{2}\\right) \\frac{d y}{d x}+x y= (1−x2)dxdy+xy="
Output: "হলে, $\\left(1-x^{2}\\right) \\frac{d y}{d x}+x y=$"

Input: "ক্লোরোফর্ম কীভাবে অক্সিডাইজ হয়?"
Output: "ক্লোরোফর্ম কীভাবে অক্সিডাইজ হয়?" (unchanged - no LaTeX)`;

function buildUserMessage(questions) {
  let msg = 'Clean each field. Return JSON with same structure but cleaned values.\n\n';
  msg += 'INPUT:\n```json\n' + JSON.stringify(questions, null, 2) + '\n```\n\n';
  msg += 'Return ONLY valid JSON array, no explanation.';
  return msg;
}

// ═══════════════════════════════════════
// PROCESSING
// ═══════════════════════════════════════

function needsCleaning(text) {
  if (!text) return false;
  // Has LaTeX commands
  const hasLatex = /\\[a-zA-Z]{2,}/.test(text) || /[_^]\{/.test(text);
  // AND has Unicode math (duplicate copies)
  const hasUnicode = /[→←⇒∑∏∫√∞≥≤≠²³⁴⁡𝑥𝑦𝑎𝑏𝑐]/.test(text);
  // OR has what looks like triple repetition (LaTeX without $ wrapping)
  return hasLatex && (hasUnicode || !text.includes('$'));
}

function extractFieldsForCleaning(q) {
  const fields = {};
  for (const f of ['question', 'explanation', 'questionLatex', 'explanationLatex']) {
    if (q[f] && needsCleaning(q[f])) fields[f] = q[f];
  }
  // Options
  if (q.options) {
    for (const k of ['a', 'b', 'c', 'd']) {
      if (q.options[k] && needsCleaning(q.options[k])) {
        fields['option_' + k] = q.options[k];
      }
    }
  }
  return fields;
}

async function cleanBatch(questions) {
  // Build a compact version with just the fields that need cleaning
  const items = questions.map((q, i) => ({
    _idx: i,
    _id: q.id,
    ...extractFieldsForCleaning(q)
  })).filter(item => Object.keys(item).length > 2); // has actual fields

  if (items.length === 0) return questions;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserMessage(items) }
  ];

  try {
    const response = await callOpenClaw(messages);
    
    // Parse the AI response
    let cleaned;
    try {
      // Strip markdown code blocks if present
      const jsonStr = response.replace(/^```json?\s*/m, '').replace(/\s*```$/m, '').trim();
      cleaned = JSON.parse(jsonStr);
    } catch (e) {
      console.error('    [WARN] AI response parse failed, skipping batch');
      return questions; // Return unchanged
    }

    // Apply cleaned fields back to questions
    if (!Array.isArray(cleaned)) return questions;
    
    for (const cleanedItem of cleaned) {
      const q = questions[cleanedItem._idx];
      if (!q) continue;

      for (const [key, value] of Object.entries(cleanedItem)) {
        if (key.startsWith('_')) continue;
        if (key.startsWith('option_')) {
          const optKey = key.replace('option_', '');
          if (q.options) q.options[optKey] = value;
        } else {
          q[key] = value;
        }
      }
    }

    return questions;
  } catch (e) {
    console.error('    [ERROR] AI call failed: ' + e.message);
    return questions; // Return unchanged on error
  }
}

async function processFile(filename) {
  const filepath = path.join(PUBLIC_DIR, filename);
  
  const raw = fs.readFileSync(filepath, 'utf8');
  const questions = JSON.parse(raw);
  if (!Array.isArray(questions)) return { file: filename, total: 0, cleaned: 0 };

  // Find questions that need cleaning
  const needsClean = questions.filter(q => 
    needsCleaning(q.question) || needsCleaning(q.explanation) ||
    needsCleaning(q.questionLatex) || needsCleaning(q.explanationLatex) ||
    (q.options && ['a','b','c','d'].some(k => needsCleaning(q.options[k])))
  );

  if (needsClean.length === 0) {
    console.log('  ─ ' + filename + ' (no changes needed)');
    return { file: filename, total: questions.length, cleaned: 0 };
  }

  console.log('  ⏳ ' + filename + ': cleaning ' + needsClean.length + '/' + questions.length + ' questions...');
  
  if (DRY_RUN) {
    return { file: filename, total: questions.length, cleaned: needsClean.length };
  }

  // Process in batches
  const originalJson = JSON.stringify(questions);
  
  for (let i = 0; i < needsClean.length; i += BATCH_SIZE) {
    const batch = needsClean.slice(i, i + BATCH_SIZE);
    process.stdout.write('    Batch ' + (Math.floor(i/BATCH_SIZE)+1) + '/' + Math.ceil(needsClean.length/BATCH_SIZE) + '... ');
    
    await cleanBatch(batch); // Modifies in place
    
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
    process.stdout.write('✓\n');
  }

  // Save if changed
  const newJson = JSON.stringify(questions);
  if (newJson !== originalJson) {
    fs.writeFileSync(filepath, JSON.stringify(questions, null, 2) + '\n', 'utf8');
    console.log('  ✓ Saved ' + filename);
  }

  return { file: filename, total: questions.length, cleaned: needsClean.length };
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════

async function main() {
  console.log('================================================');
  console.log('  AI LaTeX Cleanup — OpenClaw gpt-5.3-codex');
  console.log('  Mode: ' + (DRY_RUN ? 'DRY RUN' : 'LIVE'));
  console.log('================================================\n');

  // Test OpenClaw connection first
  console.log('Testing OpenClaw connection...');
  try {
    await callOpenClaw([
      { role: 'user', content: 'Reply only: "OK"' }
    ]);
    console.log('✓ OpenClaw connected\n');
  } catch (e) {
    console.error('✗ OpenClaw connection failed: ' + e.message);
    console.error('Make sure: openclaw gateway is running on port 18789');
    process.exit(1);
  }

  let files = fs.readdirSync(PUBLIC_DIR).filter(f => f.endsWith('.json') && f !== 'manifest.json');
  
  if (SINGLE_FILE) {
    files = files.filter(f => f.includes(SINGLE_FILE));
    console.log('Processing single file: ' + files.join(', '));
  }
  
  console.log('Files to process: ' + files.length + '\n');

  const results = [];
  for (const file of files) {
    try {
      const r = await processFile(file);
      results.push(r);
    } catch (e) {
      console.error('  ERROR: ' + file + ': ' + e.message);
      results.push({ file, total: 0, cleaned: 0 });
    }
  }

  // Summary
  const totalCleaned = results.reduce((s, r) => s + r.cleaned, 0);
  const filesChanged = results.filter(r => r.cleaned > 0).length;
  const totalQs = results.reduce((s, r) => s + r.total, 0);

  console.log('\n─── SUMMARY ───');
  console.log('Files: ' + results.length + ' processed, ' + filesChanged + ' changed');
  console.log('Questions: ' + totalQs + ' total, ' + totalCleaned + ' cleaned by AI');
  if (DRY_RUN) console.log('\n(DRY RUN — no files written)');
  else console.log('\nDone! ✓');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
