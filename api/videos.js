import { Buffer } from "buffer";
import fs from "fs/promises";
import path from "path";

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;
const FILE_PATH = "videos.json";

function parseVideos(raw) {
    try {
        const parsed = JSON.parse(raw || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/* ── GitHub Contents API helpers (same pattern as save-answer.js) ── */

async function fetchFileFromGitHub() {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: "application/vnd.github+json",
        },
    });

    if (!res.ok) {
        if (res.status === 404) return { videos: [], sha: undefined };
        throw new Error(`GitHub fetch failed: ${res.status}`);
    }

    const data = await res.json();
    const decoded = Buffer.from(data.content, "base64").toString("utf8");
    return { videos: parseVideos(decoded), sha: data.sha };
}

async function updateFileOnGitHub(videos, sha, commitMsg) {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
    const body = {
        message: commitMsg,
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
        throw new Error(`GitHub update failed: ${res.status} ${text}`);
    }
}

/* ── Local filesystem helpers (for dev) ── */

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

/* ── Main handler ── */

export default async function handler(req, res) {
    const isDev = !TOKEN;

    // ─── GET: Fetch all videos ───
    if (req.method === "GET") {
        try {
            if (isDev) {
                return res.status(200).json(await readLocalVideos());
            }
            if (!OWNER || !REPO) {
                return res.status(500).json({ error: "Missing GitHub configuration" });
            }
            const { videos } = await fetchFileFromGitHub();
            return res.status(200).json(videos);
        } catch (err) {
            console.error("get-videos error:", err);
            return res.status(500).json({ error: "Failed to load videos", details: err.message });
        }
    }

    // ─── POST: Add a video ───
    if (req.method === "POST") {
        const { video } = req.body || {};
        if (!video || !video.id) {
            return res.status(400).json({ error: "Valid video object with id is required" });
        }

        try {
            if (isDev) {
                const existing = await readLocalVideos();
                if (existing.some((v) => v.id === video.id)) {
                    return res.status(409).json({ error: "Video already exists" });
                }
                await writeLocalVideos([...existing, video]);
                return res.status(200).json({ success: true });
            }

            if (!OWNER || !REPO) {
                return res.status(500).json({ error: "Missing GitHub configuration" });
            }

            const { videos, sha } = await fetchFileFromGitHub();
            if (videos.some((v) => v.id === video.id)) {
                return res.status(409).json({ error: "Video already exists" });
            }
            await updateFileOnGitHub([...videos, video], sha, "chore: add video");
            return res.status(200).json({ success: true });
        } catch (err) {
            console.error("add-video error:", err);
            return res.status(500).json({ error: "Failed to add video", details: err.message });
        }
    }

    // ─── DELETE: Remove a video ───
    if (req.method === "DELETE") {
        const { id } = req.body || {};
        if (!id) {
            return res.status(400).json({ error: "Video id is required" });
        }

        try {
            if (isDev) {
                const existing = await readLocalVideos();
                const updated = existing.filter((v) => v.id !== id);
                await writeLocalVideos(updated);
                return res.status(200).json({ success: true, deleted: updated.length < existing.length });
            }

            if (!OWNER || !REPO) {
                return res.status(500).json({ error: "Missing GitHub configuration" });
            }

            const { videos, sha } = await fetchFileFromGitHub();
            const updated = videos.filter((v) => v.id !== id);
            if (updated.length === videos.length) {
                return res.status(200).json({ success: true, deleted: false });
            }
            await updateFileOnGitHub(updated, sha, "chore: delete video");
            return res.status(200).json({ success: true, deleted: true });
        } catch (err) {
            console.error("delete-video error:", err);
            return res.status(500).json({ error: "Failed to delete video", details: err.message });
        }
    }

    return res.status(405).json({ error: "Method not allowed" });
}
