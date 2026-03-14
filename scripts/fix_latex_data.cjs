/**
 * LaTeX Data Fix Script v4 — Proper $ Delimiter Wrapping
 * 
 * WHAT IT DOES:
 * 1. Scans each text field for LaTeX commands (\frac, \sin, \begin, etc.)
 * 2. Identifies the LaTeX portion vs plain-text duplicate copies
 * 3. Wraps LaTeX expressions in $...$ delimiters
 * 4. Removes plain-text math duplicate copies
 * 5. Preserves Bengali text
 * 
 * APPROACH:
 * - Walk through the text character by character
 * - When we find a backslash followed by a letter = LaTeX zone starts
 * - Track brace depth to find where LaTeX expression ends
 * - Everything before/after LaTeX that's NOT Bengali = plain-text duplicate (remove it)
 * - Wrap the LaTeX zone in $...$
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DRY_RUN = process.argv.includes('--dry-run');
const SINGLE_FILE = process.argv.find(a => a.startsWith('--file='))?.split('=')[1];

// ═══════════════════════════════════════
// CHARACTER CLASSIFICATION
// ═══════════════════════════════════════

function isBengali(code) {
  return code >= 0x0980 && code <= 0x09FF;
}

function isBengaliChar(ch) {
  return isBengali(ch.charCodeAt(0));
}

// Characters that appear in plain-text math duplicates but NOT in proper LaTeX
const UNICODE_MATH = new Set('⁡⇒⇐←→∴∵∞×÷≥≤≠≈√∑∏∫²³⁴⁻⁺½₁₂₃₄₅₆₇₈₉₀𝑥𝑦𝑧𝑎𝑏𝑐𝑑𝑒𝑓𝑔𝑘𝑚𝑛𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑃𝑉𝑇𝑀𝐿𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾');

const LATEX_CMDS = new Set([
  'frac','sqrt','sin','cos','tan','sec','csc','cot','cosec','log','ln','lim',
  'sum','prod','int','alpha','beta','gamma','delta','theta','pi','omega','mu',
  'sigma','lambda','phi','epsilon','Rightarrow','rightarrow','Leftarrow','leftarrow',
  'therefore','because','infty','pm','mp','times','div','cdot','cdots',
  'left','right','begin','end','mathrm','text','quad','qquad','hline',
  'geq','leq','neq','approx','overline','underline','hat','bar','vec',
  'underset','overset','operatorname','not','to','gets','lbrace','rbrace',
  'displaystyle','tfrac','dfrac','binom','pmatrix','bmatrix','vmatrix',
  'Vmatrix','array','aligned','cases','equiv','perp','parallel','angle',
  'triangle','circ','bullet','star','partial','nabla','forall','exists',
  'in','notin','subset','supset','cup','cap','wedge','vee','oplus','otimes',
  'dots','ldots','vdots','ddots','space','thinspace','enspace',
]);

// ═══════════════════════════════════════
// LATEX DETECTION
// ═══════════════════════════════════════

function isLatexCmdAt(text, pos) {
  if (text[pos] !== '\\') return null;
  if (pos + 1 >= text.length) return null;
  
  // Check for \\ (line break in LaTeX)
  if (text[pos + 1] === '\\') return '\\';
  
  // Check for \{ or \}
  if (text[pos + 1] === '{' || text[pos + 1] === '}') return text[pos + 1];
  
  // Check for \letter...
  if (!/[a-zA-Z]/.test(text[pos + 1])) return null;
  
  let end = pos + 1;
  while (end < text.length && /[a-zA-Z]/.test(text[end])) end++;
  const cmd = text.substring(pos + 1, end);
  
  return LATEX_CMDS.has(cmd) ? cmd : cmd; // Return any command
}

function hasLatexCommands(text) {
  if (!text) return false;
  return /\\[a-zA-Z]{2,}/.test(text) || /[_^]\{/.test(text);
}

function hasUnicodeMath(text) {
  for (const ch of text) {
    if (UNICODE_MATH.has(ch)) return true;
  }
  return false;
}

// ═══════════════════════════════════════
// CORE: Find and extract LaTeX expressions
// ═══════════════════════════════════════

/**
 * Find all LaTeX "zones" in the text.
 * Each zone starts at a backslash command or ^{ / _{
 * and extends through all connected LaTeX (matching braces, etc.)
 */
