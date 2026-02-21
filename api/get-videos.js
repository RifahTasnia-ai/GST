import { Buffer } from "buffer";
import fs from "fs/promises";
import path from "path";

const TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = "2ace187471b6aede8e81bac3c01067d2";
const FILE_PATH = "videos.json";

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Local development - read from filesystem
    if (!process.env.GITHUB_TOKEN) {
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

    if (!TOKEN) {
        return res.status(500).json({
            error: "Missing GitHub configuration",
            required: ["GITHUB_TOKEN"]
        });
    }

    try {
        const url = `https://api.github.com/gists/${GIST_ID}`;
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                Accept: 'application/vnd.github+json'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                return res.status(200).json([]);
            }
            throw new Error(`GitHub Gist fetch failed: ${response.status}`);
        }

        const data = await response.json();
        const fileContent = data.files['videos.json']?.content || '[]';
        const videos = JSON.parse(fileContent);

        return res.status(200).json(videos);
    } catch (err) {
        console.error('get-videos error:', err);
        return res.status(500).json({ error: "Failed to load videos", details: err.message });
    }
}
