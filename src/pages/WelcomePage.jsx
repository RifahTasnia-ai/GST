import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './WelcomePage.css'

function WelcomePage() {
    const navigate = useNavigate()
    const [showNotesPopup, setShowNotesPopup] = useState(false)

    function navigateToSection(path) {
        if (path) {
            navigate(path)
        }
    }

    return (
        <div className="welcome-page-container">
            <div className="welcome-page-content">
                <div className="welcome-page-header">
                    <div className="welcome-logo-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                    </div>
                    <h1 className="bengali gradient-text">স্বাগতম!</h1>
                    <p className="bengali subtitle">GST প্রস্তুতি শুরু করতে আপনার পছন্দ নির্বাচন করুন</p>
                </div>

                <div className="welcome-options-grid">
                    {/* Option 1: MCQs */}
                    <button className="welcome-option-card mcq-card" onClick={() => navigateToSection('/mcq')}>
                        <div className="option-icon-wrapper">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 11l3 3L22 4" />
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                            </svg>
                        </div>
                        <h2 className="bengali">এমসিকিউ</h2>
                        <span className="bengali option-desc">পরীক্ষা দিন</span>
                    </button>

                    {/* Option 2: Class */}
                    <button className="welcome-option-card class-card" onClick={() => navigateToSection('/class')}>
                        <div className="option-icon-wrapper">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                                <polygon points="10 8 16 10 10 12 10 8" />
                                <path d="M8 21h8" />
                                <path d="M12 17v4" />
                            </svg>
                        </div>
                        <h2 className="bengali">ক্লাস</h2>
                        <span className="bengali option-desc">ভিডিও দেখুন</span>
                    </button>

                    {/* Option 3: Notes */}
                    <button className="welcome-option-card notes-card" onClick={() => setShowNotesPopup(true)}>
                        <div className="option-icon-wrapper">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                            </svg>
                        </div>
                        <h2 className="bengali">নোটস</h2>
                        <span className="bengali option-desc">পড়াশোনা করুন</span>
                    </button>
                </div>

                {/* Notes "coming soon" popup */}
                {showNotesPopup && (
                    <div className="notes-popup-overlay" onClick={() => setShowNotesPopup(false)}>
                        <div className="notes-popup" onClick={e => e.stopPropagation()}>
                            <div className="notes-popup-icon">🔄</div>
                            <h3 className="bengali">আপডেট চলছে...</h3>
                            <p className="bengali">নোটস বিভাগটি শীঘ্রই আসছে।<br />একটু অপেক্ষা করুন!</p>
                            <button className="notes-popup-close bengali" onClick={() => setShowNotesPopup(false)}>ঠিক আছে</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default WelcomePage
