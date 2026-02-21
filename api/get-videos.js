import { Buffer } from "buffer";
import fs from "fs/promises";
import path from "path";

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;
const FILE_PATH = "videos.json";

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Local development - read from filesystem
    if (!process.env.VERCEL_ENV) {
        try {
            const filePath = path.join(process.cwd(), FILE_PATH);
            const content = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(content);
            return res.status(200).json(data);
        } catch (err) {
            if (err.code === 'ENOENT') {
                return res.status(200).json([]);
            }
            return res.status(500).json({ error: 'Failed to read videos locally' });
        }
    }

    if (!OWNER || !REPO) {
        return res.status(500).json({
            error: 'Missing GitHub configuration',
            required: ['GITHUB_OWNER', 'GITHUB_REPO']
        })
    }

    // On Vercel - use GitHub Contents API (no caching, always fresh!)
    try {
        const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
        const headers = {
            Accept: 'application/vnd.github+json',
        };
        if (TOKEN) {
            headers.Authorization = `Bearer ${TOKEN}`;
        }

        const response = await fetch(url, { headers, cache: 'no-store' });

        if (!response.ok) {
            if (response.status === 404) {
                return res.status(200).json([]);
            }
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const data = await response.json();
        const decoded = Buffer.from(data.content, 'base64').toString('utf8');
        const videos = JSON.parse(decoded || '[]');

        return res.status(200).json(videos);
    } catch (err) {
        console.error('Error fetching videos:', err);
        return res.status(500).json({ error: 'Failed to fetch videos' });
    }
}
