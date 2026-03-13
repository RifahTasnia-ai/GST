// Quick spot-check: show before/after for a few questions
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const BACKUP_DIR = path.join(__dirname, '..', 'public_backup');

// Load cleanup module inline
const cleanupPath = path.join(__dirname, 'cleanup_latex.cjs');

// Read original and compare
const testFiles = ['অন্তরীকরণ.json', 'বহুপদী.json'];
const testIds = [1, 2, 5];

for (const filename of testFiles) {
  const original = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, filename), 'utf8'));
  
  console.log('\n=== ' + filename + ' ===\n');
  
  for (const id of testIds) {
    const q = original.find(q => q.id === id);
    if (!q) continue;
    
    console.log('--- Q' + id + ' BEFORE ---');
    console.log('question: ' + q.question.substring(0, 120));
    console.log('');
  }
}

// Now show what cleanup would produce
// We'll manually apply the same logic
console.log('\n\n========== RUNNING CLEANUP ==========\n');

// Quick inline version of the important functions from cleanup_latex.cjs
function isUnicodeMath(ch) {
  return '⁡⇒⇐←→∴∵∞×÷≥≤≠≈√∑∏∫²³⁴⁻⁺½₁₂₃₄₅₆₇₈₉₀𝑥𝑦𝑧𝑎𝑏𝑐𝑑𝑒𝑓𝑔𝑘𝑚𝑛𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑃𝑉𝑇𝑀𝐿𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾'.includes(ch);
}

for (const filename of testFiles) {
  const original = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, filename), 'utf8'));
  
  for (const id of testIds) {
    const q = original.find(q => q.id === id);
    if (!q) continue;
    
    // Check what portions have LaTeX
    const text = q.question;
    let latexParts = [];
    let plainParts = [];
    
    // Simple scan
    let hasBackslash = /\\[a-zA-Z]/.test(text);
    let hasUnicode = false;
    for (const ch of text) { if (isUnicodeMath(ch)) { hasUnicode = true; break; } }
    
    console.log('Q' + id + ' hasLatex=' + hasBackslash + ' hasUnicodeMath=' + hasUnicode);
    console.log('  Length: ' + text.length + ' chars');
    console.log('  First 150: ' + JSON.stringify(text.substring(0, 150)));
    console.log('');
  }
}
