import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getVideos, getYouTubeId, getYouTubeEmbedSrc } from '../utils/videoStore'
import './ClassPlayerPage.css'

// Subject accent colors
const SUBJECT_ACCENT = {
    Physics: '#3b82f6',
    Chemistry: '#22c55e',
    Mathematics: '#8b5cf6',
    Biology: '#f97316',
}

// YouTube icon
function YouTubeIcon({ size = 16 }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
            <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42C1 8.14 1 11.72 1 11.72s0 3.59.46 5.3a2.78 2.78 0 0 0 1.96 1.96C5.12 19.44 12 19.44 12 19.44s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.96-1.96C23 15.31 23 11.72 23 11.72s0-3.58-.46-5.3z" />
            <polygon points="9.75 15.02 15.5 11.72 9.75 8.42 9.75 15.02" fill="white" />
        </svg>
    )
}

// Related video mini card
function RelatedCard({ video, isCurrent }) {
    const navigate = useNavigate()
    const accent = SUBJECT_ACCENT[video.subject] || '#3b82f6'

    return (
        <div
            className={`cp-related-card${isCurrent ? ' cp-related-current' : ''}`}
            onClick={() => !isCurrent && navigate(`/class/player/${video.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && !isCurrent && navigate(`/class/player/${video.id}`)}
        >
            {/* Thumbnail */}
            <div className="cp-rel-thumb"
                style={{ background: !video.thumbnailUrl ? `linear-gradient(135deg, ${accent}33 0%, ${accent}88 100%)` : undefined }}>
                {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt={video.title} />
                ) : (
                    <div className="cp-rel-thumb-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                )}
                {isCurrent && <div className="cp-rel-now-badge">▶ চলছে</div>}
            </div>

            {/* Info */}
            <div className="cp-rel-info">
                <p className="cp-rel-title bengali">{video.title}</p>
                <div className="cp-rel-meta">
                    <span className="cp-rel-platform" style={{ color: '#ef4444' }}>
                        <YouTubeIcon size={12} /> YouTube
                    </span>
                    <span className="cp-rel-subject">{video.subject}</span>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE: ClassPlayerPage — YouTube only
// ─────────────────────────────────────────────────────────────────────────────
function ClassPlayerPage() {
    const { id } = useParams()
    const navigate = useNavigate()

    // Read from localStorage (same source as ClassVideoPage)
    const allVideos = getVideos()
    const video = allVideos.find((v) => v.id === id)

    // Scroll to top on video change
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }, [id])

    // Video not found
    if (!video) {
        return (
            <div className="cp-notfound">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                    width="52" height="52" style={{ color: '#94a3b8' }}>
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                <p className="bengali">ভিডিও পাওয়া যায়নি</p>
                <button onClick={() => navigate('/class')}>← ক্লাসে ফিরুন</button>
            </div>
        )
    }

    const videoId = getYouTubeId(video.videoUrl)
    // ── YouTube embed src ────────────────────────────────────────────────────
    // Only YouTube is supported. getYouTubeEmbedSrc() returns:
    // https://www.youtube.com/embed/VIDEO_ID?autoplay=1&rel=0
    // ────────────────────────────────────────────────────────────────────────
    const embedSrc = videoId ? getYouTubeEmbedSrc(videoId) : null
    const accent = SUBJECT_ACCENT[video.subject] || '#3b82f6'

    return (
        <div className="cp-page">

            {/* ── Sticky top bar ── */}
            <header className="cp-topbar">
                <button className="cp-back-btn" onClick={() => navigate('/class')} aria-label="Back">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        width="20" height="20">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>
                <span className="cp-topbar-title bengali">ক্লাস ভিডিও</span>
                <a
                    href={video.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cp-topbar-open"
                    aria-label="Open on YouTube"
                    style={{ color: '#ef4444' }}
                >
                    <YouTubeIcon size={20} />
                </a>
            </header>

            {/* ── Video embed area ── */}
            <div className="cp-video-wrap">
                <div className="cp-video-container">
                    {embedSrc ? (
                        // ── YouTube embed iframe ─────────────────────────────────────
                        // src built by getYouTubeEmbedSrc() from videoStore.js
                        // Format: https://youtube.com/embed/VIDEO_ID?autoplay=1&rel=0
                        // ─────────────────────────────────────────────────────────────
                        <iframe
                            key={video.id}
                            className="cp-iframe"
                            src={embedSrc}
                            title={video.title}
                            frameBorder="0"
                            allowFullScreen={true}
                            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                        />
                    ) : (
                        <div className="cp-embed-error">
                            <p className="bengali">ভিডিও লোড হচ্ছে না। নিচের বাটনে ক্লিক করুন।</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Video info ── */}
            <div className="cp-info">
                <div className="cp-info-badges">
                    <span className="cp-badge cp-badge-lesson">ক্লাস {video.lesson}</span>
                    <span className="cp-badge" style={{ background: `${accent}18`, color: accent }}>
                        {video.subject}
                    </span>
                    <span className="cp-badge cp-badge-platform cp-badge-youtube">
                        <YouTubeIcon size={12} /> YouTube
                    </span>
                </div>

                <h1 className="cp-video-title bengali">{video.title}</h1>

                {/* Watch on YouTube */}
                <a
                    href={video.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cp-open-btn cp-open-youtube"
                >
                    <YouTubeIcon size={18} />
                    YouTube-এ দেখুন
                </a>
            </div>

            {/* ── All classes section ── */}
            {allVideos.length > 1 && (
                <>
                    <div className="cp-divider">
                        <span className="bengali">সকল ক্লাস</span>
                    </div>
                    <div className="cp-related">
                        {allVideos.sort((a, b) => a.lesson - b.lesson).map((v) => (
                            <RelatedCard key={v.id} video={v} isCurrent={v.id === id} />
                        ))}
                    </div>
                </>
            )}

            <div style={{ height: 32 }} />
        </div>
    )
}

export default ClassPlayerPage
