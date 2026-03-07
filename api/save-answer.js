import { saveSubmission } from '../lib/runtimeStore.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = req.body || {}
  if (!body.studentName) {
    return res.status(400).json({ error: 'studentName required' })
  }

  try {
    const saved = await saveSubmission(body)
    return res.status(200).json({
      success: true,
      savedName: saved.studentName,
      wasRenamed: false,
    })
  } catch (error) {
    console.error('save-answer error:', error)
    return res.status(500).json({
      error: 'Failed to save answer',
      details: error.message,
    })
  }
}
