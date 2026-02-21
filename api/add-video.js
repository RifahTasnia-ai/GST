import { Buffer } from "buffer";
import fs from "fs/promises";
import path from "path";

const TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = "2ace187471b6aede8e81bac3c01067d2";
const MAX_RETRIES = 3;

function parseVideos(content) {
    const parsed = JSON.parse(content || "[]");
    return Array.isArray(parsed) ? parsed : [];
}

async function readLocalVideos() {
    try {
        const filePath = path.join(process.cwd(), FILE_PATH);
        const content = await fs.readFile(filePath, "utf-8");
        return parseVideos(content);
    } catch (err) {
        if (err.code === "ENOENT") return [];
        throw err;
    }
}

async function writeLocalVideos(videos) {
    const filePath = path.join(process.cwd(), FILE_PATH);
    await fs.writeFile(filePath, JSON.stringify(videos, null, 2));
}

async function updateGistVideos(videos) {
    const url = `https://api.github.com/gists/${GIST_ID}`;
    const body = {
        files: {
            "videos.json": {
                content: JSON.stringify(videos, null, 2)
            }
        }
    };

    const res = await fetch(url, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: "application/vnd.github+json"
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const text = await res.text();
        const err = new Error(`GitHub Gist update failed: ${res.status} ${text}`);
        err.status = res.status;
        err.details = text;
        throw err;
    }
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { video } = req.body || {};
    if (!video || typeof video !== "object" || Array.isArray(video)) {
        return res.status(400).json({ error: "Valid video object required in request body" });
    }
    if (!video.id || typeof video.id !== "string") {
        return res.status(400).json({ error: "Video id is required" });
    }
    if (!video.title || typeof video.title !== "string") {
        return res.status(400).json({ error: "Video title is required" });
    }
    if (!video.videoUrl || typeof video.videoUrl !== "string") {
        return res.status(400).json({ error: "Video URL is required" });
    }
    if (!Number.isInteger(Number(video.lesson)) || Number(video.lesson) < 1) {
        return res.status(400).json({ error: "Valid lesson number is required" });
    }

    if (!process.env.GITHUB_TOKEN) {
        try {
            const existing = await readLocalVideos();
            if (existing.some((item) => item.id === video.id)) {
                return res.status(409).json({ error: "Video with this id already exists" });
            }

            await writeLocalVideos([...existing, video]);
            return res.status(200).json({ success: true });
        } catch (err) {
            console.error("add-video local error:", err);
            return res.status(500).json({ error: "Failed to add video locally" });
        }
    }

    if (!OWNER || !REPO || !TOKEN) {
        return res.status(500).json({
            error: "Missing GitHub configuration",
            required: ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_TOKEN"],
        });
    }

    try {
        // Fetch current gist content to append
        const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
            headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json" }
        });

        let videos = [];
        if (gistRes.ok) {
            const data = await gistRes.json();
            videos = parseVideos(data.files["videos.json"]?.content);
        }

        if (videos.some((item) => item.id === video.id)) {
            return res.status(409).json({ error: "Video with this id already exists" });
        }

        videos.push(video);
        await updateGistVideos(videos);
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error("add-video error:", err);
        return res.status(500).json({ error: "Failed to add video", details: err.message });
    }
}
