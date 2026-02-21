import { Buffer } from "buffer";
import fs from "fs/promises";
import path from "path";

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;
const FILE_PATH = "videos.json";

async function saveLocally(data) {
    const filePath = path.join(process.cwd(), FILE_PATH);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return true;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { videos } = req.body || {};
    if (!Array.isArray(videos)) {
        return res.status(400).json({ error: "Videos array required in request body" });
    }

    if (!process.env.VERCEL_ENV) {
        try {
            await saveLocally(videos);
            console.log(`Saved ${videos.length} videos locally`);
            return res.status(200).json({ success: true });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: "Failed to save videos locally" });
        }
    }

    if (!OWNER || !REPO || !TOKEN) {
        return res.status(500).json({
            error: "Missing GitHub configuration",
            required: ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_TOKEN"],
        });
    }

    try {
        const { sha } = await fetchFileSha();

        const updated = JSON.stringify(videos, null, 2);
        await updateFile(updated, sha);

        console.log(`Saved ${videos.length} videos to GitHub.`);
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('save-videos error:', err);
        return res.status(500).json({ error: "Failed to save videos", details: err.message });
    }
}

async function fetchFileSha() {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
    let res;
    try {
        res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                Accept: "application/vnd.github+json",
            },
        });
    } catch (fetchErr) {
        throw fetchErr;
    }

    if (!res.ok) {
        if (res.status === 404) {
            return { sha: undefined };
        }
        throw new Error(`GitHub fetch failed: ${res.status}`);
    }

    try {
        const data = await res.json();
        return { sha: data.sha };
    } catch (parseErr) {
        throw parseErr;
    }
}

async function updateFile(content, sha) {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
    let res;
    try {
        res = await fetch(url, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                Accept: "application/vnd.github+json",
            },
            body: JSON.stringify({
                message: "chore: update videos.json",
                content: Buffer.from(content).toString("base64"),
                branch: BRANCH,
                sha,
            }),
        });
    } catch (fetchErr) {
        throw fetchErr;
    }

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`GitHub update failed: ${res.status} ${text}`);
    }
}
