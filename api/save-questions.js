import fs from "fs/promises";
import path from "path";

// CORS headers so the script injected into porikkhok.com can POST back to us
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

const DOWNLOAD_CONCURRENCY = 30;  // More parallel downloads
const DOWNLOAD_RETRIES = 3;       // More retries for flaky connections
const DOWNLOAD_TIMEOUT_MS = 8000; // Fail faster, don't block the batch

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeFilename(name, fallback = "file") {
    const raw = typeof name === "string" ? name : "";
    const safe = raw.replace(/[^a-zA-Z0-9\-_.]/g, "_");
    return safe || fallback;
}

function ensureImageExtension(name) {
    return path.extname(name) ? name : `${name}.png`;
}

function withNumericSuffix(fileName, suffix) {
    const ext = path.extname(fileName);
    const base = ext ? fileName.slice(0, -ext.length) : fileName;
    return `${base}_${suffix}${ext || ""}`;
}

async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function normalizeDownloadTasks(tasks) {
    const normalized = [];
    const seenUrls = new Set();
    const usedNames = new Set();

    for (const task of tasks || []) {
        if (!task || typeof task.url !== "string") continue;
        const url = task.url.trim();
        if (!url || seenUrls.has(url)) continue;
        seenUrls.add(url);

        let fileName = ensureImageExtension(sanitizeFilename(task.fname || "image.png", "image.png"));
        let suffix = 2;
        while (usedNames.has(fileName)) {
            fileName = withNumericSuffix(fileName, suffix);
            suffix += 1;
        }
        usedNames.add(fileName);
        normalized.push({ url, fname: fileName });
    }

    return normalized;
}

async function downloadImageTask(task, imagesDir) {
    let lastError = null;

    for (let attempt = 1; attempt <= DOWNLOAD_RETRIES + 1; attempt += 1) {
        try {
            const response = await fetchWithTimeout(task.url, DOWNLOAD_TIMEOUT_MS);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const buf = Buffer.from(await response.arrayBuffer());
            await fs.writeFile(path.join(imagesDir, task.fname), buf);

            return { ok: true, fname: task.fname };
        } catch (err) {
            lastError = err;
            if (attempt <= DOWNLOAD_RETRIES) {
                await sleep(150 * attempt);
            }
        }
    }

    return {
        ok: false,
        fname: task.fname,
        url: task.url,
        error: lastError?.message || "Unknown download error",
    };
}

export default async function handler(req, res) {
    const startedAt = Date.now();

    // Preflight
    if (req.method === "OPTIONS") {
        Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(204).end();
    }

    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { filename, questions, images } = req.body || {};

    if (!filename || !Array.isArray(questions)) {
        return res.status(400).json({ error: "filename and questions[] required" });
    }

    // Sanitize filename — preserve Bengali characters (\u0980-\u09FF) and ASCII safe chars
    const safe = filename
        .replace(/\.json$/i, "")
        .replace(/\s+/g, "-")                                    // spaces → hyphens
        .replace(/[^a-zA-Z0-9\u0980-\u09FF\-_.]/g, "_");        // only strip truly unsafe chars
    const publicDir = path.join(process.cwd(), "public");
    const jsonPath = path.join(publicDir, `${safe}.json`);

    try {
        const timings = {};

        // Ensure public dir exists
        await fs.mkdir(publicDir, { recursive: true });

        // ── Normalize image fields (strict separation) ────────────────────────
        // Converts legacy `image` field → `questionImage`.
        // `explanationImage` is NEVER derived from `image`.
        const normalizedQuestions = questions.map((q) => {
            if (q.questionImage === undefined && q.image !== undefined) {
                // Old schema: promote `image` → `questionImage`, drop `image`
                const { image, ...rest } = q;
                return {
                    ...rest,
                    questionImage: image ?? null,
                    explanationImage: q.explanationImage ?? null,
                };
            }
            // New schema or already migrated: just ensure both fields exist
            return {
                ...q,
                questionImage: q.questionImage ?? null,
                explanationImage: q.explanationImage ?? null,
            };
        });

        // Save JSON
        const saveJsonStart = Date.now();
        await fs.writeFile(jsonPath, JSON.stringify(normalizedQuestions, null, 2), "utf-8");
        console.log(`[save-questions] Saved ${normalizedQuestions.length} questions → public/${safe}.json`);
        timings.saveJsonMs = Date.now() - saveJsonStart;

        // Save base64 images if provided (legacy fallback)
        const imagesDir = path.join(publicDir, "images");
        const savedImages = [];
        const savedImageSet = new Set();
        const pushSaved = (fname) => {
            if (!savedImageSet.has(fname)) {
                savedImageSet.add(fname);
                savedImages.push(fname);
            }
        };
        let legacySavedCount = 0;

        if (images && typeof images === "object") {
            const legacyStart = Date.now();
            await fs.mkdir(imagesDir, { recursive: true });
            for (const [fname, dataUrl] of Object.entries(images)) {
                try {
                    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                        const buf = Buffer.from(match[2], "base64");
                        const safeFname = sanitizeFilename(fname, "image.png");
                        await fs.writeFile(path.join(imagesDir, safeFname), buf);
                        pushSaved(safeFname);
                        legacySavedCount += 1;
                    }
                } catch (e) {
                    console.warn(`[save-questions] Failed to save image ${fname}:`, e.message);
                }
            }
            timings.legacyDecodeMs = Date.now() - legacyStart;
        }

        // Download images directly on the server (super fast, no CORS issues)
        const normalizedTasks = normalizeDownloadTasks(req.body?.imagesToDownload);
        const failedImages = [];
        let downloadedCount = 0;

        if (normalizedTasks.length > 0) {
            const downloadStart = Date.now();
            await fs.mkdir(imagesDir, { recursive: true });
            console.log(`[save-questions] Server-side downloading ${normalizedTasks.length} unique images...`);

            for (let i = 0; i < normalizedTasks.length; i += DOWNLOAD_CONCURRENCY) {
                const batch = normalizedTasks.slice(i, i + DOWNLOAD_CONCURRENCY);
                await Promise.all(batch.map(async (task) => {
                    const result = await downloadImageTask(task, imagesDir);
                    if (result.ok) {
                        pushSaved(result.fname);
                        downloadedCount += 1;
                        return;
                    }
                    failedImages.push({
                        url: result.url,
                        fname: result.fname,
                        error: result.error,
                    });
                    console.warn(`[save-questions] Failed to download image ${task.url}:`, result.error);
                }));
            }
            timings.serverDownloadMs = Date.now() - downloadStart;
        }

        timings.totalMs = Date.now() - startedAt;

        return res.status(200).json({
            success: true,
            file: `public/${safe}.json`,
            questionCount: normalizedQuestions.length,
            imagesSaved: savedImages,
            requestedCount: normalizedTasks.length,
            downloadedCount,
            savedCount: savedImages.length,
            failedCount: failedImages.length,
            failedImages,
            legacyImageCount: legacySavedCount,
            timings,
        });
    } catch (err) {
        console.error("[save-questions]", err);
        return res.status(500).json({ error: err.message });
    }
}
