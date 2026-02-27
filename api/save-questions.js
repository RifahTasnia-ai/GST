import fs from "fs/promises";
import path from "path";

// CORS headers so the script injected into porikkhok.com can POST back to us
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req, res) {
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

    // Sanitize filename
    const safe = filename.replace(/[^a-zA-Z0-9\-_.]/g, "_").replace(/\.json$/i, "");
    const publicDir = path.join(process.cwd(), "public");
    const jsonPath = path.join(publicDir, `${safe}.json`);

    try {
        // Ensure public dir exists
        await fs.mkdir(publicDir, { recursive: true });

        // Save JSON
        await fs.writeFile(jsonPath, JSON.stringify(questions, null, 2), "utf-8");
        console.log(`[save-questions] Saved ${questions.length} questions → public/${safe}.json`);

        // Save images if provided
        const imagesDir = path.join(publicDir, "images");
        const savedImages = [];

        if (images && typeof images === "object") {
            await fs.mkdir(imagesDir, { recursive: true });
            for (const [fname, dataUrl] of Object.entries(images)) {
                try {
                    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                        const buf = Buffer.from(match[2], "base64");
                        const safeFname = fname.replace(/[^a-zA-Z0-9\-_.]/g, "_");
                        await fs.writeFile(path.join(imagesDir, safeFname), buf);
                        savedImages.push(safeFname);
                    }
                } catch (e) {
                    console.warn(`[save-questions] Failed to save image ${fname}:`, e.message);
                }
            }
        }

        return res.status(200).json({
            success: true,
            file: `public/${safe}.json`,
            questionCount: questions.length,
            imagesSaved: savedImages,
        });
    } catch (err) {
        console.error("[save-questions]", err);
        return res.status(500).json({ error: err.message });
    }
}
