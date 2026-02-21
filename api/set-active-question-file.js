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
    if (!Array.isArray(questions)) {
        throw new Error('Invalid question file format - must be an array')
    }
    if (questions.length === 0) {
        throw new Error('Question file is empty')
    }
}

async function validateQuestionFileRemote(fileName) {
    const fileUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/public/${encodeURIComponent(fileName)}`
    const fileResponse = await fetch(fileUrl, { cache: 'no-store' })
    if (!fileResponse.ok) {
        throw new Error('Question file not found')
    }
    const questions = await fileResponse.json()
    if (!Array.isArray(questions)) {
        throw new Error('Invalid question file format - must be an array')
    }
    if (questions.length === 0) {
        throw new Error('Question file is empty')
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const adminKey = process.env.ADMIN_API_KEY
    if (adminKey && req.headers['x-admin-key'] !== adminKey) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    try {
        const { fileName } = req.body

        // Validate input
        if (!fileName || typeof fileName !== 'string') {
            return res.status(400).json({ error: 'Invalid file name' })
        }

        // Validate file name is a JSON file
        if (!fileName.endsWith('.json')) {
            return res.status(400).json({ error: 'File must be a JSON file' })
        }

        const isDev = !process.env.VERCEL_ENV

        try {
            if (isDev) {
                await validateQuestionFileLocally(fileName)
            } else {
                await validateQuestionFileRemote(fileName)
            }
        } catch (parseError) {
            const message = parseError?.message || 'Invalid JSON file'
            if (message.includes('not found')) {
                return res.status(404).json({ error: message })
            }
            return res.status(400).json({ error: message })
        }

        // Create config object
        const config = {
            activeQuestionFile: fileName,
            lastUpdated: new Date().toISOString()
        }

        if (!isDev) {
            if (!OWNER || !REPO || !TOKEN) {
                return res.status(500).json({
                    error: 'Missing GitHub configuration',
                    required: ['GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_TOKEN']
                })
            }

            try {
                const getFileUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/exam-config.json`
                const getResponse = await fetch(getFileUrl, {
                    headers: {
                        'Authorization': `Bearer ${TOKEN}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                })

                let sha = null
                if (getResponse.ok) {
                    const fileData = await getResponse.json()
                    sha = fileData.sha
                }

                const content = Buffer.from(JSON.stringify(config, null, 2)).toString('base64')

                const updateResponse = await fetch(getFileUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${TOKEN}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `Update active question file to ${fileName}`,
                        content: content,
                        sha: sha,
                        branch: BRANCH
                    })
                })

                if (!updateResponse.ok) {
                    const errorData = await updateResponse.json()
                    throw new Error(`GitHub API error: ${errorData.message}`)
                }
            } catch (githubError) {
                console.error('GitHub update failed:', githubError)
                return res.status(500).json({
                    error: 'Failed to update config in GitHub',
                    details: githubError.message
                })
            }
        } else {
            const configPath = path.join(process.cwd(), 'exam-config.json')
            await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
        }

        return res.status(200).json({
            success: true,
            activeFile: fileName,
            message: 'Active question file updated successfully'
        })

    } catch (error) {
        console.error('Error setting active question file:', error)
        return res.status(500).json({
            error: 'Failed to set active question file',
            details: error.message
        })
    }
}
