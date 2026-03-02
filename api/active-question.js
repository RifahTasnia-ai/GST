import { Buffer } from 'buffer'
import fs from 'fs/promises'
import path from 'path'

const OWNER = process.env.GITHUB_OWNER
const REPO = process.env.GITHUB_REPO
const BRANCH = process.env.GITHUB_BRANCH || 'main'
const TOKEN = process.env.GITHUB_TOKEN

function buildStudentNotice(type, fileName) {
    const now = new Date().toISOString()

    if (type === 'exam_change') {
        return {
            id: `exam_change_${Date.now()}`,
            type: 'exam_change',
            title: 'Exam Updated',
            message: `New exam set is now active (${fileName}). If you have not started, reload and start again.`,
            createdAt: now
        }
    }

    return {
        id: `notice_${Date.now()}`,
        type: 'notice',
        title: 'Update',
        message: `Please check latest exam update (${fileName}).`,
        createdAt: now
    }
}

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
            const activeFile = config?.activeQuestionFile || 'questions.json'
            return res.status(200).json({
                activeFile,
                setAt: config?.lastUpdated || null,
                isDefault: activeFile === 'questions.json',
                studentNotice: config?.studentNotice || null
            })
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

            const now = new Date().toISOString()
            const studentNotice = buildStudentNotice('exam_change', fileName)
            let existingConfig = {}
            let sha = null

            if (!isDev) {
                if (!OWNER || !REPO || !TOKEN) return res.status(500).json({ error: 'Missing config' })
                const getFileUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/exam-config.json`
                const getResponse = await fetch(getFileUrl, { headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.github.v3+json' } })
                if (getResponse.ok) {
                    const existingFile = await getResponse.json()
                    sha = existingFile.sha
                    try {
                        const decoded = Buffer.from(existingFile.content, 'base64').toString('utf8')
                        existingConfig = JSON.parse(decoded)
                    } catch {
                        existingConfig = {}
                    }
                }
                const config = {
                    ...existingConfig,
                    activeQuestionFile: fileName,
                    lastUpdated: now,
                    studentNotice
                }
                const content = Buffer.from(JSON.stringify(config, null, 2)).toString('base64')
                const updateResponse = await fetch(getFileUrl, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: `Update active question file to ${fileName}`, content, sha, branch: BRANCH })
                })
                if (!updateResponse.ok) throw new Error(`GitHub API error`)
            } else {
                const configPath = path.join(process.cwd(), 'exam-config.json')
                try {
                    const current = await fs.readFile(configPath, 'utf-8')
                    existingConfig = JSON.parse(current)
                } catch {
                    existingConfig = {}
                }
                const config = {
                    ...existingConfig,
                    activeQuestionFile: fileName,
                    lastUpdated: now,
                    studentNotice
                }
                await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
            }

            return res.status(200).json({
                success: true,
                activeFile: fileName,
                message: 'Updated successfully',
                studentNotice
            })
        } catch (error) {
            return res.status(500).json({ error: 'Failed' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
