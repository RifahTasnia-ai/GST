import { deleteStudentSubmissions } from '../lib/runtimeStore.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { studentName } = req.body || {}
  if (!studentName) {
    return res.status(400).json({ error: 'studentName required' })
  }

  try {
    const removed = await deleteStudentSubmissions(studentName)
    if (!removed) {
      return res.status(404).json({ error: 'Student not found' })
    }
    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('delete-student error:', error)
    return res.status(500).json({
      error: 'Failed to delete student submissions',
      details: error.message,
    })
  }
}
