import { useState, useEffect } from 'react'
import { getVideos, addVideo, deleteVideo, getYouTubeId, getYouTubeThumbnail } from '../../utils/videoStore'
import './VideoManageModal.css'

const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology']

const EMPTY_FORM = {
    title: '',
    youtubeUrl: '',
    subject: 'Physics',
    lesson: '',
}

// YouTube icon
function YouTubeIcon({ size = 18 }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
            <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42C1 8.14 1 11.72 1 11.72s0 3.59.46 5.3a2.78 2.78 0 0 0 1.96 1.96C5.12 19.44 12 19.44 12 19.44s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.96-1.96C23 15.31 23 11.72 23 11.72s0-3.58-.46-5.3z" />
            <polygon points="9.75 15.02 15.5 11.72 9.75 8.42 9.75 15.02" fill="white" />
        </svg>
    )
}

export default function VideoManageModal({ onClose }) {
    const [form, setForm] = useState(EMPTY_FORM)
    const [errors, setErrors] = useState({})
    const [videos, setVideos] = useState([])
    const [saved, setSaved] = useState(false)

    // Load saved videos on mount
    useEffect(() => {
        setVideos(getVideos())
        // Auto-set next lesson number
        const existing = getVideos()
        setForm(f => ({ ...f, lesson: String(existing.length + 1) }))
    }, [])

    // Detect YouTube ID from URL for live preview
    const youtubeId = getYouTubeId(form.youtubeUrl)
    const thumbUrl = youtubeId ? getYouTubeThumbnail(youtubeId) : null

    const handleChange = (field, value) => {
        setForm(f => ({ ...f, [field]: value }))
        if (errors[field]) setErrors(e => ({ ...e, [field]: null }))
    }

    const validate = () => {
        const e = {}
        if (!form.title.trim()) e.title = 'Title is required'
        if (!youtubeId) e.youtubeUrl = 'Enter a valid YouTube URL (youtube.com/watch?v=... or youtu.be/...)'
        if (!form.lesson || isNaN(Number(form.lesson)) || Number(form.lesson) < 1) {
            e.lesson = 'Enter a valid lesson number'
        }
        setErrors(e)
        return Object.keys(e).length === 0
    }

    const handleSave = () => {
        if (!validate()) return

        const newVideo = {
            id: `vid_${Date.now()}`,
            lesson: Number(form.lesson),
            title: form.title.trim(),
            subject: form.subject,
            platform: 'youtube',
            videoUrl: form.youtubeUrl.trim(),
            createdAt: new Date().toISOString(),
            thumbnailUrl: thumbUrl,
        }

        addVideo(newVideo)
        const updated = getVideos()
        setVideos(updated)

        // Reset form with next lesson number auto-filled
        setForm({ ...EMPTY_FORM, subject: form.subject, lesson: String(updated.length + 1) })
        setErrors({})

        // Show success flash
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
    }

    const handleDelete = (id) => {
        if (!window.confirm('Delete this video?')) return
        deleteVideo(id)
        const updated = getVideos()
        setVideos(updated)
        setForm(f => ({ ...f, lesson: String(updated.length + 1) }))
    }

    return (
        <div className="vm-overlay" onClick={onClose}>
            <div className="vm-modal" onClick={e => e.stopPropagation()}>

                {/* ── Header ──────────────────────────────────────── */}
                <div className="vm-header">
                    <div className="vm-header-left">
                        <div className="vm-header-icon">
                            <YouTubeIcon size={22} />
                        </div>
                        <div>
                            <h2>Video Management</h2>
                            <p>Add YouTube class videos for students</p>
                        </div>
                    </div>
                    <button className="vm-close" onClick={onClose} aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                            width="18" height="18">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* ── Scrollable Body ──────────────────────────────── */}
                <div className="vm-body">

                    {/* ── Add Video Form ──────────────────────────── */}
                    <div className="vm-form-section">
                        <div className="vm-form-section-title">➕ Add New Video</div>

                        {/* YouTube URL */}
                        <div className="vm-field">
                            <label className="vm-label">YouTube URL <span>*</span></label>
                            <input
                                className={`vm-input ${errors.youtubeUrl ? 'error' : ''}`}
                                type="url"
                                placeholder="https://www.youtube.com/watch?v=..."
                                value={form.youtubeUrl}
                                onChange={e => handleChange('youtubeUrl', e.target.value)}
                            />
                            {errors.youtubeUrl && <span className="vm-error-msg">{errors.youtubeUrl}</span>}

                            {/* Live thumbnail preview */}
                            <div className="vm-thumb-preview">
                                {thumbUrl ? (
                                    <>
                                        <img src={thumbUrl} alt="YouTube thumbnail preview" />
                                        <div className="vm-thumb-badge">
                                            <YouTubeIcon size={10} /> YouTube ✓
                                        </div>
                                    </>
                                ) : (
                                    <div className="vm-thumb-placeholder">
                                        <YouTubeIcon size={32} />
                                        <span>Thumbnail appears here after entering URL</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Title */}
                        <div className="vm-field">
                            <label className="vm-label">Video Title <span>*</span></label>
                            <input
                                className={`vm-input ${errors.title ? 'error' : ''}`}
                                type="text"
                                placeholder="e.g. পদার্থবিজ্ঞান — আলো ও তরঙ্গ"
                                value={form.title}
                                onChange={e => handleChange('title', e.target.value)}
                            />
                            {errors.title && <span className="vm-error-msg">{errors.title}</span>}
                        </div>

                        {/* Subject + Lesson row */}
                        <div className="vm-row">
                            <div className="vm-field">
                                <label className="vm-label">Subject <span>*</span></label>
                                <select
                                    className="vm-select"
                                    value={form.subject}
                                    onChange={e => handleChange('subject', e.target.value)}
                                >
                                    {SUBJECTS.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="vm-field">
                                <label className="vm-label">Lesson # <span>*</span></label>
                                <input
                                    className={`vm-input ${errors.lesson ? 'error' : ''}`}
                                    type="number"
                                    min="1"
                                    placeholder="1"
                                    value={form.lesson}
                                    onChange={e => handleChange('lesson', e.target.value)}
                                />
                                {errors.lesson && <span className="vm-error-msg">{errors.lesson}</span>}
                            </div>
                        </div>

                        {/* Success flash */}
                        {saved && (
                            <div className="vm-success-flash">
                                ✅ Video saved! It is now visible on the Class page.
                            </div>
                        )}

                        {/* Save button */}
                        <button
                            className="vm-save-btn"
                            onClick={handleSave}
                            disabled={!form.title || !form.youtubeUrl}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                width="18" height="18">
                                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                                <polyline points="17 21 17 13 7 13 7 21" />
                                <polyline points="7 3 7 8 15 8" />
                            </svg>
                            Save Video
                        </button>
                    </div>

                    {/* ── Saved Videos List ────────────────────────── */}
                    <div className="vm-list-section">
                        <div className="vm-list-header">
                            <span className="vm-list-title">Saved Videos</span>
                            <span className="vm-list-count">{videos.length} video{videos.length !== 1 ? 's' : ''}</span>
                        </div>

                        {videos.length === 0 ? (
                            <div className="vm-empty-list">
                                No videos yet. Add your first video above!
                            </div>
                        ) : (
                            // Sort by lesson number for display
                            [...videos].sort((a, b) => a.lesson - b.lesson).map(v => (
                                <div key={v.id} className="vm-video-item">
                                    <div className="vm-item-thumb">
                                        {v.thumbnailUrl && (
                                            <img src={v.thumbnailUrl} alt={v.title} />
                                        )}
                                    </div>
                                    <div className="vm-item-info">
                                        <div className="vm-item-title">{v.title}</div>
                                        <div className="vm-item-meta">
                                            <span className="vm-item-badge">
                                                <YouTubeIcon size={9} /> Class {v.lesson}
                                            </span>
                                            <span>{v.subject}</span>
                                        </div>
                                    </div>
                                    <button
                                        className="vm-delete-btn"
                                        onClick={() => handleDelete(v.id)}
                                        aria-label={`Delete ${v.title}`}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                            strokeWidth="2.5" width="16" height="16">
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6l-1 14H6L5 6" />
                                            <path d="M10 11v6M14 11v6" />
                                            <path d="M9 6V4h6v2" />
                                        </svg>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
