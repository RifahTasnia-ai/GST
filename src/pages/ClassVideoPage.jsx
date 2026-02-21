import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getVideos } from '../utils/videoStore'
import './ClassVideoPage.css'

// ─────────────────────────────────────────────────────────────────────────────
// SUBJECTS filter list
// ─────────────────────────────────────────────────────────────────────────────
const SUBJECTS = ['All', 'Physics', 'Chemistry', 'Mathematics', 'Biology']

// Subject gradient colors for placeholder thumbnails
const SUBJECT_COLORS = {
    Physics: { bg: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)' },
    Chemistry: { bg: 'linear-gradient(135deg, #14532d 0%, #16a34a 100%)' },
    Mathematics: { bg: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)' },
    Biology: { bg: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 100%)' },
}

// Skeleton row
function SkeletonRow() {
    return (
        <div className="cv-row-skeleton">
            <div className="cv-sk cv-sk-thumb" />
            <div className="cv-sk-body">
                <div className="cv-sk cv-sk-title" />
                <div className="cv-sk cv-sk-title cv-sk-short" />
                <div className="cv-sk cv-sk-meta" />
            </div>
        </div>
    )
}

// YouTube platform badge icon
function YouTubeIcon({ size = 12 }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
            <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42C1 8.14 1 11.72 1 11.72s0 3.59.46 5.3a2.78 2.78 0 0 0 1.96 1.96C5.12 19.44 12 19.44 12 19.44s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.96-1.96C23 15.31 23 11.72 23 11.72s0-3.58-.46-5.3z" />
            <polygon points="9.75 15.02 15.5 11.72 9.75 8.42 9.75 15.02" fill="white" />
        </svg>
    )
}

// Individual Video Row Card
function VideoRow({ video, onWatch }) {
    const colors = SUBJECT_COLORS[video.subject] || SUBJECT_COLORS.Physics

    return (
        <div className="cv-row" onClick={() => onWatch(video)} role="button" tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onWatch(video)}
            aria-label={`Play lesson ${video.lesson}: ${video.title}`}>

            {/* Thumbnail */}
            <div className="cv-row-thumb"
                style={{ background: !video.thumbnailUrl ? colors.bg : undefined }}>
                {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt={video.title} />
                ) : (
                    <div className="cv-row-thumb-inner">
                        <svg className="cv-row-play-icon" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                )}
                {/* Platform badge */}
                <span className="cv-platform-badge cv-platform-youtube">
                    <YouTubeIcon size={12} />
                </span>
            </div>

            {/* Info */}
            <div className="cv-row-info">
                <span className="cv-row-lesson-num">ক্লাস {video.lesson}</span>
                <p className="cv-row-title bengali">{video.title}</p>
                <div className="cv-row-meta">
                    <span className="cv-row-subject">{video.subject}</span>
                </div>
            </div>

            <div className="cv-row-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    width="18" height="18">
                    <path d="M9 18l6-6-6-6" />
                </svg>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE: ClassVideoPage
// ─────────────────────────────────────────────────────────────────────────────
function ClassVideoPage() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [videos, setVideos] = useState([])
    const [activeSubject, setActiveSubject] = useState('All')
    const [searchQuery, setSearchQuery] = useState('')
    const [searchOpen, setSearchOpen] = useState(false)

    // Load from localStorage
    useEffect(() => {
        const t = setTimeout(() => {
            setVideos(getVideos())
            setLoading(false)
        }, 700)
        return () => clearTimeout(t)
    }, [])

    const handleWatch = (video) => navigate(`/class/player/${video.id}`)

    const handleChip = (chip) => {
        setActiveSubject(chip)
        setSearchQuery('')
    }

    // Filter + sort newest first
    const filtered = videos
        .slice()
        .sort((a, b) => a.lesson - b.lesson)
        .filter((v) => activeSubject === 'All' || v.subject === activeSubject)
        .filter((v) => !searchQuery || v.title.toLowerCase().includes(searchQuery.toLowerCase()))

    return (
        <div className="cv-page">

            {/* ── Hero Header ── */}
            <header className="cv-hero">
                <div className="cv-hero-top">
                    <button className="cv-hero-back" onClick={() => navigate('/')} aria-label="Go back">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                            width="20" height="20">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <span className="cv-hero-brand">GST EXAM</span>
                    <button className="cv-hero-search-btn"
                        onClick={() => setSearchOpen(o => !o)}
                        aria-label="Search">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                            width="20" height="20">
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                        </svg>
                    </button>
                </div>

                <div className="cv-hero-body">
                    <h1 className="cv-hero-title bengali">ক্লাস ভিডিও</h1>
                    <p className="cv-hero-sub bengali">
                        {loading ? '...' : `${videos.length}টি ক্লাস • GST প্রস্তুতি`}
                    </p>
                </div>

                {searchOpen && (
                    <div className="cv-search-wrap">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            width="16" height="16" className="cv-search-icon-inner">
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                        </svg>
                        <input
                            className="cv-search-input"
                            type="search"
                            placeholder="ভিডিও খুঁজুন..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                        {searchQuery && (
                            <button className="cv-search-clear" onClick={() => setSearchQuery('')}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    strokeWidth="2.5" width="14" height="14">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                )}
            </header>

            {/* ── Filter Chips ── */}
            <div className="cv-chips-outer">
                <div className="cv-chips-scroll">
                    {SUBJECTS.map((s) => (
                        <button key={s}
                            className={`cv-chip${activeSubject === s ? ' cv-chip-active' : ''}`}
                            onClick={() => handleChip(s)}>
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Video List ── */}
            <main className="cv-list">
                {loading ? (
                    <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
                ) : filtered.length === 0 ? (
                    <div className="cv-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                            width="52" height="52">
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                        <p className="bengali">
                            {videos.length === 0
                                ? 'এখনো কোনো ক্লাস যোগ করা হয়নি'
                                : 'কোনো ভিডিও পাওয়া যায়নি'}
                        </p>
                        {videos.length === 0 && (
                            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: -4 }}>
                                Admin panel থেকে ভিডিও যোগ করুন
                            </p>
                        )}
                    </div>
                ) : (
                    filtered.map((video) => (
                        <VideoRow key={video.id} video={video} onWatch={handleWatch} />
                    ))
                )}
            </main>
        </div>
    )
}

export default ClassVideoPage
