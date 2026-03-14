// Quick verification: show sample outputs after v4 fix
const fs = require('fs');
const path = require('path');
const d = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(d).filter(f => f.endsWith('.json') && f !== 'manifest.json');

// Sample from math file
const mathFile = files.find(f => f.includes('ম্যাট্রিক্স'));
const calcFile = files.find(f => f.includes('অন্তরীকরণ'));
const physFile = files.find(f => f.includes('স্থির'));

function showSample(filename, count) {
  if (!filename) return;
  const data = JSON.parse(fs.readFileSync(path.join(d, filename), 'utf8'));
  console.log('\n=== ' + filename + ' (' + data.length + ' Qs) ===');
  
  let hasDollar = 0;
  for (const q of data) { if (q.question.includes('$')) hasDollar++; }
  console.log('Questions with $ delimiters: ' + hasDollar + '/' + data.length);
  
  for (let i = 0; i < Math.min(count, data.length); i++) {
    console.log('\nQ' + data[i].id + ':');
    console.log('  ' + data[i].question.substring(0, 180));
    if (data[i].explanation) {
      console.log('  EXPL: ' + data[i].explanation.substring(0, 120));
    }
  }
}

showSample(mathFile, 3);
showSample(calcFile, 3);
showSample(physFile, 2);
