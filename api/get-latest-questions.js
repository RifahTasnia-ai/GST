export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const fs = require('fs')
        const path = require('path')

        // Get the public directory path
        const publicDir = path.join(process.cwd(), 'public')

        // Read all files in public directory
        const files = fs.readdirSync(publicDir)

        // Find all question files matching pattern: questions.json, questions-1.json, questions-2.json, etc.
        const questionFiles = files.filter(file =>
            file === 'questions.json' || /^questions-\d+\.json$/.test(file)
        )

        if (questionFiles.length === 0) {
            return res.status(404).json({ error: 'No question files found' })
        }

        // Extract version numbers and find the latest
        let latestFile = 'questions.json'
        let maxVersion = -1

        questionFiles.forEach(file => {
            if (file === 'questions.json') {
                if (maxVersion < 0) {
                    maxVersion = 0
                    latestFile = file
                }
            } else {
                const match = file.match(/^questions-(\d+)\.json$/)
                if (match) {
                    const version = parseInt(match[1])
                    if (version > maxVersion) {
                        maxVersion = version
                        latestFile = file
                    }
                }
            }
        })

        return res.status(200).json({
            file: latestFile,
            version: maxVersion
        })

    } catch (error) {
        console.error('Error finding latest questions:', error)
        return res.status(500).json({ error: 'Failed to find latest questions' })
    }
}
