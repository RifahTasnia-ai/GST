import { Buffer } from 'buffer'
import fs from 'fs/promises'
import path from 'path'

const OWNER = process.env.GITHUB_OWNER
const REPO = process.env.GITHUB_REPO
const BRANCH = process.env.GITHUB_BRANCH || 'main'
const TOKEN = process.env.GITHUB_TOKEN

async function validateQuestionFileLocally(fileName) {
    const filePath = path.join(process.cwd(), 'public', fileName)
    const content = await fs.readFile(filePath, 'utf-8')
    const questions = JSON.parse(content)
    if (!Array.isArray(questions)) throw new Error('Invalid format')
    if (questions.length === 0) throw new Error('File empty')
}

async function validateQuestionFileRemote(fileName) {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/public/${encodeURIComponent(fileName)}?ref=${BRANCH}`;
    const headers = { Accept: 'application/vnd.github+json' };
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
    const fileResponse = await fetch(url, { headers, cache: 'no-store' })
    if (!fileResponse.ok) throw new Error(`Not found (${fileResponse.status})`)
    const data = await fileResponse.json();
    const decoded = Buffer.from(data.content, 'base64').toString('utf8');
    const questions = JSON.parse(decoded);
    if (!Array.isArray(questions)) throw new Error('Invalid format')
    if (questions.length === 0) throw new Error('File empty')
}

export default async function handler(req, res) {
    const isDev = !process.env.GITHUB_TOKEN;

    if (req.method === 'GET') {
        try {
            let config;
            if (isDev) {
                try {
                    const configPath = path.join(process.cwd(), 'exam-config.json');
                    const content = await fs.readFile(configPath, 'utf-8');
                    config = JSON.parse(content);
                } catch (err) {
                    return res.status(200).json({ activeFile: 'questions.json', setAt: null, isDefault: true })
                }
            } else {
                if (!OWNER || !REPO) return res.status(500).json({ error: 'Missing GitHub configuration' })
                try {
                    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/exam-config.json?ref=${BRANCH}`;
                    const headers = { Accept: 'application/vnd.github+json' };
                    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
                    const response = await fetch(url, { headers, cache: 'no-store' });
                    if (!response.ok) {
                        return res.status(200).json({ activeFile: 'questions.json', setAt: null, isDefault: true })
                    }
                    const data = await response.json();
                    const decoded = Buffer.from(data.content, 'base64').toString('utf8');
                    config = JSON.parse(decoded);
                } catch (fetchError) {
                    return res.status(200).json({ activeFile: 'questions.json', setAt: null, isDefault: true })
                }
            }
            return res.status(200).json({ activeFile: config.activeQuestionFile, setAt: config.lastUpdated, isDefault: false })
        } catch (error) {
            return res.status(200).json({ activeFile: 'questions.json', setAt: null, isDefault: true, error: 'Failed' })
        }
    }

    if (req.method === 'POST') {
        const adminKey = process.env.ADMIN_API_KEY
        if (adminKey && req.headers['x-admin-key'] !== adminKey) {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        try {
            const { fileName } = req.body
            if (!fileName || typeof fileName !== 'string' || !fileName.endsWith('.json')) {
                return res.status(400).json({ error: 'Invalid JSON file name' })
            }

            try {
                if (isDev) await validateQuestionFileLocally(fileName)
                else await validateQuestionFileRemote(fileName)
            } catch (parseError) {
                return res.status(400).json({ error: parseError?.message || 'Invalid JSON file' })
            }

            const config = { activeQuestionFile: fileName, lastUpdated: new Date().toISOString() }

            if (!isDev) {
                if (!OWNER || !REPO || !TOKEN) return res.status(500).json({ error: 'Missing config' })
                const getFileUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/exam-config.json`
                const getResponse = await fetch(getFileUrl, { headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.github.v3+json' } })
                let sha = null
                if (getResponse.ok) sha = (await getResponse.json()).sha
                const content = Buffer.from(JSON.stringify(config, null, 2)).toString('base64')
                const updateResponse = await fetch(getFileUrl, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: `Update active question file to ${fileName}`, content, sha, branch: BRANCH })
                })
                if (!updateResponse.ok) throw new Error(`GitHub API error`)
            } else {
                const configPath = path.join(process.cwd(), 'exam-config.json')
                await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
            }

            return res.status(200).json({ success: true, activeFile: fileName, message: 'Updated successfully' })
        } catch (error) {
            return res.status(500).json({ error: 'Failed' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
