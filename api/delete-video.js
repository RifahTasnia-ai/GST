import { Buffer } from "buffer";
import fs from "fs/promises";
import path from "path";

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;
const FILE_PATH = "videos.json";
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

async function fetchVideosAndSha() {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: "application/vnd.github+json",
        },
    });

    if (!res.ok) {
        if (res.status === 404) {
            return { videos: [], sha: undefined };
        }
        throw new Error(`GitHub fetch failed: ${res.status}`);
    }

    const data = await res.json();
    const decoded = Buffer.from(data.content, "base64").toString("utf8");
    return { videos: parseVideos(decoded), sha: data.sha };
}

async function updateRemoteVideos(videos, sha) {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
    const body = {
        message: "chore: delete video",
        content: Buffer.from(JSON.stringify(videos, null, 2)).toString("base64"),
        branch: BRANCH,
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: "application/vnd.github+json",
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text();
        const err = new Error(`GitHub update failed: ${res.status} ${text}`);
        err.status = res.status;
        err.details = text;
        throw err;
    }
}

function isShaConflict(err) {
    return err?.status === 409 || err?.status === 422 || /sha/i.test(err?.details || err?.message || "");
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { id } = req.body || {};
    if (!id || typeof id !== "string") {
        return res.status(400).json({ error: "Video id is required" });
    }

    if (!process.env.VERCEL_ENV) {
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
        for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
            try {
                const { videos, sha } = await fetchVideosAndSha();
                const updated = videos.filter((video) => video.id !== id);

                if (updated.length === videos.length) {
                    return res.status(200).json({ success: true, deleted: false });
                }

                await updateRemoteVideos(updated, sha);
                return res.status(200).json({ success: true, deleted: true });
            } catch (err) {
                if (isShaConflict(err) && attempt < MAX_RETRIES - 1) {
                    continue;
                }
                throw err;
            }
        }

        return res.status(500).json({ error: "Failed to delete video after retries" });
    } catch (err) {
        console.error("delete-video error:", err);
        return res.status(500).json({ error: "Failed to delete video", details: err.message });
    }
}