function findLatexZones(text) {
  const zones = []; // [{start, end}]
  let i = 0;
  
  while (i < text.length) {
    // Check for LaTeX command start
    const cmd = isLatexCmdAt(text, i);
    if (cmd !== null) {
      const zoneStart = i;
      const zoneEnd = scanLatexZone(text, i);
      zones.push({ start: zoneStart, end: zoneEnd });
      i = zoneEnd;
      continue;
    }
    
    // Check for ^{ or _{ (subscript/superscript)
    if ((text[i] === '^' || text[i] === '_') && i + 1 < text.length && text[i + 1] === '{') {
      const zoneStart = i;
      const zoneEnd = scanLatexZone(text, i);
      zones.push({ start: zoneStart, end: zoneEnd });
      i = zoneEnd;
      continue;
    }
    
    i++;
  }
  
  // Merge overlapping/adjacent zones
  return mergeZones(zones);
}

/**
 * Scan forward from a LaTeX start point, tracking brace depth,
 * including connected LaTeX expressions.
 */
function scanLatexZone(text, start) {
  let i = start;
  let braceDepth = 0;
  let lastLatexEnd = start;
  let gapStart = -1;
  
  while (i < text.length) {
    // Backslash command
    if (text[i] === '\\' && i + 1 < text.length) {
      if (/[a-zA-Z{}\\ ]/.test(text[i + 1])) {
        gapStart = -1;
        if (text[i + 1] === '\\') {
          i += 2;
        } else if (/[a-zA-Z]/.test(text[i + 1])) {
          i++;
          while (i < text.length && /[a-zA-Z]/.test(text[i])) i++;
        } else {
          i += 2;
        }
        lastLatexEnd = i;
        continue;
      }
    }
    
    // Braces
    if (text[i] === '{') {
      braceDepth++;
      gapStart = -1;
      i++;
      lastLatexEnd = i;
      continue;
    }
    if (text[i] === '}') {
      braceDepth--;
      gapStart = -1;
      i++;
      lastLatexEnd = i;
      if (braceDepth <= 0) {
        // Check if there's more LaTeX right after
        const nextNonSpace = skipSpaces(text, i);
        if (nextNonSpace < text.length) {
          const nextCmd = isLatexCmdAt(text, nextNonSpace);
          if (nextCmd !== null || text[nextNonSpace] === '{' || 
              text[nextNonSpace] === '^' || text[nextNonSpace] === '_' ||
              text[nextNonSpace] === '=' || text[nextNonSpace] === '+' ||
              text[nextNonSpace] === '-' || text[nextNonSpace] === '(' ||
              text[nextNonSpace] === ')' || text[nextNonSpace] === '|') {
            continue; // More LaTeX follows
          }
        }
        // Check for trailing operators/symbols that connect expressions
        continue;
      }
      continue;
    }
    
    // Subscript/superscript
    if ((text[i] === '^' || text[i] === '_') && i + 1 < text.length && text[i + 1] === '{') {
      gapStart = -1;
      i++;
      lastLatexEnd = i;
      continue;
    }
    
    // Math operators and small connectors (keep in LaTeX zone)
    if (/[a-zA-Z0-9=+\-*/.,;:!?()[\]|<>&\s^_]/.test(text[i]) && braceDepth > 0) {
      i++;
      lastLatexEnd = i;
      continue;
    }
    
    // Outside braces: plain chars might be part of LaTeX expression
    if (braceDepth <= 0 && /[a-zA-Z0-9=+\-*/.,;:!?()[\]|<>& ]/.test(text[i])) {
      // Allow small gaps between LaTeX sections
      if (gapStart === -1) gapStart = i;
      const gapLen = i - gapStart + 1;
      
      // Check if more LaTeX follows soon
      if (gapLen < 15) {
        i++;
        continue;
      }
      // Too long a gap without LaTeX — end the zone
      break;
    }
    
    // Bengali char or Unicode math — end the zone (unless inside braces)
    if (braceDepth <= 0) {
      if (isBengaliChar(text[i]) || UNICODE_MATH.has(text[i])) {
        break;
      }
    }
    
    i++;
    lastLatexEnd = i;
  }
  
  // Close any open braces
  while (braceDepth > 0 && i < text.length) {
    if (text[i] === '{') braceDepth++;
    if (text[i] === '}') braceDepth--;
    i++;
  }
  
  return Math.max(lastLatexEnd, i);
}

