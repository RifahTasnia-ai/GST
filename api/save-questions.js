import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { getExamConfig, setExamConfig, saveQuestionFile } from "../lib/runtimeStore.js";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

const DOWNLOAD_CONCURRENCY = 8;
const DOWNLOAD_RETRIES = 3;
const DOWNLOAD_TIMEOUT_MS = 8000;
const CLOUDINARY_FOLDER = "gst-question-images";

function extractQuestionSetPayload(payload) {
    if (Array.isArray(payload)) {
        return {
            meta: {},
            questions: payload,
        };
    }

    if (payload && typeof payload === "object" && Array.isArray(payload.questions)) {
        return {
            meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {},
            questions: payload.questions,
        };
    }

    return {
        meta: {},
        questions: [],
    };
}

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
    const config = await getExamConfig();
    const updated = {
        ...config,
        activeQuestionFile: config.activeQuestionFile || "questions.json",
        lastUpdated: config.lastUpdated || null,
        studentNotice: buildUploadNotice(fileName, questionCount),
    };

    await setExamConfig(updated);
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

function hasCloudinaryConfig() {
    return Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
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

function normalizeQuestionImages(questions) {
    return questions.map((question) => {
        if (question.questionImage === undefined && question.image !== undefined) {
            const { image, ...rest } = question;
            return {
                ...rest,
                questionImage: image ?? null,
                explanationImage: question.explanationImage ?? null,
            };
        }

        return {
            ...question,
            questionImage: question.questionImage ?? null,
            explanationImage: question.explanationImage ?? null,
        };
    });
}

function getImageLookupKeys(task) {
    const fileName = task.fname;
    const bareName = fileName.replace(/^\//, "");
    return [
        task.url,
        fileName,
        bareName,
        `/images/${bareName}`,
        `images/${bareName}`,
        `/public/images/${bareName}`,
        `public/images/${bareName}`,
    ].filter(Boolean);
}

function rewriteQuestionImageReferences(questions, imageMap) {
    const replaceRef = (value) => {
        if (typeof value !== "string" || !value.trim()) {
            return value;
        }

        const directMatch = imageMap.get(value);
        if (directMatch) {
            return directMatch;
        }

        const trimmed = value.trim();
        const basename = path.posix.basename(trimmed);
        if (basename && imageMap.has(basename)) {
            return imageMap.get(basename);
        }

        return value;
    };

    return questions.map((question) => ({
        ...question,
        questionImage: replaceRef(question.questionImage) ?? null,
        explanationImage: replaceRef(question.explanationImage) ?? null,
    }));
}

async function uploadBufferToCloudinary(buffer, task, setName) {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `${CLOUDINARY_FOLDER}/${sanitizeFilename(setName, "set")}`;
    const publicId = task.fname.replace(path.extname(task.fname), "");
    const signaturePayload = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`;
    const signature = crypto.createHash("sha1").update(signaturePayload).digest("hex");

    const formData = new FormData();
    formData.append("file", new Blob([buffer]), task.fname);
    formData.append("api_key", process.env.CLOUDINARY_API_KEY);
    formData.append("timestamp", String(timestamp));
    formData.append("folder", folder);
    formData.append("public_id", publicId);
    // Ask Cloudinary to downscale large images during upload (saving Vercel RAM)
    formData.append("transformation", "c_limit,w_800,q_80");
    formData.append("signature", signature);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`;
    const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloudinary upload failed: ${response.status} ${errorText}`);
    }

    const payload = await response.json();
    return payload.secure_url || payload.url;
}

async function downloadImageTask(task, publicDir, setName) {
    let lastError = null;

    for (let attempt = 1; attempt <= DOWNLOAD_RETRIES + 1; attempt += 1) {
        try {
            const response = await fetchWithTimeout(task.url, DOWNLOAD_TIMEOUT_MS);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const buf = Buffer.from(await response.arrayBuffer());
            const originalFname = task.fname;

            if (hasCloudinaryConfig()) {
                const remoteUrl = await uploadBufferToCloudinary(buf, task, setName);
                return { ok: true, originalFname, fname: task.fname, sourceUrl: task.url, remoteUrl };
            }

            const imagesDir = path.join(publicDir, "images");
            await fs.mkdir(imagesDir, { recursive: true });
            await fs.writeFile(path.join(imagesDir, task.fname), buf);
            return { ok: true, originalFname, fname: task.fname, sourceUrl: task.url, remoteUrl: `/images/${task.fname}` };
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

async function runWithConcurrency(tasks, worker, concurrency) {
    const results = new Array(tasks.length);
    let nextIndex = 0;

    const runners = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
        while (nextIndex < tasks.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await worker(tasks[currentIndex], currentIndex);
        }
    });

    await Promise.all(runners);
    return results;
}

export default async function handler(req, res) {
    const startedAt = Date.now();

    if (req.method === "OPTIONS") {
        Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
        return res.status(204).end();
    }

    Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value));

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { filename, questions, meta } = req.body || {};
    if (!filename) {
        return res.status(400).json({ error: "filename required" });
    }

    const incomingPayload = meta ? { meta, questions } : questions;
    const { questions: extractedQuestions, meta: extractedMeta } = extractQuestionSetPayload(incomingPayload);
    if (!Array.isArray(extractedQuestions) || extractedQuestions.length === 0) {
        return res.status(400).json({ error: "questions[] required" });
    }

    const safe = filename
        .replace(/\.json$/i, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9\u0980-\u09FF\-_.]/g, "_");

    const publicDir = path.join(process.cwd(), "public");
    const jsonPath = path.join(publicDir, `${safe}.json`);

    try {
        const timings = {};
        const usesCloudinary = hasCloudinaryConfig();
        const normalizedTasks = normalizeDownloadTasks(req.body?.imagesToDownload);

        await fs.mkdir(publicDir, { recursive: true });

        const normalizedQuestions = normalizeQuestionImages(extractedQuestions);

        const downloadStart = Date.now();
        const downloadResults = normalizedTasks.length > 0
            ? await runWithConcurrency(
                normalizedTasks,
                (task) => downloadImageTask(task, publicDir, safe),
                DOWNLOAD_CONCURRENCY
            )
            : [];

        timings.imageProcessingMs = Date.now() - downloadStart;

        const imageMap = new Map();
        let uploadedCount = 0;
        let failedCount = 0;

        for (const result of downloadResults) {
            if (!result?.ok) {
                failedCount += 1;
                console.warn(`[save-questions] Failed: ${result?.url}`, result?.error);
                continue;
            }

            uploadedCount += 1;
            for (const key of getImageLookupKeys({ url: result.sourceUrl, fname: result.originalFname || result.fname })) {
                imageMap.set(key, result.remoteUrl);
            }
        }

        const rewrittenQuestions = rewriteQuestionImageReferences(normalizedQuestions, imageMap);
        const jsonPayload = Object.keys(extractedMeta || {}).length > 0
            ? { meta: extractedMeta, questions: rewrittenQuestions }
            : rewrittenQuestions;

        const saveJsonStart = Date.now();
        await saveQuestionFile(`${safe}.json`, jsonPayload);
        timings.saveJsonMs = Date.now() - saveJsonStart;
        timings.totalMs = Date.now() - startedAt;

        console.log(`[save-questions] Saved ${rewrittenQuestions.length} questions -> public/${safe}.json`);

        try {
            await updateExamConfigWithUploadNotice(safe, rewrittenQuestions.length);
        } catch (noticeErr) {
            console.warn("[save-questions] Could not update exam-config notice:", noticeErr?.message || noticeErr);
        }

        return res.status(200).json({
            success: true,
            file: `public/${safe}.json`,
            questionCount: rewrittenQuestions.length,
            imageCount: normalizedTasks.length,
            uploadedImageCount: uploadedCount,
            failedImageCount: failedCount,
            imageStorage: usesCloudinary ? "cloudinary" : "local",
            message: usesCloudinary
                ? `JSON saved. ${uploadedCount}/${normalizedTasks.length} images uploaded to Cloudinary.`
                : normalizedTasks.length > 0
                    ? `JSON saved. ${uploadedCount}/${normalizedTasks.length} images stored locally.`
                    : "JSON saved. No images to download.",
            timings,
        });
    } catch (err) {
        console.error("[save-questions]", err);
        return res.status(500).json({ error: err.message });
    }
}
