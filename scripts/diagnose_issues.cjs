// Diagnose both issues: explanationImage + LaTeX problems
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(PUBLIC_DIR).filter(f => f.endsWith('.json') && f !== 'manifest.json');

console.log('=== ISSUE 1: explanationImage showing in wrong places ===\n');

let totalWithExpImg = 0;
let totalWithQImg = 0;

for (const filename of files) {
  const data = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, filename), 'utf8'));
  if (!Array.isArray(data)) continue;
  
  for (const q of data) {
    if (q.explanationImage) {
      totalWithExpImg++;
      if (totalWithExpImg <= 5) {
        console.log(filename + ' Q' + q.id + ':');
        console.log('  explanationImage: ' + q.explanationImage);
        console.log('  questionImage: ' + (q.questionImage || 'null'));
        console.log('');
      }
    }
    if (q.questionImage) totalWithQImg++;
  }
}

console.log('Total questions with explanationImage: ' + totalWithExpImg);
console.log('Total questions with questionImage: ' + totalWithQImg);

// Check the file user has open
const targetFiles = files.filter(f => f.includes('তড়িৎ'));
console.log('\n=== তড়িৎ files: ' + targetFiles.join(', ') + ' ===\n');

for (const filename of targetFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, filename), 'utf8'));
  if (!Array.isArray(data)) continue;
  
  console.log(filename + ': ' + data.length + ' questions');
  
  // Show first 3 questions  
  for (let i = 0; i < Math.min(3, data.length); i++) {
    const q = data[i];
    console.log('  Q' + q.id + ':');
    console.log('    question (first 100): ' + (q.question || '').substring(0, 100));
    console.log('    questionImage: ' + (q.questionImage || 'null'));
    console.log('    explanationImage: ' + (q.explanationImage || 'null'));
    console.log('    hasDiagram: ' + q.hasDiagram);
    console.log('    explanation (first 100): ' + (q.explanation || '').substring(0, 100));
    console.log('');
  }
}

console.log('\n=== ISSUE 2: LaTeX still showing garbled ===\n');

// Show a raw question to understand what the user sees
const mathFile = files.find(f => f.includes('অন্তরীকরণ'));
if (mathFile) {
  const data = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, mathFile), 'utf8'));
  console.log('Sample from ' + mathFile + ':');
  console.log('Q1 question: ' + JSON.stringify(data[0].question));
  console.log('Q2 question: ' + JSON.stringify(data[1].question));
  console.log('Q5 question: ' + JSON.stringify(data[4].question));
}
