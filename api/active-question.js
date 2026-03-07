import fs from 'fs/promises'
import path from 'path'
import { getExamConfig, setExamConfig } from '../lib/runtimeStore.js'

function buildStudentNotice(fileName) {
  const now = new Date().toISOString()
  return {
    id: `exam_change_${Date.now()}`,
    type: 'exam_change',
    title: 'Exam Updated',
    message: `New exam set is now active (${fileName}). If you have not started, reload and start again.`,
    createdAt: now,
  }
}

function appendQuestionSetHistory(history, fileName, activatedAt) {
  const safeHistory = Array.isArray(history) ? history : []
  const lastEntry = safeHistory[safeHistory.length - 1]

  if (lastEntry?.fileName === fileName) {
    return safeHistory
  }

  return [
    ...safeHistory,
    {
      fileName,
      activatedAt,
    },
  ]
}

async function validateQuestionFile(fileName) {
  const filePath = path.join(process.cwd(), 'public', fileName)
  const content = await fs.readFile(filePath, 'utf-8')
  const questions = JSON.parse(content)
  if (!Array.isArray(questions)) throw new Error('Invalid format')
  if (questions.length === 0) throw new Error('File empty')
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const config = await getExamConfig()
      const activeFile = config?.activeQuestionFile || 'questions.json'
      return res.status(200).json({
        activeFile,
        setAt: config?.lastUpdated || null,
        isDefault: activeFile === 'questions.json',
        studentNotice: config?.studentNotice || null,
        questionSetHistory: Array.isArray(config?.questionSetHistory) ? config.questionSetHistory : [],
      })
    } catch (error) {
      console.error('active-question GET error:', error)
      return res.status(200).json({
        activeFile: 'questions.json',
        setAt: null,
        isDefault: true,
        questionSetHistory: [],
      })
    }
  }

  if (req.method === 'POST') {
    const adminKey = process.env.ADMIN_API_KEY
    if (adminKey && req.headers['x-admin-key'] !== adminKey) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    try {
      const { fileName } = req.body || {}
      if (!fileName || typeof fileName !== 'string' || !fileName.endsWith('.json')) {
        return res.status(400).json({ error: 'Invalid JSON file name' })
      }

      await validateQuestionFile(fileName)

      const now = new Date().toISOString()
      const studentNotice = buildStudentNotice(fileName)
      const currentConfig = await getExamConfig()
      const questionSetHistory = appendQuestionSetHistory(currentConfig?.questionSetHistory, fileName, now)

      await setExamConfig({
        activeQuestionFile: fileName,
        lastUpdated: now,
        studentNotice,
        questionSetHistory,
      })

      return res.status(200).json({
        success: true,
        activeFile: fileName,
        message: 'Updated successfully',
        studentNotice,
        questionSetHistory,
      })
    } catch (error) {
      console.error('active-question POST error:', error)
      return res.status(500).json({
        error: error.message || 'Failed',
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
