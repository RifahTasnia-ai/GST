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

    const { id } = req.body || {};
    if (!id || typeof id !== "string") {
        return res.status(400).json({ error: "Video id is required" });
    }

    if (!process.env.GITHUB_TOKEN) {
        try {
            const existing = await readLocalVideos();
            const updated = existing.filter((video) => video.id !== id);
            const deleted = updated.length !== existing.length;
            await writeLocalVideos(updated);
            return res.status(200).json({ success: true, deleted });
        } catch (err) {
            console.error("delete-video local error:", err);
            return res.status(500).json({ error: "Failed to delete video locally" });
        }
    }

    if (!OWNER || !REPO || !TOKEN) {
        return res.status(500).json({
            error: "Missing GitHub configuration",
            required: ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_TOKEN"],
        });
    }

    try {
        const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
            headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json" }
        });

        let videos = [];
        if (gistRes.ok) {
            const data = await gistRes.json();
            videos = parseVideos(data.files["videos.json"]?.content);
        }

        const updated = videos.filter((video) => video.id !== id);

        if (updated.length === videos.length) {
            return res.status(200).json({ success: true, deleted: false });
        }

        await updateGistVideos(updated);
        return res.status(200).json({ success: true, deleted: true });
    } catch (err) {
        console.error("delete-video error:", err);
        return res.status(500).json({ error: "Failed to delete video", details: err.message });
    }
}
