import fs from 'fs'
import path from 'path'

function toDisplayName(fileName) {
  const nameWithoutExt = fileName.replace('.json', '')

  if (/^questions-\d+/.test(nameWithoutExt)) {
    const match = nameWithoutExt.match(/^questions-(\d+)/)
    return `Question Set ${match[1]}`
  }

  if (/^questions-/.test(nameWithoutExt)) {
    const version = nameWithoutExt.replace('questions-', '')
    return `${version.charAt(0).toUpperCase()}${version.slice(1)} Question Set`
  }

  return nameWithoutExt
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const publicDir = path.join(process.cwd(), 'public')
    const files = fs.readdirSync(publicDir).map((name) => {
      const fullPath = path.join(publicDir, name)
      return {
        name,
        type: fs.statSync(fullPath).isFile() ? 'file' : 'dir',
        size: fs.statSync(fullPath).size,
      }
    })

    const excludeFiles = new Set([
      'manifest.json',
      'question-files.json',
      'vercel.json',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'jsconfig.json',
      'next.config.js',
    ])

    const fileList = files
      .filter((file) => file.type === 'file' && file.name.toLowerCase().endsWith('.json') && !excludeFiles.has(file.name))
      .map((file) => ({
        name: file.name,
        displayName: toDisplayName(file.name),
        size: file.size,
        lastModified: new Date().toISOString(),
      }))

    fileList.sort((a, b) => {
      if (a.name === 'questions.json') return -1
      if (b.name === 'questions.json') return 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })

    return res.status(200).json({ files: fileList })
  } catch (error) {
    console.error('list-question-files error:', error)
    return res.status(500).json({
      error: 'Failed to list question files',
      details: error.message,
    })
  }
}
