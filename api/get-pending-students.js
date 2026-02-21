import { Buffer } from "buffer";
import fs from "fs/promises";
import path from "path";

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;
const FILE_PATH = "pending-students.json";

// 61 minutes in milliseconds - matches exam timeout
const TIMEOUT_MS = 61 * 60 * 1000;

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Local development - read from filesystem
    if (!process.env.VERCEL_ENV) {
        try {
            const filePath = path.join(process.cwd(), FILE_PATH);
            const content = await fs.readFile(filePath, 'utf-8');
            let data = JSON.parse(content);

            // Auto-cleanup: remove pending students older than 61 minutes
            const now = Date.now();
            const before = data.length;
            data = data.filter(item => {
                if (!item || !item.timestamp) return false;
                const itemTime = new Date(item.timestamp).getTime();
                if (isNaN(itemTime)) return false;
                return (now - itemTime) < TIMEOUT_MS;
            });

            // If we cleaned up any, save back to file
            if (data.length !== before) {
                await fs.writeFile(filePath, JSON.stringify(data, null, 2));
                console.log(`Cleaned up ${before - data.length} expired pending student(s)`);
            }

            return res.status(200).json(data);
        } catch (err) {
            if (err.code === 'ENOENT') {
                return res.status(200).json([]);
            }
            return res.status(500).json({ error: 'Failed to read pending students locally' });
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

        const fileData = await response.json();
        const decoded = Buffer.from(fileData.content, 'base64').toString('utf8');
        let students = JSON.parse(decoded || '[]');

        // Auto-cleanup: remove pending students older than 61 minutes
        const now = Date.now();
        const before = students.length;
        const cleaned = students.filter(item => {
            if (!item || !item.timestamp) return false;
            const itemTime = new Date(item.timestamp).getTime();
            if (isNaN(itemTime)) return false;
            return (now - itemTime) < TIMEOUT_MS;
        });

        // If we cleaned up expired entries, update the file on GitHub
        if (cleaned.length !== before && TOKEN) {
            try {
                const updateUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
                const updatedContent = Buffer.from(JSON.stringify(cleaned, null, 2)).toString('base64');

                await fetch(updateUrl, {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${TOKEN}`,
                        Accept: 'application/vnd.github+json',
                    },
                    body: JSON.stringify({
                        message: `chore: auto-cleanup ${before - cleaned.length} expired pending student(s)`,
                        content: updatedContent,
                        branch: BRANCH,
                        sha: fileData.sha,
                    }),
                });
                console.log(`Auto-cleaned ${before - cleaned.length} expired pending student(s)`);
            } catch (cleanupErr) {
                // Cleanup failed, but still return the filtered data
                console.warn('Auto-cleanup write failed:', cleanupErr.message);
            }
        }

        return res.status(200).json(cleaned);
    } catch (err) {
        console.error('Error fetching pending students:', err);
        return res.status(500).json({ error: 'Failed to fetch pending students' });
    }
}
