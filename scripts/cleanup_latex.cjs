/**
 * LaTeX Deduplication Script for GST Project - v3
 * 
 * Problem: Fields contain TRIPLE content: [plain1][LaTeX][plain2]
 * 
 * NEW APPROACH: Instead of trying to extract the middle section,
 * use the EXISTING `question` field from the JSON but improve
 * how the renderer handles it. 
 * 
 * Actually — the renderer uses KaTeX on `question` field looking for $ delimiters.
 * The issue is the `question` field has NO $ delimiters, so KaTeX can't find math.
 * 
 * REAL FIX: The `question` field has the triple pattern embedded.
 * We need to:
 *  1. Keep only the LaTeX version (the part with backslash commands)
 *  2. Keep Bengali text segments
 *  3. Wrap the LaTeX parts in $ $ delimiters so the renderer can find them
 *  4. Remove the plain-text duplicate copies
 * 
 * Usage:
 *   node scripts/cleanup_latex.cjs              - Process all files  
 *   node scripts/cleanup_latex.cjs --dry-run    - Preview without modifying
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DRY_RUN = process.argv.includes('--dry-run');

// ═══════════════════════════════════════════
// APPROACH: Split text into chunks, identify LaTeX vs plain duplicates
// ═══════════════════════════════════════════

/**
 * The text has this repeating pattern (for each formula):
 *   [plain_text_v1] [proper_latex_v1] [plain_text_v2]
 * 
 * Where plain_text_v1 and plain_text_v2 are the same formula
 * but rendered as Unicode text (with ≥, →, ⁡, 𝑥, etc.)
 * and proper_latex_v1 has \ commands like \frac, \sin, etc.
 * 
 * Strategy: 
 * - Scan through the string character by character
 * - When we hit a backslash followed by a letter (LaTeX command start),
 *   we're in the LaTeX zone
 * - When we leave the LaTeX zone and hit Unicode math symbols,
 *   we're in a plain-text duplicate
 * - Keep LaTeX zones + Bengali text, drop plain-text math duplicates
 */

// Unicode chars that appear ONLY in plain-text copies (not in proper LaTeX)
const UNICODE_MATH_CHARS = new Set([
  '⁡',   // U+2061 - function application (invisible)
  '⇒',  '⇐', '←', '→',   // arrows (LaTeX uses \Rightarrow etc.)
  '∴', '∵',               // therefore/because  
  '∞',                    // infinity (LaTeX uses \infty)
  '×', '÷',              // times/divide (LaTeX uses \times, \div)
  '≥', '≤', '≠', '≈',   // comparisons
  '√',                    // sqrt
  '∑', '∏', '∫',          // sum, product, integral
  '²', '³', '⁴', '⁻', '⁺', '½', // superscripts
  '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉', '₀', // subscripts
  // Mathematical italic letters (these appear in plain copies)
  '𝑥', '𝑦', '𝑧', '𝑎', '𝑏', '𝑐', '𝑑', '𝑒', '𝑓', '𝑔', '𝑘', '𝑚', '𝑛', '𝑝', '𝑞', '𝑟', '𝑠', '𝑡', '𝑢', '𝑣', '𝑤',
  '𝑃', '𝑉', '𝑇', '𝑀', '𝐿', '𝐴', '𝐵', '𝐶', '𝐷', '𝐸', '𝐹', '𝐺', '𝐻', '𝐼', '𝐽', '𝐾',
]);

function isUnicodeMath(ch) {
  return UNICODE_MATH_CHARS.has(ch);
}

function isBengali(code) {
  return code >= 0x0980 && code <= 0x09FF;
}

function hasLatexCommands(text) {
  if (!text) return false;
  return /\\[a-zA-Z]/.test(text);
}

function hasUnicodeMath(text) {
  if (!text) return false;
  for (const ch of text) {
    if (isUnicodeMath(ch)) return true;
  }
  return false;
}

/**
 * Check if a text chunk is a "plain-text math copy" — contains
 * ASCII letters and digits mixed with common math layout chars
 * but WITHOUT any LaTeX backslash commands.
 * 
 * Example plain-text copies:
 *   "x→0limx2cosx−1=?"
 *   "dxdy=−xy"
 */
function isPlainMathChunk(text) {
  if (!text || text.length < 3) return false;
  if (hasLatexCommands(text)) return false; // Has LaTeX commands = not plain
  
  // Must have some math-looking content (not just Bengali)
  const hasMathChars = /[0-9a-zA-Z=+\-*/^_(){}|]/.test(text) || hasUnicodeMath(text);
  if (!hasMathChars) return false;
  
  // Count different character types
  let asciiMath = 0, bengaliCount = 0, unicodeMath = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (isBengali(code)) bengaliCount++;
    else if (isUnicodeMath(ch)) unicodeMath++;
    else if (/[0-9a-zA-Z=+\-*/^_(){}|.,<>]/.test(ch)) asciiMath++;
  }
  
  // If mostly ASCII math or Unicode math with little Bengali, it's a plain copy
  const total = text.length;
  const mathRatio = (asciiMath + unicodeMath) / total;
  return mathRatio > 0.3 && !hasLatexCommands(text);
}

