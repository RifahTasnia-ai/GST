// Read the actual ম্যাট্রিক্স ও নির্নায়ক.json and analyze exactly what's wrong
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(PUBLIC_DIR).filter(f => f.includes('ম্যাট্রিক্স'));
console.log('Found:', files);

const data = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, files[0]), 'utf8'));
console.log('Total Qs:', data.length);
console.log('');

// Analyze first 5 questions in detail
for (let i = 0; i < Math.min(5, data.length); i++) {
  const q = data[i];
  console.log('====== Q' + q.id + ' ======');
  console.log('QUESTION:');
  console.log('  ' + q.question.substring(0, 200));
  console.log('');
  
  // Check: does question have $ delimiters?
  const hasDollar = q.question.includes('$');
  const hasLatexCmd = /\\[a-zA-Z]/.test(q.question);
  const hasUnicode = /[𝑥𝑦𝑎𝑏𝑐⇒→∴⁡]/.test(q.question);
  
  console.log('  Has $ delimiters: ' + hasDollar);
  console.log('  Has \\commands: ' + hasLatexCmd);
  console.log('  Has Unicode math: ' + hasUnicode);
  
  console.log('');
  console.log('OPTIONS:');
  for (const [k, v] of Object.entries(q.options)) {
    const optHasLatex = /\\[a-zA-Z]/.test(v);
    const optHasDollar = v.includes('$');
    console.log('  ' + k + ': ' + v.substring(0, 80) + (optHasLatex ? ' [HAS LATEX]' : '') + (optHasDollar ? ' [HAS $]' : ''));
  }
  
  console.log('');
  console.log('EXPLANATION (first 150): ' + (q.explanation || '').substring(0, 150));
  console.log('');
  
  if (q.questionLatex) {
    console.log('QUESTION_LATEX (first 150): ' + (q.questionLatex || '').substring(0, 150));
  }
  if (q.explanationLatex) {
    console.log('EXPLANATION_LATEX (first 150): ' + (q.explanationLatex || '').substring(0, 150));
  }
  
  console.log('questionImage: ' + (q.questionImage || 'null'));
  console.log('explanationImage: ' + (q.explanationImage || 'null'));
  console.log('');
}

// Summary stats
let stats = { noDollar: 0, withDollar: 0, withLatex: 0, withUnicode: 0 };
for (const q of data) {
  if (q.question.includes('$')) stats.withDollar++;
  else stats.noDollar++;
  if (/\\[a-zA-Z]/.test(q.question)) stats.withLatex++;
  if (/[𝑥𝑦𝑎𝑏𝑐⇒→∴⁡]/.test(q.question)) stats.withUnicode++;
}
console.log('=== SUMMARY for ' + files[0] + ' ===');
console.log('Total: ' + data.length);
console.log('Questions with $ delimiters: ' + stats.withDollar);
console.log('Questions WITHOUT $ delimiters: ' + stats.noDollar);
console.log('Questions with \\commands (\\frac etc): ' + stats.withLatex);
console.log('Questions with Unicode math (𝑥⇒→): ' + stats.withUnicode);
