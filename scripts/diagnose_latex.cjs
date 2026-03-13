// Quick diagnostic to understand the actual format of LaTeX strings in memory
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(PUBLIC_DIR).filter(f => f.endsWith('.json') && f !== 'manifest.json');

// Find questions with LaTeX content
let found = 0;
for (const filename of files) {
  const data = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, filename), 'utf8'));
  if (!Array.isArray(data)) continue;
  
  for (const q of data) {
    const text = q.questionLatex || q.question || '';
    // Look for any backslash followed by a letter (LaTeX command)
    if (text.match(/\\[a-zA-Z]/)) {
      if (found < 5) {
        console.log('=== FILE: ' + filename + ' Q' + q.id + ' ===');
        console.log('RAW questionLatex (first 200 chars):');
        console.log(JSON.stringify(text.substring(0, 200)));
        console.log('');
        console.log('CHARCODE analysis of first backslash sequence:');
        const bsIdx = text.indexOf('\\');
        if (bsIdx >= 0) {
          for (let i = Math.max(0, bsIdx-2); i < Math.min(text.length, bsIdx+20); i++) {
            console.log(`  [${i}] char='${text[i]}' code=${text.charCodeAt(i)}`);
          }
        }
        console.log('');
        
        // Check for double-backslash patterns
        const doubleBS = (text.match(/\\\\/g) || []).length;
        const singleBS = (text.match(/(?<!\\)\\(?!\\)/g) || []).length;
        console.log('Double-backslash count: ' + doubleBS);
        console.log('Single-backslash count: ' + singleBS);
        console.log('Has \\\\frac: ' + text.includes('\\\\frac'));
        console.log('Has \\frac: ' + text.includes('\\frac'));
        console.log('---');
        found++;
      }
    }
  }
}

if (found === 0) {
  console.log('No questions with LaTeX commands found!');
  // Check raw file content
  const raw = fs.readFileSync(path.join(PUBLIC_DIR, files[0]), 'utf8');
  const idx = raw.indexOf('\\\\');
  if (idx >= 0) {
    console.log('Found \\\\\\\\ in raw file at position ' + idx);
    console.log('Context: ' + raw.substring(Math.max(0, idx-20), idx+40));
  }
}
