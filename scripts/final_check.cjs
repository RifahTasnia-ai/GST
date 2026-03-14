/**
 * Test the renderer logic with actual question data.
 * Simulates what ExamPage.jsx now does: prefers questionLatex over question.
 */
const fs = require('fs');
const path = require('path');

const d = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(d).filter(f => f.endsWith('.json') && f !== 'manifest.json');

let stats = { total: 0, hasQLatex: 0, hasExplLatex: 0, plainOnly: 0, hasDollar: 0 };
const problems = [];

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(d, file), 'utf8'));
  if (!Array.isArray(data)) continue;

  for (const q of data) {
    stats.total++;

    // This is what ExamPage.jsx now does:
    const effectiveQ = q.questionLatex || q.question || '';
    const effectiveE = q.explanationLatex || q.explanation || '';

    if (q.questionLatex) stats.hasQLatex++;
    if (q.explanationLatex) stats.hasExplLatex++;
    if (!q.questionLatex && !q.question?.includes('$') && /\\[a-zA-Z]{2,}/.test(q.question || '')) stats.plainOnly++;
    if (effectiveQ.includes('$')) stats.hasDollar++;

    // Check for remaining problems after the fix
    const stillHasUnicode = /[𝑥𝑦𝑎𝑏→∑⁡]/.test(effectiveQ);
    const hasDollar = effectiveQ.includes('$');
    const hasBareLatex = /\\[a-zA-Z]{2,}/.test(effectiveQ) && !hasDollar;

    if (problems.length < 5 && (stillHasUnicode || hasBareLatex)) {
      problems.push({ file, id: q.id, hasDollar, hasBareLatex, stillHasUnicode, text: effectiveQ.substring(0, 100) });
    }
  }
}

console.log('=== After ExamPage.jsx fix: using questionLatex || question ===\n');
console.log('Total questions:', stats.total);
console.log('With questionLatex (clean $...$):', stats.hasQLatex, '(' + Math.round(stats.hasQLatex/stats.total*100) + '%)');
console.log('With explanationLatex:', stats.hasExplLatex, '(' + Math.round(stats.hasExplLatex/stats.total*100) + '%)');
console.log('Effective question has $ delimiters:', stats.hasDollar, '(' + Math.round(stats.hasDollar/stats.total*100) + '%)');
console.log('Bare LaTeX only (no $, no questionLatex):', stats.plainOnly);

if (problems.length > 0) {
  console.log('\n=== REMAINING ISSUES (handled by renderer bare-LaTeX detection) ===');
  for (const p of problems) {
    console.log('\n  File:', p.file, '| Q' + p.id);
    console.log('  hasDollar:', p.hasDollar, '| hasBareLatex:', p.hasBareLatex, '| hasUnicode:', p.stillHasUnicode);
    console.log('  Text:', p.text);
  }
}

// Sample 3 questions with questionLatex
console.log('\n=== SAMPLE: questions with clean questionLatex ===');
const mathFile = files.find(f => f.includes('ম্যাট্রিক্স'));
if (mathFile) {
  const data = JSON.parse(fs.readFileSync(path.join(d, mathFile), 'utf8'));
  for (let i = 0; i < 3; i++) {
    const q = data[i];
    const eff = q.questionLatex || q.question;
    console.log('\nQ' + q.id + ' effective:', eff ? eff.substring(0, 150) : '(empty)');
    console.log('  Has $:', (eff||'').includes('$'), '| Has bare\\cmd:', /\\[a-zA-Z]{2,}/.test(eff||'') && !(eff||'').includes('$'));
  }
}
