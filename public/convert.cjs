const fs = require('fs');

const srcPath = 'C:/Users/Sadik_AI/.gemini/antigravity/brain/6f31571c-9c7b-40c6-b69f-81009b6794aa/browser/extracted.json';
const destPath = 'p:/Soft Make/CRM_AI/GST/public/সরলরেখা.json';

try {
    let buf = fs.readFileSync(srcPath);
    let str = buf.toString('utf8');
    if (str.includes('\0')) str = buf.toString('utf16le');
    str = str.trim();
    if (str.startsWith("```json")) str = str.replace(/^```json/, '').replace(/```$/, '').trim();

    const scrapedData = JSON.parse(str);
    const origData = JSON.parse(fs.readFileSync(destPath, 'utf8'));

    const outData = [];
    const ansMap = { 'ক': 'a', 'খ': 'b', 'গ': 'c', 'ঘ': 'd' };

    for (let i = 0; i < origData.length; i++) {
        const orig = origData[i];
        let p = scrapedData[i];
        if (!p) {
            outData.push(orig);
            continue;
        }

        const out = { ...orig };

        // format out question text
        out.question = (p.question || '').replace(/^\d+\.\s*/, '').trim();

        if (Array.isArray(p.options) && p.options.length >= 4) {
            const cleanOption = (optStr) => {
                let s = optStr || '';
                s = s.replace(/^[কখগঘ]\s*/, '').trim();
                return s;
            };

            out.options = { ...orig.options };
            out.options.a = cleanOption(p.options[0]);
            out.options.b = cleanOption(p.options[1]);
            out.options.c = cleanOption(p.options[2]);
            out.options.d = cleanOption(p.options[3]);
        }

        // Check for 'correct' or 'correctAnswer' etc
        const correctStr = (p.correct || p.correctAnswer || '').trim();
        if (correctStr) {
            // Find if it starts with 'ক', 'খ', 'গ', 'ঘ'
            const firstChar = correctStr.charAt(0);
            if (ansMap[firstChar]) {
                out.correctAnswer = ansMap[firstChar];
            }
        }

        // Wait, the correct answer could be indicated implicitly or explicitly! 
        // If "correct" was not set by the subagent? Let's check `orig.correctAnswer` and just keep it! Yes, the website answers shouldn't change, we can trust the original file for correct answers! We just needed fixing the text!
        out.correctAnswer = orig.correctAnswer;

        // Explanation
        let expl = p.solution || p.explanation || '';
        expl = expl.trim();
        if (expl) {
            out.explanation = expl;
        } else {
            // Let's clear the garbled explanation completely if no explanation is found in scrape
            out.explanation = "";
        }

        // Just copy over original image fields to avoid nuking paths
        out.questionImage = orig.questionImage;
        out.explanationImage = orig.explanationImage;

        outData.push(out);
    }

    fs.writeFileSync(destPath, JSON.stringify(outData, null, 2), 'utf8');
    console.log("SUCCESS. Converted", outData.length, "items.");
} catch (e) {
    console.error(e);
}
