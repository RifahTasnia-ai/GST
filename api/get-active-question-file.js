import { Buffer } from "buffer";

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const isDev = !process.env.VERCEL_ENV

        let config;

        if (isDev) {
            // Local development - read from filesystem
            try {
                const fs = await import('fs');
                const path = await import('path');
                const configPath = path.default.join(process.cwd(), 'exam-config.json');
                const content = fs.default.readFileSync(configPath, 'utf-8');
                config = JSON.parse(content);
            } catch (err) {
                return res.status(200).json({
                    activeFile: 'questions.json',
                    setAt: null,
                    isDefault: true
                })
            }
        } else {
            if (!OWNER || !REPO) {
                return res.status(500).json({
                    error: 'Missing GitHub configuration',
                    required: ['GITHUB_OWNER', 'GITHUB_REPO']
                })
            }

            // On Vercel - use GitHub Contents API (instant, no cache!)
            try {
                const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/exam-config.json?ref=${BRANCH}`;
                const headers = {
                    Accept: 'application/vnd.github+json',
                };
                if (TOKEN) {
                    headers.Authorization = `Bearer ${TOKEN}`;
                }

                const response = await fetch(url, { headers, cache: 'no-store' });

                if (!response.ok) {
                    return res.status(200).json({
                        activeFile: 'questions.json',
                        setAt: null,
                        isDefault: true
                    })
                }

                const data = await response.json();
                const decoded = Buffer.from(data.content, 'base64').toString('utf8');
                config = JSON.parse(decoded);
            } catch (fetchError) {
                console.warn('Config fetch error:', fetchError)
                return res.status(200).json({
                    activeFile: 'questions.json',
                    setAt: null,
                    isDefault: true
                })
            }
        }

        return res.status(200).json({
            activeFile: config.activeQuestionFile,
            setAt: config.lastUpdated,
            isDefault: false
        })

    } catch (error) {
        console.error('Error getting active question file:', error)

        return res.status(200).json({
            activeFile: 'questions.json',
            setAt: null,
            isDefault: true,
            error: 'Failed to read config, using default'
        })
    }
}
