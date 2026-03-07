import { listSubmissions } from '../lib/runtimeStore.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const answers = await listSubmissions()
    return res.status(200).json(answers)
  } catch (error) {
    console.error('get-answers error:', error)
    return res.status(500).json({
      error: 'Failed to fetch answers',
      details: error.message,
    })
  }
}
