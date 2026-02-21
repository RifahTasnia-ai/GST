import { useState, useEffect } from 'react'
import { loadQuestionFiles, getActiveQuestionFile, setActiveQuestionFile } from '../../utils/api'
import './QuestionSetModal.css'

function QuestionSetModal({ isOpen, onClose, onSave }) {
    const [questionFiles, setQuestionFiles] = useState([])
    const [activeFile, setActiveFile] = useState(null)
    const [selectedFile, setSelectedFile] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [saving, setSaving] = useState(false)

    const [searchQuery, setSearchQuery] = useState('')
    const [activeSubject, setActiveSubject] = useState('all')

    useEffect(() => {
        if (isOpen) {
            loadData()
            setSearchQuery('')
            setActiveSubject('all')
        }
    }, [isOpen])

    async function loadData() {
        try {
            setLoading(true)
            setError(null)

            const [files, activeConfig] = await Promise.all([
                loadQuestionFiles(),
                getActiveQuestionFile()
            ])

            setQuestionFiles(files)
            setActiveFile(activeConfig.activeFile)
            setSelectedFile(activeConfig.activeFile)
        } catch (err) {
            console.error('Failed to load question files:', err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        if (!selectedFile) {
            setError('অনুগ্রহ করে একটি প্রশ্ন সেট নির্বাচন করুন')
            return
        }

        try {
            setSaving(true)
            setError(null)

            await setActiveQuestionFile(selectedFile)

            // Call parent callback
            if (onSave) {
                onSave(selectedFile)
            }

            // Close modal after short delay
            setTimeout(() => {
                onClose()
            }, 500)
        } catch (err) {
            console.error('Failed to save selection:', err)
            setError(err.message)
            setSaving(false)
        }
    }

    function handleCardClick(fileName) {
        setSelectedFile(fileName)
    }

    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            onClose()
        }
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }

    function formatDate(dateString) {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        })
    }

    // Filter logic
    const filteredFiles = questionFiles.filter(file => {
        const name = file.name.toLowerCase()
        const displayName = file.displayName.toLowerCase()
        const query = searchQuery.toLowerCase()

        // Search filter
        const matchesSearch = name.includes(query) || displayName.includes(query)

        // Subject filter
        let matchesSubject = true
        if (activeSubject !== 'all') {
            if (activeSubject === 'math') {
                matchesSubject = name.includes('math') || displayName.includes('math') || displayName.includes('গণিত')
            } else {
                matchesSubject = name.includes(activeSubject) || displayName.includes(activeSubject)
            }
        }

        return matchesSearch && matchesSubject
    })

    if (!isOpen) return null

    return (
        <div className="modal-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
            <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="bengali">প্রশ্ন সেট সেটিংস</h2>
                    <button className="close-button" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>

                <div className="modal-body">
                    {error && (
                        <div className="error-message">
                            <span>⚠️</span> {error}
                        </div>
                    )}

                    <div className="filter-section">
                        <div className="search-container">
                            <span className="search-icon">🔍</span>
                            <input
                                type="text"
                                className="search-input bengali"
                                placeholder="নাম বা আইডি দিয়ে খুঁজুন..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="filter-buttons">
                            <button
                                className={`filter-btn bengali ${activeSubject === 'all' ? 'active' : ''}`}
                                onClick={() => setActiveSubject('all')}
                            >
                                সব
                            </button>
                            <button
                                className={`filter-btn bengali ${activeSubject === 'biology' ? 'active' : ''}`}
                                onClick={() => setActiveSubject('biology')}
                            >
                                জীববিজ্ঞান
                            </button>
                            <button
                                className={`filter-btn bengali ${activeSubject === 'chemistry' ? 'active' : ''}`}
                                onClick={() => setActiveSubject('chemistry')}
                            >
                                রসায়ন
                            </button>
                            <button
                                className={`filter-btn bengali ${activeSubject === 'physics' ? 'active' : ''}`}
                                onClick={() => setActiveSubject('physics')}
                            >
                                পদার্থবিজ্ঞান
                            </button>
                            <button
                                className={`filter-btn bengali ${activeSubject === 'math' ? 'active' : ''}`}
                                onClick={() => setActiveSubject('math')}
                            >
                                গণিত
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p className="bengali">লোড হচ্ছে...</p>
                        </div>
                    ) : filteredFiles.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">📭</div>
                            <h3 className="bengali">কোন প্রশ্ন সেট পাওয়া যায়নি</h3>
                            <p>আপনার সার্চ ফিল্টার পরিবর্তন করুন</p>
                        </div>
                    ) : (
                        <div className="question-sets-grid">
                            {filteredFiles.map((file) => {
                                const isActive = file.name === activeFile
                                const isSelected = file.name === selectedFile

                                return (
                                    <div
                                        key={file.name}
                                        className={`question-set-card ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                                        onClick={() => handleCardClick(file.name)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault()
                                                handleCardClick(file.name)
                                            }
                                        }}
                                    >
                                        <input
                                            type="radio"
                                            name="questionSet"
                                            value={file.name}
                                            checked={isSelected}
                                            onChange={() => handleCardClick(file.name)}
                                            aria-label={file.displayName}
                                        />
                                        <div className="card-content">
                                            <div className="card-icon">📄</div>
                                            <div className="card-details">
                                                <h3 className="card-title">{file.displayName}</h3>
                                                <div className="card-meta">
                                                    <span className="file-size">{formatFileSize(file.size)}</span>
                                                    <span className="file-date">{formatDate(file.lastModified)}</span>
                                                </div>
                                            </div>
                                            {isActive && (
                                                <span className="active-badge bengali">সক্রিয়</span>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button
                        className="cancel-button bengali"
                        onClick={onClose}
                        disabled={saving}
                    >
                        বাতিল
                    </button>
                    <button
                        className="save-button bengali"
                        onClick={handleSave}
                        disabled={loading || saving || !selectedFile}
                    >
                        {saving ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default QuestionSetModal
