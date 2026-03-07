import { removeLiveSession } from '../lib/runtimeStore.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { studentName } = req.body || {}
  if (!studentName) {
    return res.status(400).json({ error: 'studentName required' })
  }

  try {
    await removeLiveSession(studentName)
    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('remove-pending-student error:', error)
    return res.status(500).json({
      error: 'Failed to remove pending student',
      details: error.message,
    })
  }
}
