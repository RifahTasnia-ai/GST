import { upsertLiveSession } from '../lib/runtimeStore.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = req.body || {}
  if (!body.studentName) {
    return res.status(400).json({ error: 'studentName required' })
  }

  try {
    const result = await upsertLiveSession(body)
    return res.status(200).json(result)
  } catch (error) {
    console.error('save-pending-student error:', error)
    return res.status(500).json({
      error: 'Failed to save pending student',
      details: error.message,
    })
  }
}
