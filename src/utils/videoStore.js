const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOSTS = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be',
    'www.youtu.be',
])

function parseUrl(input) {
    if (!input || typeof input !== 'string') return null
    const trimmed = input.trim()
    if (!trimmed) return null

    try {
        return new URL(trimmed)
    } catch {
        try {
            return new URL(`https://${trimmed}`)
        } catch {
            return null
        }
    }
}

function normalizeVideoId(videoId) {
    if (!videoId || typeof videoId !== 'string') return null
    const normalized = videoId.trim()
    return YOUTUBE_ID_PATTERN.test(normalized) ? normalized : null
}

function getErrorMessage(data, fallback) {
    if (data && typeof data.error === 'string') return data.error
    if (data && typeof data.details === 'string') return `${fallback}: ${data.details}`
    return fallback
}

/** Return all saved videos from the API */
export async function getVideos() {
    const res = await fetch('/api/videos')
    const data = await res.json().catch(() => null)

    if (!res.ok) {
        throw new Error(getErrorMessage(data, `Failed to load videos (${res.status})`))
    }

    if (!Array.isArray(data)) {
        throw new Error('Invalid videos response from server')
    }

    return data
}

/** Overwrite entire list */
export async function saveVideos(videos) {
    const res = await fetch('/api/save-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videos }),
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
        throw new Error(getErrorMessage(data, `Failed to save videos (${res.status})`))
    }
}

/** Add one video via server-side atomic update */
export async function addVideo(video) {
    const res = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video }),
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
        throw new Error(getErrorMessage(data, `Failed to add video (${res.status})`))
    }
}

/** Delete one video via server-side atomic update */
export async function deleteVideo(id) {
    const res = await fetch('/api/videos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
        throw new Error(getErrorMessage(data, `Failed to delete video (${res.status})`))
    }
}

/** Extract a valid YouTube video ID from a YouTube URL */
export function getYouTubeId(input) {
    const directId = normalizeVideoId(input)
    if (directId) return directId

    const parsed = parseUrl(input)
    if (!parsed) return null

    const host = parsed.hostname.toLowerCase()
    if (!YOUTUBE_HOSTS.has(host)) return null

    if (host.endsWith('youtu.be')) {
        const [firstPath] = parsed.pathname.split('/').filter(Boolean)
        return normalizeVideoId(firstPath)
    }

    const path = parsed.pathname

    if (path === '/watch') {
        return normalizeVideoId(parsed.searchParams.get('v'))
    }

    if (path.startsWith('/embed/')) {
        return normalizeVideoId(path.split('/')[2])
    }

    if (path.startsWith('/shorts/')) {
        return normalizeVideoId(path.split('/')[2])
    }

    if (path.startsWith('/v/')) {
        return normalizeVideoId(path.split('/')[2])
    }

    return null
}

/** Canonical YouTube watch URL */
export function getCanonicalYouTubeWatchUrl(videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`
}

/** Build HD thumbnail URL from YouTube video ID */
export function getYouTubeThumbnail(videoId) {
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

/** Build embed src URL from YouTube video ID */
export function getYouTubeEmbedSrc(videoId) {
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`
}
