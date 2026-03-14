// Check current state of JSON data
const fs = require('fs'), p = require('path');
const d = p.join(__dirname, '..', 'public');
const files = fs.readdirSync(d).filter(f => f.endsWith('.json') && f !== 'manifest.json');

let totalQs = 0, hasQLatex = 0, hasDollar = 0, hasUnicode = 0, hasLatexCmd = 0;

const sampleFile = files.find(f => f.includes('ম্যাট্রিক্স'));
if (sampleFile) {
  const data = JSON.parse(fs.readFileSync(p.join(d, sampleFile), 'utf8'));
  console.log('FILE:', sampleFile);
  console.log('Total Qs:', data.length);
  
  for (let i = 0; i < 3; i++) {
    const q = data[i];
    console.log('\nQ' + q.id + ':');
    console.log('  question (first 150):', (q.question||'').substring(0,150));
    console.log('  questionLatex exists:', !!q.questionLatex, q.questionLatex ? '(first 100): ' + (q.questionLatex||'').substring(0,100) : '');
    console.log('  explanation (first 100):', (q.explanation||'').substring(0,100));
    console.log('  explanationLatex exists:', !!q.explanationLatex);
    console.log('  hasDollarInQ:', (q.question||'').includes('$'));
  }
}

// Stats across all files
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(p.join(d, file), 'utf8'));
  if (!Array.isArray(data)) continue;
  for (const q of data) {
    totalQs++;
    if (q.questionLatex) hasQLatex++;
    if ((q.question||'').includes('$')) hasDollar++;
    if (/[𝑥𝑦→∑⁡²]/.test(q.question||'')) hasUnicode++;
    if (/\\[a-zA-Z]{2,}/.test(q.question||'')) hasLatexCmd++;
  }
}

console.log('\n=== OVERALL STATS ===');
console.log('Total questions:', totalQs);
console.log('With questionLatex field:', hasQLatex);
console.log('With $ in question:', hasDollar);
console.log('With Unicode math in question:', hasUnicode);
console.log('With \\cmd in question:', hasLatexCmd);
