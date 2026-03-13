const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:18800');
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('/create-exam/exam-paper/190656')) || context.pages()[0];
  await page.bringToFront();
  await page.waitForTimeout(1200);

  const data = await page.evaluate(() => {
    const clean = (s = '') => s.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
    const cards = Array.from(document.querySelectorAll('div.bg-white.border.rounded-md.p-4.my-2.md\\:my-4.m-2'));

    const detectSubject = (q) => {
      if (/Ag|Ksp|অরবিটাল|হাইড্রোজেন|ধাতু|সংকরণ|প্যারাম্যাগনেটিক|UV|NO2|Cs|AgCl|আইসোবার/i.test(q)) return 'Chemistry';
      if (/বল|ত্বরণ|বেগ|টর্ক|জড়তার|কাজ|ক্ষমতা|ভরবেগ|নিউটন|ঘাত|স্প্রিং|kg|ms|rad|Nm|J|ওয়াট|পাওয়ার/i.test(q)) return 'Physics';
      return 'Higher Mathematics';
    };

    const uniq = (arr) => {
      const out = [];
      const seen = new Set();
      for (const x of arr) {
        if (!x) continue;
        if (seen.has(x)) continue;
        seen.add(x);
        out.push(x);
      }
      return out;
    };

    const rows = cards.map((card, idx) => {
      const qWrap = card.querySelector('div.flex.gap-1.justify-between');
      const qText = clean((qWrap?.innerText || '').replace(/^\d+\.\s*/, ''));
      const qLatexList = uniq(Array.from(qWrap?.querySelectorAll('script[type="math/tex"]') || []).map(s => s.textContent || ''));

      // keep LaTeX EXACT (no normalization/wrapping)
      const question = qLatexList.length ? `${qText}\n${qLatexList.join(' ')}` : qText;

      const options = Array.from(card.querySelectorAll('input[type=radio]')).slice(0, 4).map((r, i) => {
        const root = r.closest('.mantine-Radio-root');
        const textRaw = clean(root?.innerText || '');
        const latexList = uniq(Array.from(root?.querySelectorAll('script[type="math/tex"]') || []).map(s => s.textContent || ''));
        const text = latexList.length ? latexList[0] : textRaw; // exact latex if exists
        return {
          key: ['a','b','c','d'][i],
          text,
          checked: !!r.checked
        };
      });

      return {
        id: idx + 1,
        subject: detectSubject(qText),
        question,
        options,
        correctAnswer: options.find(o => o.checked)?.key || null,
        questionImage: null,
        explanationImage: null,
        questionRaw: qText
      };
    });

    return rows.filter(r => {
      if (!r.correctAnswer) return false;
      if (r.options.length !== 4) return false;
      if (!r.question || r.question.length < 6) return false;
      if (/imageShouldbeAdded/i.test(r.questionRaw) || /oD।=1/.test(r.questionRaw)) return false;
      return true;
    });
  });

  const final = data.map((r, i) => ({
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

  const out = path.join(process.cwd(), 'public', 'daricomma_exam_190656_mcq.json');
  fs.writeFileSync(out, JSON.stringify(final, null, 2), 'utf8');
  console.log(JSON.stringify({ out, total: final.length }, null, 2));
  await browser.close();
})();