function skipSpaces(text, pos) {
  while (pos < text.length && text[pos] === ' ') pos++;
  return pos;
}

function mergeZones(zones) {
  if (zones.length <= 1) return zones;
  
  zones.sort((a, b) => a.start - b.start);
  const merged = [zones[0]];
  
  for (let i = 1; i < zones.length; i++) {
    const prev = merged[merged.length - 1];
    if (zones[i].start <= prev.end + 5) { // Allow 5-char gaps
      prev.end = Math.max(prev.end, zones[i].end);
    } else {
      merged.push(zones[i]);
    }
  }
  
  return merged;
}

// ═══════════════════════════════════════
// MAIN CLEANUP FUNCTION
// ═══════════════════════════════════════

function cleanField(text) {
  if (!text) return text;
  if (!hasLatexCommands(text)) return text;
  
  // If already has $ delimiters, leave it alone
  if (text.includes('$')) return text;
  
  const zones = findLatexZones(text);
  if (zones.length === 0) return text;
  
  // Build the cleaned text by walking through segments
  let result = '';
  let lastEnd = 0;
  
  for (const zone of zones) {
    // Text before this zone — keep Bengali, drop plain-text math duplicates
    const before = text.substring(lastEnd, zone.start);
    const cleanedBefore = cleanNonLatexSegment(before);
    if (cleanedBefore) {
      result += cleanedBefore + ' ';
    }
    
    // The LaTeX zone itself — wrap in $...$
    let latex = text.substring(zone.start, zone.end).trim();
    
    // Check if this zone has \begin{...} — use $$...$$ for display math
    if (latex.includes('\\begin{')) {
      result += '$$' + latex + '$$';
    } else {
      result += '$' + latex + '$';
    }
    
    lastEnd = zone.end;
  }
  
  // Text after last zone
  const after = text.substring(lastEnd);
  const cleanedAfter = cleanNonLatexSegment(after);
  if (cleanedAfter) {
    result += ' ' + cleanedAfter;
  }
  
  return result.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Clean a non-LaTeX segment: keep Bengali text, remove plain-text math duplicates
 */
function cleanNonLatexSegment(text) {
  if (!text) return '';
  
  let result = '';
  let i = 0;
  
  while (i < text.length) {
    const code = text.charCodeAt(i);
    const ch = text[i];
    
    // Bengali text — always keep
    if (isBengali(code)) {
      result += ch;
      i++;
      continue;
    }
    
    // Common punctuation with Bengali — keep
    if (' ,।-:?!.;\'\"()'.includes(ch)) {
      result += ch;
      i++;
      continue;
    }
    
    // Unicode math symbols — these are duplicate copies, REMOVE
    if (UNICODE_MATH.has(ch)) {
      i++;
      continue;
    }
    
    // ASCII letters/numbers that look like plain-text math copies
    // (e.g., "x2+3x", "dxdy", "cosec" without backslash)
    if (/[a-zA-Z0-9=+\-*/|^_{}<>[\]]/.test(ch)) {
      // Scan ahead: if this is a short word followed by Bengali, it might be meaningful
      // But if it's a long run of ASCII math, it's a duplicate
      let runEnd = i;
      while (runEnd < text.length && /[a-zA-Z0-9=+\-*/.,|^_{}<>[\]()\s]/.test(text[runEnd]) && !isBengali(text.charCodeAt(runEnd))) {
        runEnd++;
      }
      const run = text.substring(i, runEnd);
      
      // Keep if it's very short (might be a variable name in context)
      // Remove if it looks like a math expression duplicate
      if (run.trim().length <= 2 && /^[A-Za-z,]$/.test(run.trim())) {
        result += run;
      }
      // else: skip (it's a plain-text math duplicate)
      
      i = runEnd;
      continue;
    }
    
    // Everything else — keep
    result += ch;
    i++;
  }
  
  return result.replace(/\s{2,}/g, ' ').trim();
}

// ═══════════════════════════════════════
// PROCESSING
// ═══════════════════════════════════════

function processQuestion(q, qIdx) {
  let changes = 0;
  
  const fields = ['question', 'explanation'];
  for (const field of fields) {
    if (!q[field]) continue;
    const cleaned = cleanField(q[field]);
    if (cleaned !== q[field]) {
      q[field] = cleaned;
      changes++;
    }
  }
  
  // Also clean questionLatex/explanationLatex
  for (const field of ['questionLatex', 'explanationLatex']) {
    if (!q[field]) continue;
    let text = q[field];
    if (text.startsWith('$') && text.endsWith('$')) {
      text = text.slice(1, -1);
    }
    const cleaned = cleanField(text);
    if (cleaned !== text) {
      q[field] = cleaned;
      changes++;
    }
  }
  
  // Clean options (remove Unicode math junk but keep the text)
  if (q.options) {
    for (const key of ['a', 'b', 'c', 'd']) {
      if (!q.options[key]) continue;
      const opt = q.options[key];
      if (hasUnicodeMath(opt) || hasLatexCommands(opt)) {
        const cleaned = cleanField(opt);
        if (cleaned !== opt) {
          q.options[key] = cleaned;
          changes++;
        }
      }
    }
  }
  
  return changes;
}

function processFile(filename) {
  const filepath = path.join(PUBLIC_DIR, filename);
  
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    const questions = JSON.parse(raw);
    if (!Array.isArray(questions)) return { file: filename, total: 0, changes: 0 };
    
    let totalChanges = 0;
    for (let i = 0; i < questions.length; i++) {
      totalChanges += processQuestion(questions[i], i);
    }
    
    if (!DRY_RUN && totalChanges > 0) {
      fs.writeFileSync(filepath, JSON.stringify(questions, null, 2) + '\n', 'utf8');
    }
    
    return { file: filename, total: questions.length, changes: totalChanges };
  } catch (e) {
    console.error('  ERROR: ' + filename + ': ' + e.message);
    return { file: filename, total: 0, changes: 0 };
  }
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════

function main() {
  console.log('==========================================');
  console.log('  LaTeX Fix v4 — $ Delimiter Wrapping');
  console.log('  Mode: ' + (DRY_RUN ? 'DRY RUN' : 'LIVE'));
  console.log('==========================================\n');
  
  let files = fs.readdirSync(PUBLIC_DIR).filter(f => f.endsWith('.json') && f !== 'manifest.json');
  if (SINGLE_FILE) {
    files = files.filter(f => f.includes(SINGLE_FILE));
  }
  console.log('Files: ' + files.length + '\n');
  
  const results = [];
  for (const file of files) {
    const r = processFile(file);
    results.push(r);
    if (r.changes > 0) {
      console.log('  ✓ ' + file + ' (' + r.changes + ' fixes / ' + r.total + ' Qs)');
    }
  }
  
  const changed = results.filter(r => r.changes > 0).length;
  const totalFixes = results.reduce((s, r) => s + r.changes, 0);
  const totalQs = results.reduce((s, r) => s + r.total, 0);
  
  console.log('\n─── SUMMARY ───');
  console.log('Files: ' + results.length + ' scanned, ' + changed + ' changed');
  console.log('Questions: ' + totalQs + ', Fixes: ' + totalFixes);
  if (DRY_RUN) console.log('\n(DRY RUN — no files written)');
  else console.log('\nDone! ✓');
}

main();
