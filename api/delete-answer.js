import { deleteSubmission } from '../lib/runtimeStore.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { studentName, timestamp } = req.body || {}
  if (!studentName || !timestamp) {
    return res.status(400).json({ error: 'studentName and timestamp required' })
  }

  try {
    const removed = await deleteSubmission(studentName, timestamp)
    if (!removed) {
      return res.status(404).json({ error: 'Submission not found' })
    }
    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('delete-answer error:', error)
    return res.status(500).json({
      error: 'Failed to delete answer',
      details: error.message,
    })
  }
}