/**
 * Main cleanup function: process a text field to remove duplicates.
 * 
 * Scans through and builds a cleaned version:
 * - Bengali text segments → keep
 * - LaTeX command segments → keep (wrap in $ if needed)
 * - Plain-text math copy segments → REMOVE
 */
function cleanField(text) {
  if (!text) return text;
  if (!hasLatexCommands(text)) return text;  // No LaTeX = nothing to fix
  if (!hasUnicodeMath(text)) return text;    // No plain copies = nothing to fix
  
  // Tokenize: split into segments of different types
  const tokens = tokenize(text);
  
  // Filter: keep LaTeX + Bengali, remove plain-text math copies
  const cleaned = tokens
    .filter(t => t.type !== 'plain_math')
    .map(t => t.text)
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim();
  
  return cleaned;
}

/**
 * Tokenize text into segments:
 * - 'latex': contains backslash commands
 * - 'bengali': Bengali text
 * - 'plain_math': plain-text math copies (to be removed)
 * - 'other': punctuation, whitespace etc
 */
function tokenize(text) {
  const tokens = [];
  let i = 0;
  
  while (i < text.length) {
    // Check for LaTeX command start
    if (text[i] === '\\' && i + 1 < text.length && /[a-zA-Z{]/.test(text[i + 1])) {
      // Scan forward through the LaTeX section
      let latexEnd = scanLatexSection(text, i);
      tokens.push({ type: 'latex', text: text.substring(i, latexEnd) });
      i = latexEnd;
      continue;
    }
    
    // Check for Bengali text
    if (isBengali(text.charCodeAt(i))) {
      let end = i + 1;
      while (end < text.length && (
        isBengali(text.charCodeAt(end)) || 
        text[end] === ' ' || text[end] === ',' || text[end] === '।' || 
        text[end] === '-' || text[end] === ':' || text[end] === '?' || text[end] === '!' ||
        text[end] === '(' || text[end] === ')' || text[end] === '\'' || text[end] === '"' ||
        text[end] === '.' || text[end] === ';'
      )) {
        end++;
      }
      tokens.push({ type: 'bengali', text: text.substring(i, end) });
      i = end;
      continue;
    }
    
    // Check for Unicode math symbols (these are part of plain-text copies)
    if (isUnicodeMath(text[i])) {
      let end = i + 1;
      // Scan through the plain-text math section
      while (end < text.length && !isBengali(text.charCodeAt(end))) {
        if (text[end] === '\\' && end + 1 < text.length && /[a-zA-Z{]/.test(text[end + 1])) {
          break; // Hit a LaTeX command
        }
        end++;
        // Safety limit
        if (end - i > 500) break;
      }
      const chunk = text.substring(i, end);
      // Check if this is a plain-text math copy or actual content
      if (isPlainMathChunk(chunk)) {
        tokens.push({ type: 'plain_math', text: chunk });
      } else {
        tokens.push({ type: 'other', text: chunk });
      }
      i = end;
      continue;
    }
    
    // Check for sequences of ASCII math chars (a-z, 0-9, operators) 
    // that appear BETWEEN LaTeX sections — these might be plain copies
    if (/[a-zA-Z0-9]/.test(text[i]) && !hasLatexNearby(text, i)) {
      let end = i + 1;
      while (end < text.length && !isBengali(text.charCodeAt(end)) && !isUnicodeMath(text[end])) {
        if (text[end] === '\\' && end + 1 < text.length && /[a-zA-Z{]/.test(text[end + 1])) {
          break; // Hit a LaTeX command  
        }
        end++;
        if (end - i > 500) break;
      }
      const chunk = text.substring(i, end);
      // Check if it's a plain-tex copy or regular content
      // Plain copies tend to have things like "x2+3x" without LaTeX commands
      if (isPlainMathChunk(chunk) && chunk.length > 5) {
        tokens.push({ type: 'plain_math', text: chunk });
      } else {
        tokens.push({ type: 'other', text: chunk });
      }
      i = end;
      continue;
    }
    
    // Any other character
    tokens.push({ type: 'other', text: text[i] });
    i++;
  }
  
  return tokens;
}

/**
 * Check if there's a LaTeX command within a few chars of position
 */
function hasLatexNearby(text, pos) {
  // Check backward
  for (let j = pos; j >= Math.max(0, pos - 5); j--) {
    if (text[j] === '\\' && j + 1 < text.length && /[a-zA-Z]/.test(text[j + 1])) return true;
  }
  // Check forward
  for (let j = pos; j < Math.min(text.length, pos + 5); j++) {
    if (text[j] === '\\' && j + 1 < text.length && /[a-zA-Z]/.test(text[j + 1])) return true;
  }
  return false;
}

/**
 * Scan forward through a LaTeX section starting at a backslash command.
 * Includes the full command, its braced arguments, and any connecting LaTeX.
 */
function scanLatexSection(text, start) {
  let i = start;
  let braceDepth = 0;
  let consecutiveNonLatex = 0;
  
  while (i < text.length) {
    if (text[i] === '{') {
      braceDepth++;
      consecutiveNonLatex = 0;
    } else if (text[i] === '}') {
      braceDepth--;
      consecutiveNonLatex = 0;
    } else if (text[i] === '\\' && i + 1 < text.length && /[a-zA-Z{]/.test(text[i + 1])) {
      consecutiveNonLatex = 0; // Another LaTeX command
    } else if (isBengali(text.charCodeAt(i))) {
      // Bengali char in LaTeX section (might be \text{...} content)
      if (braceDepth > 0) {
        consecutiveNonLatex = 0; // Inside braces, Bengali is OK
      } else {
        consecutiveNonLatex++;
        if (consecutiveNonLatex > 3) break; // Multiple Bengali chars outside braces = section ended
      }
    } else if (isUnicodeMath(text[i])) {
      // Unicode math symbol = plain text copy started
      if (braceDepth <= 0) break;
    } else {
      // Regular chars (letters, numbers, operators) are fine in LaTeX
      if (/[a-zA-Z0-9=+\-*/.,;:!?() \n\r\t\[\]]/.test(text[i])) {
        consecutiveNonLatex = 0;
      }
    }
    
    i++;
    // Safety
    if (i - start > 5000) break;
  }
  
  // Don't end inside open braces
  while (braceDepth > 0 && i < text.length) {
    if (text[i] === '{') braceDepth++;
    if (text[i] === '}') braceDepth--;
    i++;
  }
  
  return i;
}

// ═══════════════════════════════════════════
// PROCESSING
// ═══════════════════════════════════════════

function processQuestion(q) {
  let changes = 0;
  
  const fields = ['question', 'explanation', 'questionLatex', 'explanationLatex'];
  for (const field of fields) {
    if (!q[field]) continue;
    
    let text = q[field];
    // Strip $...$ wrapper from latex fields
    if ((field === 'questionLatex' || field === 'explanationLatex') && text.startsWith('$') && text.endsWith('$')) {
      text = text.slice(1, -1);
    }
    
    const cleaned = cleanField(text);
    if (cleaned && cleaned !== q[field] && cleaned.length > 5 && cleaned.length < q[field].length * 0.95) {
      q[field] = cleaned;
      changes++;
    }
  }
  
  return changes;
}

function processFile(filename) {
  const filepath = path.join(PUBLIC_DIR, filename);
  
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    const questions = JSON.parse(raw);
    if (!Array.isArray(questions)) return { file: filename, processed: 0, changed: 0 };

    let totalChanges = 0;
    for (const q of questions) {
      totalChanges += processQuestion(q);
    }

    if (!DRY_RUN && totalChanges > 0) {
      fs.writeFileSync(filepath, JSON.stringify(questions, null, 2) + '\n', 'utf8');
    }

    return { file: filename, processed: questions.length, changed: totalChanges };
  } catch (e) {
    console.error('  ERROR: ' + filename + ': ' + e.message);
    return { file: filename, processed: 0, changed: 0 };
  }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

function main() {
  console.log('=========================================');
  console.log('  GST LaTeX Deduplication v3');
  console.log('  Mode: ' + (DRY_RUN ? 'DRY RUN' : 'LIVE'));
  console.log('=========================================');

  const files = fs.readdirSync(PUBLIC_DIR).filter(f => f.endsWith('.json') && f !== 'manifest.json');
  console.log('Files found: ' + files.length + '\n');

  const results = [];
  for (const file of files) {
    const result = processFile(file);
    results.push(result);
    if (result.changed > 0) {
      console.log('  CHANGED: ' + file + ' (' + result.changed + ' fixes in ' + result.processed + ' Qs)');
    }
  }

  const totalChanges = results.reduce((s, r) => s + r.changed, 0);
  const filesChanged = results.filter(r => r.changed > 0).length;
  const totalQuestions = results.reduce((s, r) => s + r.processed, 0);

  console.log('\n----- SUMMARY -----');
  console.log('Files: ' + results.length + ' processed, ' + filesChanged + ' changed');
  console.log('Questions: ' + totalQuestions + ', Fixes: ' + totalChanges);
  if (DRY_RUN) console.log('\n(DRY RUN)');
  else console.log('\nDone.');
}

main();
