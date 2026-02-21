// ─────────────────────────────────────────────────────────────────────────────
// videoStore.js — localStorage-based video storage for GST Class Videos
// Used by: AdminPage (write) + ClassVideoPage / ClassPlayerPage (read)
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'gst_course_videos'

/** Return all saved videos (sorted by createdAt DESC) */
export function getVideos() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : []
    } catch {
        return []
    }
}

/** Overwrite entire list */
export function saveVideos(videos) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(videos))
}

/** Add one video to the list */
export function addVideo(video) {
    const existing = getVideos()
    saveVideos([...existing, video])
}

/** Delete a video by id */
export function deleteVideo(id) {
    saveVideos(getVideos().filter((v) => v.id !== id))
}

/** Extract YouTube video ID from any YouTube URL format */
export function getYouTubeId(url) {
    if (!url) return null
    const patterns = [
        /youtu\.be\/([^?&\s]+)/,
        /youtube\.com\/watch\?v=([^&\s]+)/,
        /youtube\.com\/embed\/([^?&\s]+)/,
        /youtube\.com\/shorts\/([^?&\s]+)/,
        /youtube\.com\/v\/([^?&\s]+)/,
    ]
    for (const p of patterns) {
        const m = url.match(p)
        if (m) return m[1]
    }
    return null
}

/** Build HD thumbnail URL from YouTube video ID */
export function getYouTubeThumbnail(videoId) {
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

/** Build embed src URL from YouTube video ID */
export function getYouTubeEmbedSrc(videoId) {
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`
}
