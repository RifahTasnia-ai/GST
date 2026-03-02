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

function buildUploadNotice(fileName, questionCount) {
    const now = new Date().toISOString();
    return {
        id: `upload_${Date.now()}`,
        type: "upload",
        title: "New Questions Uploaded",
        message: `A new question set (${fileName}.json, ${questionCount} questions) was uploaded. Wait for teacher instructions before starting.`,
        createdAt: now,
    };
}

async function updateExamConfigWithUploadNotice(fileName, questionCount) {
    const configPath = path.join(process.cwd(), "exam-config.json");
    let config = {};

    try {
        const existing = await fs.readFile(configPath, "utf-8");
        config = JSON.parse(existing);
    } catch (err) {
        if (err?.code !== "ENOENT") throw err;
    }

    const updated = {
        ...config,
        activeQuestionFile: config.activeQuestionFile || "questions.json",
        lastUpdated: config.lastUpdated || null,
        studentNotice: buildUploadNotice(fileName, questionCount),
    };

    await fs.writeFile(configPath, JSON.stringify(updated, null, 2), "utf-8");
}

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

        // ── Save JSON first ───────────────────────────────────────────────────
        const saveJsonStart = Date.now();
        await fs.writeFile(jsonPath, JSON.stringify(normalizedQuestions, null, 2), "utf-8");
        console.log(`[save-questions] Saved ${normalizedQuestions.length} questions → public/${safe}.json`);
        timings.saveJsonMs = Date.now() - saveJsonStart;

        // Best-effort student notification update (do not block upload success)
        try {
            await updateExamConfigWithUploadNotice(safe, normalizedQuestions.length);
        } catch (noticeErr) {
            console.warn("[save-questions] Could not update exam-config notice:", noticeErr?.message || noticeErr);
        }

        // ── Respond immediately so the browser is NEVER frozen ───────────
        // Image downloads continue in the background after the response is sent.
        const normalizedTasks = normalizeDownloadTasks(req.body?.imagesToDownload);
        timings.totalMs = Date.now() - startedAt;

        res.status(200).json({
            success: true,
            file: `public/${safe}.json`,
            questionCount: normalizedQuestions.length,
            imageCount: normalizedTasks.length,
            message: normalizedTasks.length > 0
                ? `JSON saved. Downloading ${normalizedTasks.length} images in background…`
                : 'JSON saved. No images to download.',
            timings,
        });

        // ── Download images asynchronously AFTER response is sent ──────
        // Errors here are logged to server console only (client already got success).
        if (normalizedTasks.length === 0) return;

        const imagesDir = path.join(publicDir, "images");
        await fs.mkdir(imagesDir, { recursive: true });
        console.log(`[save-questions] Background: downloading ${normalizedTasks.length} images…`);

        let downloadedCount = 0;
        let failedCount = 0;
        const dlStart = Date.now();

        for (let i = 0; i < normalizedTasks.length; i += DOWNLOAD_CONCURRENCY) {
            const batch = normalizedTasks.slice(i, i + DOWNLOAD_CONCURRENCY);
            await Promise.all(batch.map(async (task) => {
                const result = await downloadImageTask(task, imagesDir);
                if (result.ok) {
                    downloadedCount++;
                } else {
                    failedCount++;
                    console.warn(`[save-questions] Failed: ${task.url}`, result.error);
                }
            }));
        }

        console.log(
            `[save-questions] Images done: ${downloadedCount} ok, ${failedCount} failed | ${Date.now() - dlStart}ms`
        );

    } catch (err) {
        console.error("[save-questions]", err);
        // Only send error if response hasn't been sent yet
        if (!res.writableEnded) {
            return res.status(500).json({ error: err.message });
        }
    }
}
