/**
 * porikkhok-scraper-inject.js
 * 
 * Loaded by the bookmarklet into the porikkhok.com exam page.
 * Runs in the same origin context → full DOM access, no CORS block.
 * 
 * Scrapes questions from DOM, fetches correct answers from API,
 * then POSTs everything back to localhost:3000/api/save-questions.
 */
(async function PKS() {
    // ── Config ────────────────────────────────────────────────────────────────
    async function findLocalPort() {
        for (const port of [3000, 3001, 51007, 5173, 4173]) {
            try {
                const r = await fetch(`http://localhost:${port}/api/save-questions`, {
                    method: 'OPTIONS', signal: AbortSignal.timeout(800)
                });
                if (r.status === 204 || r.ok) return port;
            } catch { }
        }
        return 3000;
    }

    // ── UI Overlay ────────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id = '__pks_overlay__';
    overlay.style.cssText = `
    position:fixed;top:20px;right:20px;z-index:99999;
    background:#1a1a2e;border:1px solid #4f46e5;border-radius:12px;
    padding:16px 20px;min-width:300px;max-width:420px;
    box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:sans-serif;color:#e2e8f0;
  `;
    overlay.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span style="font-size:1.2rem;">[PKS]</span>
      <strong style="font-size:0.95rem;color:#818cf8;">Porikkhok Scraper</strong>
      <button id="__pks_close__" style="margin-left:auto;background:none;border:none;color:#64748b;cursor:pointer;font-size:1rem;">X</button>
    </div>
    <div id="__pks_status__" style="font-size:0.82rem;line-height:1.8;color:#94a3b8;max-height:200px;overflow-y:auto;"></div>
    <div id="__pks_inputs__" style="margin-top:12px;display:none;">
      <input id="__pks_fname__" placeholder="Output filename (e.g. Blood-Circulation)" 
        style="width:100%;padding:8px 10px;background:#0f0f1a;border:1px solid #2d2d4e;
               border-radius:8px;color:#e2e8f0;font-size:0.85rem;margin-bottom:8px;box-sizing:border-box;" />
      <input id="__pks_subject__" placeholder="Subject (optional, e.g. Biology)"
        style="width:100%;padding:8px 10px;background:#0f0f1a;border:1px solid #2d2d4e;
               border-radius:8px;color:#e2e8f0;font-size:0.85rem;margin-bottom:8px;box-sizing:border-box;" />
      <button id="__pks_go__" style="width:100%;padding:10px;background:linear-gradient(135deg,#818cf8,#c084fc);
        border:none;border-radius:8px;color:white;font-weight:700;cursor:pointer;font-size:0.9rem;">
        [GO] Scrape & Save
      </button>
    </div>
  `;
    document.body.appendChild(overlay);
    document.getElementById('__pks_close__').onclick = () => overlay.remove();

    const statusEl = document.getElementById('__pks_status__');
    function log(msg, color = '#94a3b8') {
        const d = document.createElement('div');
        d.style.color = color;
        d.textContent = msg;
        statusEl.appendChild(d);
        statusEl.scrollTop = statusEl.scrollHeight;
    }

    // ── Step 1: Auto-detect filename from exam title ──────────────────────────
    const titleEl = document.querySelector('h1,h2,[class*="title"],[class*="heading"]');
    const examTitle = titleEl ? titleEl.innerText.trim().split('\n')[0] : 'Exam';
    const examId = location.pathname.split('/').filter(Boolean).pop();
    const defaultName = examTitle.replace(/[^a-zA-Z0-9\u0980-\u09FF\s-]/g, '').trim().replace(/\s+/g, '-') || `porikkhok-${examId}`;

    // Show inputs with defaults
    document.getElementById('__pks_inputs__').style.display = 'block';
    document.getElementById('__pks_fname__').value = defaultName.slice(0, 50);
    document.getElementById('__pks_subject__').value = examTitle.slice(0, 60);
    log(`[INFO] Detected: "${examTitle}"`, '#818cf8');
    log('Fill in the filename below, then click Scrape & Save.', '#64748b');

    // ── Step 2: Run on button click ───────────────────────────────────────────
    document.getElementById('__pks_go__').onclick = async () => {
        const filename = document.getElementById('__pks_fname__').value.trim() || defaultName;
        const subject = document.getElementById('__pks_subject__').value.trim() || examTitle;
        document.getElementById('__pks_inputs__').style.display = 'none';
        document.getElementById('__pks_go__').disabled = true;

        await runScrape(filename, subject);
    };

    async function runScrape(filename, subject) {
        const runStartedAt = Date.now();
        const stageDurations = {};
        const markStart = () => performance.now();
        const markDone = (name, start) => {
            stageDurations[name] = Math.round(performance.now() - start);
        };

        // ── Scroll full page to load lazy content ────────────────────────────
        const scrollStart = markStart();
        log('[WAIT] Scrolling to load all questions...');
        const totalHeight = document.body.scrollHeight;
        // Slower scroll (300px step, 80ms delay) so lazy images and accordions render
        for (let y = 0; y < totalHeight; y += 300) {
            window.scrollTo(0, y);
            await new Promise(r => setTimeout(r, 80));
        }
        window.scrollTo(0, 0);
        // Wait longer so all lazy content finishes rendering
        await new Promise(r => setTimeout(r, 1500));
        markDone('scrollMs', scrollStart);

        // ── NEW APPROACH: Find all question blocks by number pattern ─────────
        // Porikkhok DOM structure:
        //   <div class="question-container">
        //     <div class="flex justify-between"> ← contains question text + score
        //       <div class="text-lg font-medium">1. প্রশ্ন...</div>
        //     </div>
        //     <div class="grid"> ← contains option buttons
        //       <button>ক ...</button><button>খ ...</button> etc.
        //     </div>
        //     <div class="bg-green-50"> ← explanation (green box)
        //       ব্যাখ্যা...
        //     </div>
        //   </div>

        const domStart = markStart();
        log('[FIND] Scanning page for questions...');

        // Strategy: Find all elements that contain a question number pattern like "1." "2." etc.
        // These are the question text containers.
        const allElements = document.body.querySelectorAll('*');
        const questionBlocks = []; // { textEl, optionsEl, explanationEl, container }

        // First, find all buttons that start with Bengali option letters
        const optLetters = ['ক', 'খ', 'গ', 'ঘ'];
        const keyMap = { 'ক': 'a', 'খ': 'b', 'গ': 'c', 'ঘ': 'd' };

        // Find unique question containers by looking for the option grid
        // (a div/element containing exactly 4 buttons with ক খ গ ঘ)
        const allButtons = Array.from(document.querySelectorAll('button'));
        const kaButtons = allButtons.filter(b => {
            const t = b.innerText.trim();
            return t.startsWith('ক') && t.length > 1;
        });

        log(`[FIND] Found ${kaButtons.length} potential questions`, '#4ade80');

        const rawQuestions = [];

        for (let qi = 0; qi < kaButtons.length; qi++) {
            const kaBtn = kaButtons[qi];

            // Walk up to find the options grid (container with all 4 option buttons)
            let optionsGrid = kaBtn.parentElement;
            for (let i = 0; i < 10; i++) {
                if (!optionsGrid) break;
                const btns = Array.from(optionsGrid.querySelectorAll('button'));
                const hasAll4 = optLetters.every(l => btns.some(b => b.innerText.trim().startsWith(l)));
                const kaCount = btns.filter(b => b.innerText.trim().startsWith('ক')).length;
                if (hasAll4 && kaCount === 1) break;
                optionsGrid = optionsGrid.parentElement;
            }
            if (!optionsGrid) continue;

            // Now walk one more level up to get the full question container
            // (includes question text + options + explanation)
            let questionContainer = optionsGrid.parentElement;
            // If the parent only contains the options grid, go one more level up
            if (questionContainer && questionContainer.children.length <= 1) {
                questionContainer = questionContainer.parentElement;
            }
            if (!questionContainer) continue;

            // ── Extract Question Text ────────────────────────────────────────
            // Question text is in a div/element that is a SIBLING of the options grid
            // It typically comes BEFORE the options grid
            let qText = '';
            for (const child of questionContainer.children) {
                // Skip the options grid itself
                if (child === optionsGrid) continue;
                // Skip elements that look like explanations (green background)
                const bgColor = window.getComputedStyle(child).backgroundColor;
                if (bgColor.includes('209') || bgColor.includes('220') || bgColor.includes('230') ||
                    child.className.includes('green') || child.className.includes('explanation')) continue;

                const text = (child.innerText || '').trim();
                // Look for text that starts with a number (Arabic or Bengali) or any Bengali text
                const startsWithNum = /^\d+\s*[\.\।]/.test(text) || /^[\u09E6-\u09EF]+\s*[\.\।]/.test(text);
                if (startsWithNum && text.length > 5) {
                    // This is the question text block
                    // Remove the question number prefix, score, and "Admission Ventures" tag
                    qText = text
                        .replace(/^[\d\u09E6-\u09EF]+\s*[\.\।]\s*/, '') // remove "1. " or "১. "
                        .replace(/-?\d+\.?\d*\/\d+\.?\d*/, '')           // remove "-0.5/1"
                        .replace(/[A-Za-z\s]*Ventures/gi, '')             // remove "Admission Ventures"
                        .replace(/[A-Za-z\s]*admission/gi, '')
                        .replaceAll('𝓐𝓭𝓶𝓲𝓼𝓼𝓲𝓸𝓷 𝓥𝓮𝓷𝓽𝓾𝓻𝓮𝓼', '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    break;
                }
                // Also try: text that is NOT a number but contains Bengali and is > 10 chars
                if (text.length > 10 && /[\u0980-\u09FF]/.test(text) && !optLetters.some(l => text.startsWith(l))) {
                    qText = text
                        .replace(/^(\d+)\s*[\.\।]\s*/, '')
                        .replace(/-?\d+\.?\d*\/\d+\.?\d*/, '')
                        .replace(/[A-Za-z\s]*Ventures/gi, '')
                        .replace(/[A-Za-z\s]*admission/gi, '')
                        .replaceAll('𝓐𝓭𝓶𝓲𝓼𝓼𝓲𝓸𝓷 𝓥𝓮𝓷𝓽𝓾𝓻𝓮𝓼', '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    break;
                }
            }

            // Fallback: clone container, remove buttons + green boxes, get remaining text
            if (!qText) {
                const clone = questionContainer.cloneNode(true);
                clone.querySelectorAll('button').forEach(b => b.remove());
                // Remove explanation divs (anything with green-ish background)
                clone.querySelectorAll('[class*="green"], [class*="bg-green"]').forEach(el => el.remove());
                const rawText = (clone.textContent || '').trim();
                qText = rawText
                    .split('\n')
                    .filter(line => line.trim().length > 5 && /[\u0980-\u09FF]/.test(line))
                    .slice(0, 1) // Take first Bengali line
                    .join(' ')
                    .replace(/^(\d+)\s*[\.\।]\s*/, '')
                    .replace(/-?\d+\.?\d*\/\d+\.?\d*/, '')
                    .replace(/[A-Za-z\s]*Ventures/gi, '')
                    .replace(/[A-Za-z\s]*admission/gi, '')
                    .replaceAll('𝓐𝓭𝓶𝓲𝓼𝓼𝓲𝓸𝓷 𝓥𝓮𝓷𝓽𝓾𝓻𝓮𝓼', '')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            // ── Extract Options ──────────────────────────────────────────────
            const options = {};
            let correctAnswer = null;
            const optBtns = Array.from(optionsGrid.querySelectorAll('button'));

            for (const btn of optBtns) {
                const t = btn.innerText.trim();
                for (const letter of optLetters) {
                    if (t.startsWith(letter)) {
                        const key = keyMap[letter];
                        // Option text: remove the Bengali letter prefix
                        // Strip Bengali letter prefix: ক) ক। ক. ক- ক– ক— formats
                        options[key] = t.replace(new RegExp(`^${letter}[\\s\\u0964\\.\\)\\-\\u2013\\u2014]*`), '').trim();

                        // Detect correct answer from green styling
                        const bg = window.getComputedStyle(btn).backgroundColor;
                        const cls = btn.className || '';
                        if (bg.includes('34, 197') || bg.includes('22, 163') || bg.includes('74, 222') ||
                            bg.includes('16, 185') || bg.includes('5, 150') || bg.includes('34,197') ||
                            bg.includes('22,163') || bg.includes('74,222') || bg.includes('16,185') ||
                            cls.includes('green') || cls.includes('correct') ||
                            cls.includes('bg-green')) {
                            correctAnswer = key;
                        }
                        break;
                    }
                }
            }

            // ── Extract Explanation (green box below options) ─────────────────
            let explanation = '';
            let explanationEl = null; // the DOM element of the green box
            // Search all descendants for green boxes
            const allDescendants = Array.from(questionContainer.querySelectorAll('*'));
            let nextSib = questionContainer.nextElementSibling;
            if (nextSib) allDescendants.push(...Array.from(nextSib.querySelectorAll('*')), nextSib);

            for (const child of allDescendants) {
                if (child.tagName === 'BUTTON' || child === optionsGrid) continue;
                const bgColor = window.getComputedStyle(child).backgroundColor;
                const cls = child.className || '';
                if (bgColor.includes('240, 253') || bgColor.includes('236, 253') ||
                    bgColor.includes('209') || bgColor.includes('220') || bgColor.includes('230') ||
                    cls.includes('green') || cls.includes('bg-green')) {
                    const text = (child.innerText || '').trim();
                    if (text.length > 5 && !optLetters.some(l => text.startsWith(l))) {
                        explanation = text;
                        explanationEl = child;
                        break;
                    }
                }
            }

            // ── Extract Images (separate question vs explanation) ────────────
            function isImgValid(src) {
                return src && !src.startsWith('data:') && src.length > 10 &&
                    !src.includes('facebook') && !src.includes('pixel') && !src.includes('google');
            }

            // Explanation images: images inside the green explanation box
            const explImgUrls = [];
            if (explanationEl) {
                const explImgs = Array.from(explanationEl.querySelectorAll('img'));
                for (const img of explImgs) {
                    if (isImgValid(img.src)) explImgUrls.push(img.src);
                }
            }
            const explImgSet = new Set(explImgUrls);

            // Question images: all images in the container EXCEPT explanation images
            const allImgEls = Array.from(questionContainer.querySelectorAll('img'));
            let prevSib = questionContainer.previousElementSibling;
            if (prevSib) {
                allImgEls.push(...Array.from(prevSib.querySelectorAll('img')));
                if (prevSib.tagName === 'IMG') allImgEls.push(prevSib);
            }
            let nextSib2 = questionContainer.nextElementSibling;
            if (nextSib2) {
                allImgEls.push(...Array.from(nextSib2.querySelectorAll('img')));
                if (nextSib2.tagName === 'IMG') allImgEls.push(nextSib2);
            }
            const questionImgUrls = allImgEls
                .map(i => i.src)
                .filter(s => isImgValid(s) && !explImgSet.has(s));

            rawQuestions.push({
                question: qText,
                options,
                correctAnswer,
                explanation,
                imageUrls: questionImgUrls,
                explanationImageUrls: explImgUrls
            });
        }

        log(`[FIND] Extracted ${rawQuestions.length} questions from DOM`, '#4ade80');
        markDone('domExtractMs', domStart);

        // Count questions with text
        const withText = rawQuestions.filter(q => q.question.length > 3).length;
        const withExpl = rawQuestions.filter(q => q.explanation.length > 3).length;
        log(`[FIND] ${withText} questions have text, ${withExpl} have explanations`, '#818cf8');

        // ── Fetch API for reliable correct answers ───────────────────────────
        const apiStart = markStart();
        log('[NET] Fetching API for answers...');
        let apiQuestions = [];
        try {
            const teacherMode = location.search.includes('teacher=true');
            const apiUrl = `https://tarek.chorcha.net/exam/${examId}${teacherMode ? '?teacher=true' : ''}`;
            const res = await fetch(apiUrl);
            const data = await res.json();
            apiQuestions = data?.data?.exam?.questions || [];
            log(`[OK] API: ${apiQuestions.length} answers fetched`, '#4ade80');

            // Also extract image URLs from API fields
            for (let i = 0; i < apiQuestions.length && i < rawQuestions.length; i++) {
                const apiQ = apiQuestions[i]?.q || {};
                // Check question/option fields for question images
                const qText = [apiQ.question, apiQ.A, apiQ.B, apiQ.C, apiQ.D]
                    .filter(Boolean).join(' ');
                const qUrlMatches = qText.match(/https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|gif|webp|svg)/gi) || [];
                for (const url of qUrlMatches) {
                    if (!rawQuestions[i].imageUrls.includes(url)) {
                        rawQuestions[i].imageUrls.push(url);
                    }
                }

                // Prefer API explanation as it's more complete
                const e = apiQ?.meta?.ai_explanation;
                if (e && (typeof e === 'string' || e.explanation)) {
                    const explHtml = typeof e === 'string' ? e : e.explanation;
                    const tmp = document.createElement('div');
                    tmp.innerHTML = explHtml;
                    const text = (tmp.innerText || '').trim();
                    if (text.length > 3) {
                        rawQuestions[i].explanation = text;
                    }
                    // Extract explanation images from API explanation HTML
                    const explImgs = Array.from(tmp.querySelectorAll('img'));
                    for (const img of explImgs) {
                        if (img.src && img.src.length > 10 && !rawQuestions[i].explanationImageUrls.includes(img.src)) {
                            rawQuestions[i].explanationImageUrls.push(img.src);
                        }
                    }
                }

                // Check solution field for explanation images
                const solText = [apiQ.solution, JSON.stringify(apiQ.meta || {})].filter(Boolean).join(' ');
                const solUrlMatches = solText.match(/https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|gif|webp|svg)/gi) || [];
                for (const url of solUrlMatches) {
                    if (!rawQuestions[i].explanationImageUrls.includes(url) && !rawQuestions[i].imageUrls.includes(url)) {
                        rawQuestions[i].explanationImageUrls.push(url);
                    }
                }
            }
        } catch (e) {
            log(`[WARN] API failed: ${e.message}`, '#fbbf24');
        }
        markDone('apiFetchMs', apiStart);

        const ansMap = { A: 'a', B: 'b', C: 'c', D: 'd' };

        // ── Report image stats ──────────────────────────────────────────────
        const totalQImgs = rawQuestions.reduce((sum, q) => sum + q.imageUrls.length, 0);
        const totalExplImgs = rawQuestions.reduce((sum, q) => sum + q.explanationImageUrls.length, 0);
        if (totalQImgs > 0) log(`[IMG] ${totalQImgs} question images found`, '#4ade80');
        if (totalExplImgs > 0) log(`[IMG] ${totalExplImgs} explanation images found`, '#4ade80');
        if (totalQImgs === 0 && totalExplImgs === 0) log('[IMG] This exam has NO images', '#64748b');

        const prepareImagesStart = markStart();
        const dlTasks = [];
        const urlToFname = new Map();
        const safeImageExt = (rawUrl) => {
            const clean = rawUrl.split('?')[0].split('#')[0];
            const ext = (clean.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return ext;
            return 'png';
        };

        for (let i = 0; i < rawQuestions.length; i++) {
            const q = rawQuestions[i];
            const questionUrls = Array.from(new Set((q.imageUrls || []).map(u => (u || '').trim()).filter(Boolean)));
            const explanationUrls = Array.from(new Set((q.explanationImageUrls || []).map(u => (u || '').trim()).filter(Boolean)));

            let qImgIndex = 1;
            for (const url of questionUrls) {
                let fname = urlToFname.get(url);
                if (!fname) {
                    fname = `q${i + 1}_img${qImgIndex}.${safeImageExt(url)}`;
                    urlToFname.set(url, fname);
                    dlTasks.push({ i, url, fname, type: 'question' });
                }
                if (!q.localImage) q.localImage = `/images/${fname}`;
                qImgIndex += 1;
            }

            let explImgIndex = 1;
            for (const url of explanationUrls) {
                let fname = urlToFname.get(url);
                if (!fname) {
                    fname = `q${i + 1}_expl${explImgIndex}.${safeImageExt(url)}`;
                    urlToFname.set(url, fname);
                    dlTasks.push({ i, url, fname, type: 'explanation' });
                }
                if (!q.localExplImage) q.localExplImage = `/images/${fname}`;
                explImgIndex += 1;
            }
        }
        markDone('prepareImagesMs', prepareImagesStart);

        // ???? Download images as base64 ????????????????????????????????????????????????????????????????????????????????????????
        // Helper: fetch image via <img>+<canvas> (works when server sends CORS headers)
        async function imgToBase64viaCanvas(url) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || img.width;
                        canvas.height = img.naturalHeight || img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        resolve(canvas.toDataURL('image/png'));
                    } catch (e) { reject(e); }
                };
                img.onerror = () => reject(new Error('Image load failed'));
                img.src = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
            });
        }

        // Helper: fetch image via fetch() API
        async function imgToBase64viaFetch(url) {
            const r = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(10000) });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const blob = await r.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('FileReader failed'));
                reader.readAsDataURL(blob);
            });
        }

        // Helper: fetch via no-cors (gets opaque response - can't read pixels but can use as src)
        // Last resort: just keep the remote URL so we don't lose the image reference
        async function imgToBase64(url) {
            // Strategy 1: canvas approach (fast, works if CORS header present)
            try {
                const b64 = await imgToBase64viaCanvas(url);
                if (b64 && b64.length > 100) return b64;
            } catch (e1) { /* try next */ }

            // Strategy 2: fetch with cors mode
            try {
                const b64 = await imgToBase64viaFetch(url);
                if (b64 && b64.length > 100) return b64;
            } catch (e2) { /* try next */ }

            // Strategy 3: Try adding a CORS proxy
            const encodedUrl = encodeURIComponent(url);
            const proxies = [
                `https://api.allorigins.win/raw?url=${encodedUrl}`,
                `https://api.codetabs.com/v1/proxy?quest=${encodedUrl}`,
                `https://corsproxy.io/?${encodedUrl}`,
            ];
            for (const proxyUrl of proxies) {
                try {
                    const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
                    if (!r.ok) continue;
                    const blob = await r.blob();
                    const b64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () => reject(new Error('FileReader failed'));
                        reader.readAsDataURL(blob);
                    });
                    if (b64 && b64.length > 100) return b64;
                } catch (e3) { /* try next proxy */ }
            }

            throw new Error('All download strategies failed (CORS blocked)');
        }

        const hasImages = dlTasks.length > 0;
        if (hasImages) log(`[IMG] ${dlTasks.length} unique images queued for server download`, '#94a3b8');

        // ── Build final JSON ────────────────────────────────────────────────
        const jsonOut = rawQuestions.map((q, i) => {
            const apiQ = apiQuestions[i]?.q || {};

            // Robust answer normalization:
            // API sends "A","B","C","D" (uppercase) or rarely "a","b"... lowercase.
            // ansMap handles uppercase; also accept already-lowercase a/b/c/d directly.
            const rawAns = (apiQ.answer || '').toString().trim();
            const correct =
                ansMap[rawAns.toUpperCase()]           // "A" → "a"
                || (rawAns.match(/^[a-d]$/) ? rawAns : null)  // already lowercase
                || q.correctAnswer                     // DOM color fallback
                || null;

            // Ultimate Fallback: If DOM question was empty or missed, use API's text
            let finalQText = q.question;
            if (!finalQText || finalQText.length < 5) {
                finalQText = (apiQ.question || '')
                    .replace(/\[IMAGE:.*?\]/g, '')
                    .replace(/[A-Za-z\s]*Ventures/gi, '')
                    .replace(/[A-Za-z\s]*admission/gi, '')
                    .replaceAll('𝓐𝓭𝓶𝓲𝓼𝓼𝓲𝓸𝓷 𝓥𝓮𝓷𝓽𝓾𝓻𝓮𝓼', '')
                    .replace(/<[^>]*>?/gm, '') // Strip HTML tags
                    .trim();
            }

            // hasDiagram = true if ANY question image exists (local OR original URL)
            const hasQImg = !!(q.localImage || (q.imageUrls && q.imageUrls.length > 0));

            return {
                id: i + 1,
                subject,
                question: finalQText,
                options: q.options,
                correctAnswer: correct,
                explanation: q.explanation || '',
                hasDiagram: hasQImg,
                questionImage: q.localImage || null,
                explanationImage: q.localExplImage || null,
                svg_code: '',
                topic: '',
            };
        });

        log(`[OK] Built ${jsonOut.length} questions`, '#4ade80');

        // Verify data quality
        const emptyQs = jsonOut.filter(q => !q.question || q.question.length < 3).length;
        const noAnswer = jsonOut.filter(q => !q.correctAnswer).length;
        if (emptyQs > 0) log(`[WARN] ${emptyQs} questions have empty text`, '#fbbf24');
        if (noAnswer > 0) log(`[WARN] ${noAnswer} questions have no correct answer`, '#fbbf24');
        if (emptyQs === 0 && noAnswer === 0) log('[OK] All questions look good!', '#4ade80');

        // ── POST to local API ───────────────────────────────────────────────
        log('[SAVE] Saving to local server (server will download images)...');
        const port = await findLocalPort();
        const apiEndpoint = `http://localhost:${port}/api/save-questions`;
        const saveStart = markStart();

        let saved = false;
        try {
            // 60s timeout — if server hangs on image downloads, don't freeze the browser
            const r = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, questions: jsonOut, imagesToDownload: dlTasks }),
                signal: AbortSignal.timeout(60000)
            });
            const result = await r.json();
            if (result.success) {
                log(`[OK] Saved -> ${result.file}`, '#4ade80');
                if (result.imagesSaved?.length) {
                    log(`[OK] ${result.imagesSaved.length} images saved to public/images/`, '#4ade80');
                }
                if (typeof result.requestedCount === 'number') {
                    log(`[IMG] Requested ${result.requestedCount}, saved ${result.downloadedCount ?? result.imagesSaved?.length ?? 0}, failed ${result.failedCount ?? 0}`, '#818cf8');
                }
                if ((result.failedCount || 0) > 0) {
                    log(`[WARN] ${result.failedCount} images failed on server. Check API logs for URLs.`, '#fbbf24');
                }
                if (result.timings?.totalMs != null) {
                    log(`[TIME] Server total ${result.timings.totalMs}ms (download ${result.timings.serverDownloadMs ?? 0}ms)`, '#64748b');
                }
                saved = true;
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (e) {
            log(`[WARN] Server save failed: ${e.message}`, '#fbbf24');
        }
        markDone('saveRequestMs', saveStart);

        // ── Fallback: download file directly ───────────────────────────────
        if (!saved) {
            const fallbackStart = markStart();
            log('[DOWN] Falling back to browser download...', '#fbbf24');
            const blob = new Blob([JSON.stringify(jsonOut, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${filename.replace(/\.json$/, '')}.json`;
            a.click();
            log(`[OK] Downloaded ${filename}.json`, '#4ade80');

            if (hasImages) {
                log('[DOWN] Downloading images in browser (fallback — images may fail due to CORS)...', '#a78bfa');
                const BATCH_SIZE = 4;
                // Per-image hard timeout: 5s — never let one blocked image stall the queue
                const withTimeout = (promise, ms) =>
                    Promise.race([
                        promise,
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
                    ]);

                for (let i = 0; i < dlTasks.length; i += BATCH_SIZE) {
                    const batch = dlTasks.slice(i, i + BATCH_SIZE);
                    await Promise.all(batch.map(async (task) => {
                        try {
                            const b64 = await withTimeout(imgToBase64(task.url), 5000);
                            const a2 = document.createElement('a');
                            a2.href = b64;
                            a2.download = task.fname;
                            a2.click();
                            await new Promise(r => setTimeout(r, 250));
                        } catch (e) {
                            log(`[SKIP] ${task.fname} — ${e.message}`, '#64748b');
                        }
                    }));
                }
                log('[OK] Images done — move any downloaded files to public/images/', '#4ade80');
            }
            markDone('fallbackBrowserMs', fallbackStart);
        }

        const totalMs = Date.now() - runStartedAt;
        log(
            `[TIME] total ${totalMs}ms | scroll ${stageDurations.scrollMs || 0}ms | dom ${stageDurations.domExtractMs || 0}ms | api ${stageDurations.apiFetchMs || 0}ms | map ${stageDurations.prepareImagesMs || 0}ms | save ${stageDurations.saveRequestMs || 0}ms`,
            '#64748b'
        );
        log('[DONE] All done!', '#818cf8');
    }
})();
