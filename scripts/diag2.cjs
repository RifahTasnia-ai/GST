const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(PUBLIC_DIR).filter(f => f.endsWith('.json') && f !== 'manifest.json');

const output = [];

output.push('=== ISSUE 1: explanationImage ===');

let totalExpImg = 0;
let totalQImg = 0;
let expImgSamples = [];

for (const filename of files) {
  const data = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, filename), 'utf8'));
  if (!Array.isArray(data)) continue;
  
  for (const q of data) {
    if (q.explanationImage) {
      totalExpImg++;
      if (expImgSamples.length < 8) {
        expImgSamples.push(filename + ' Q' + q.id + ': ' + q.explanationImage);
      }
    }
    if (q.questionImage) totalQImg++;
  }
}

output.push('Questions with explanationImage: ' + totalExpImg);
output.push('Questions with questionImage: ' + totalQImg);
output.push('');
expImgSamples.forEach(s => output.push('  ' + s));

// Check স্থির তড়িৎ
output.push('');
output.push('=== স্থির তড়িৎ file ===');
const stf = files.find(f => f.includes('স্থির'));
if (stf) {
  const data = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, stf), 'utf8'));
  output.push('File: ' + stf + ' (' + data.length + ' Qs)');
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const q = data[i];
    output.push('Q' + q.id + ': qImg=' + (q.questionImage ? 'YES' : 'no') + ' expImg=' + (q.explanationImage ? 'YES' : 'no') + ' hasDiag=' + q.hasDiagram);
    output.push('  q: ' + (q.question || '').substring(0, 80));
  }
}

// LaTeX samples from math file
output.push('');
output.push('=== ISSUE 2: LaTeX data ===');
const mf = files.find(f => f.includes('অন্তরীকরণ'));
if (mf) {
  const data = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, mf), 'utf8'));
  for (let i = 0; i < 3; i++) {
    output.push('Q' + data[i].id + ': ' + (data[i].question || '').substring(0, 100));
  }
}

fs.writeFileSync('/tmp/diag_output.txt', output.join('\n'), 'utf8');
console.log(output.join('\n'));
