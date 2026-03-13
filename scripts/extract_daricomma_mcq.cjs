const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:18800');
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('/create-exam/exam-paper/190656')) || context.pages()[0];
  await page.bringToFront();
  await page.waitForTimeout(1500);

  const data = await page.evaluate(() => {
    const clean = (s = '') => s.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
    const cards = Array.from(document.querySelectorAll('div.bg-white.border.rounded-md.p-4.my-2.md\\:my-4.m-2'));

    const subjectFromText = (q) => {
      if (/Ag|Ksp|অরবিটাল|হাইড্রোজেন|ধাতু|সংকরণ|প্যারাম্যাগনেটিক|UV|NO2|Cs|AgCl|গ্যাসটির বর্ণ|আইসোবার/i.test(q)) return 'Chemistry';
      if (/বল|ত্বরণ|বেগ|টর্ক|জড়তার|কাজ|ক্ষমতা|ভরবেগ|নিউটন|ঘাত|স্প্রিং|kg|ms|rad|Nm|J|ওয়াট|পাওয়ার/i.test(q)) return 'Physics';
      return 'Higher Mathematics';
    };

    const rows = cards.map((card, idx) => {
      const qWrap = card.querySelector('div.flex.gap-1.justify-between');
      const qTextRaw = clean((qWrap?.innerText || '').replace(/^\d+\.\s*/, ''));
      const qLatex = Array.from(qWrap?.querySelectorAll('script[type="math/tex"]') || []).map(s => clean(s.textContent)).filter(Boolean);

      const radioInputs = Array.from(card.querySelectorAll('input[type=radio]')).slice(0,4);
      const options = radioInputs.map((r, i) => {
        const root = r.closest('.mantine-Radio-root');
        const textRaw = clean(root?.innerText || '');
        const latex = Array.from(root?.querySelectorAll('script[type="math/tex"]') || []).map(s => clean(s.textContent)).filter(Boolean);
        const text = latex[0] || textRaw;
        return { key: ['a','b','c','d'][i], text, rawText: textRaw, latex, checked: !!r.checked };
      });

      const correct = options.find(o => o.checked)?.key || null;
      const question = qLatex[0] || qTextRaw;

      return {
        id: idx + 1,
        question,
        questionRaw: qTextRaw,
        questionLatex: qLatex,
        options,
        correctAnswer: correct,
        subject: subjectFromText(qTextRaw)
      };
    });

    const valid = rows.filter(r => {
      if (!r.correctAnswer) return false;
      if (r.options.length !== 4) return false;
      if (!r.question || r.question.length < 5) return false;
      if (/imageShouldbeAdded/i.test(r.questionRaw) || /imageShouldbeAdded/i.test(r.question)) return false;
      return true;
    });

    return { total: rows.length, valid: valid.length, rows: valid };
  });

  const final = data.rows.map((r, i) => ({
    id: i + 1,
    subject: r.subject,
    question: r.question,
    options: {
      a: r.options[0]?.text || '',
      b: r.options[1]?.text || '',
      c: r.options[2]?.text || '',
      d: r.options[3]?.text || ''
    },
    correctAnswer: r.correctAnswer,
    questionImage: null,
    explanationImage: null
  }));

  const outPath = path.join(process.cwd(), 'public', 'daricomma_exam_190656_mcq.json');
  fs.writeFileSync(outPath, JSON.stringify(final, null, 2), 'utf8');
  console.log(JSON.stringify({ outPath, totalCards: data.total, validSaved: final.length }, null, 2));
  await browser.close();
})();