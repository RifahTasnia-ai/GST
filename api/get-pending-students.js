import { listLiveSessions } from '../lib/runtimeStore.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const sessions = await listLiveSessions()
    return res.status(200).json(sessions)
  } catch (error) {
    console.error('get-pending-students error:', error)
    return res.status(500).json({
      error: 'Failed to fetch pending students',
      details: error.message,
    })
  }
}
