import { useEffect, useMemo, useState } from 'react'
import { getActiveQuestionFile, loadQuestionFiles, setActiveQuestionFile } from '../../utils/api'
import './QuestionSetModal.css'

function sortByDisplayName(a, b) {
  return a.displayName.localeCompare(b.displayName, undefined, { numeric: true, sensitivity: 'base' })
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateString) {
  if (!dateString) return 'Unknown'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getSubjectMatch(activeSubject, file) {
  if (activeSubject === 'all') return true

  const name = file.name.toLowerCase()
  const displayName = file.displayName.toLowerCase()

  if (activeSubject === 'math') {
    return name.includes('math') || displayName.includes('math') || displayName.includes('গণিত')
  }

  return name.includes(activeSubject) || displayName.includes(activeSubject)
}

function badgeForFile(file, hasUnsavedSelection) {
  if (file.isActive) {
    return { label: 'চলমান', className: 'active-badge' }
  }

  if (file.isSelected && hasUnsavedSelection) {
    return { label: 'নির্বাচিত', className: 'selected-badge' }
  }

  return null
}

function archiveBadgeForFile(file, hasUnsavedSelection) {
  if (file.isSelected && hasUnsavedSelection) {
    return { label: 'পুনরায় নির্বাচন', className: 'selected-badge' }
  }

  return { label: 'আগে ব্যবহৃত', className: 'used-badge' }
}

function formatUiError(error) {
  let message = error?.message || 'Unknown error'

  if (typeof message === 'string' && message.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(message)
      if (typeof parsed?.error === 'string' && parsed.error.trim()) {
        message = parsed.error
      } else if (typeof parsed?.message === 'string' && parsed.message.trim()) {
        message = parsed.message
      }
    } catch (_) {
      // keep original text
    }
  }

  return message
}

function QuestionSetModal({ isOpen, onClose, onSave }) {
  const [questionFiles, setQuestionFiles] = useState([])
  const [questionSetHistory, setQuestionSetHistory] = useState([])
  const [activeFile, setActiveFile] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSubject, setActiveSubject] = useState('all')
  const [showArchive, setShowArchive] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setSaving(false)
    setError(null)
    setShowArchive(false)
    setSearchQuery('')
    setActiveSubject('all')
    loadData()
  }, [isOpen])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)

      const [files, activeConfig] = await Promise.all([
        loadQuestionFiles(),
        getActiveQuestionFile(),
      ])

      setQuestionFiles(files)
      setActiveFile(activeConfig.activeFile)
      setSelectedFile(activeConfig.activeFile)
      setQuestionSetHistory(Array.isArray(activeConfig.questionSetHistory) ? activeConfig.questionSetHistory : [])
    } catch (err) {
      console.error('Failed to load question files:', err)
      setError(formatUiError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!selectedFile || selectedFile === activeFile) {
      return
    }

    try {
      setSaving(true)
      setError(null)

      const result = await setActiveQuestionFile(selectedFile)
      const nextHistory = Array.isArray(result?.questionSetHistory) ? result.questionSetHistory : questionSetHistory

      setActiveFile(selectedFile)
      setSelectedFile(selectedFile)
      setQuestionSetHistory(nextHistory)
      setShowArchive(false)

      if (onSave) {
        onSave(selectedFile)
      }

      setTimeout(() => {
        onClose()
      }, 400)
    } catch (err) {
      console.error('Failed to save selection:', err)
      setError(formatUiError(err))
    } finally {
      setSaving(false)
    }
  }

  function getDisplayName(fileName) {
    return questionFiles.find((file) => file.name === fileName)?.displayName || fileName || 'questions.json'
  }

  const filteredFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return questionFiles.filter((file) => {
      const name = file.name.toLowerCase()
      const displayName = file.displayName.toLowerCase()
      const matchesSearch = !query || name.includes(query) || displayName.includes(query)
      return matchesSearch && getSubjectMatch(activeSubject, file)
    })
  }, [activeSubject, questionFiles, searchQuery])

  const historyMap = useMemo(() => {
    const map = new Map()
    questionSetHistory.forEach((entry) => {
      if (!entry?.fileName) return
      map.set(entry.fileName, entry.activatedAt)
    })
    return map
  }, [questionSetHistory])

  const hasUnsavedSelection = Boolean(selectedFile && activeFile && selectedFile !== activeFile)

  const enrichedFiles = useMemo(() => {
    return filteredFiles.map((file) => {
      const isActive = file.name === activeFile
      const isSelected = file.name === selectedFile
      const lastActivatedAt = historyMap.get(file.name) || null
      const isUsedBefore = historyMap.has(file.name) && !isActive
      const isNeverUsed = !historyMap.has(file.name) && !isActive

      return {
        ...file,
        isActive,
        isSelected,
        isUsedBefore,
        isNeverUsed,
        lastActivatedAt,
      }
    })
  }, [activeFile, filteredFiles, historyMap, selectedFile])

  const sections = useMemo(() => {
    const active = enrichedFiles.filter((file) => file.isActive).sort(sortByDisplayName)
    const unused = enrichedFiles
      .filter((file) => file.isNeverUsed)
      .sort((a, b) => {
        if (a.isSelected && !b.isSelected) return -1
        if (!a.isSelected && b.isSelected) return 1
        return sortByDisplayName(a, b)
      })

    return [
      { key: 'active', title: 'চলমান সেট', files: active },
      { key: 'unused', title: 'নতুন / এখনো ব্যবহার হয়নি', files: unused },
    ].filter((section) => section.files.length > 0)
  }, [enrichedFiles])

  const archiveFiles = useMemo(() => {
    const latestHistory = new Map()
    questionSetHistory.forEach((entry) => {
      if (!entry?.fileName) return
      latestHistory.set(entry.fileName, entry.activatedAt)
    })

    return questionFiles
      .filter((file) => latestHistory.has(file.name) && file.name !== activeFile)
      .map((file) => ({
        ...file,
        isSelected: file.name === selectedFile,
        lastActivatedAt: latestHistory.get(file.name),
      }))
      .sort((a, b) => new Date(b.lastActivatedAt || 0) - new Date(a.lastActivatedAt || 0))
  }, [activeFile, questionFiles, questionSetHistory, selectedFile])

  if (!isOpen) return null

  const currentActiveDisplayName = getDisplayName(activeFile)
  const selectedDisplayName = getDisplayName(selectedFile)
  const archiveCount = archiveFiles.length
  const isArchiveSelection = hasUnsavedSelection && archiveFiles.some((file) => file.name === selectedFile)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="question-set-modal-title"
      >
        <div className="modal-header">
          <h2 id="question-set-modal-title" className="bengali">প্রশ্ন সেট সেটিংস</h2>
          <div className="modal-header-actions">
            <button
              type="button"
              className={`archive-toggle ${showArchive ? 'active' : ''}`}
              onClick={() => setShowArchive((prev) => !prev)}
              title="পুরাতন সেট দেখুন"
            >
              <span className="archive-toggle-icon">🗂</span>
              <span className="archive-toggle-count">{archiveCount}</span>
            </button>
            <button className="close-button" onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>

        <div className="modal-body">
          {error && (
            <div className="error-message">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className="filter-section">
            <div className="search-container">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input bengali"
                placeholder="নাম বা আইডি দিয়ে খুঁজুন..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>

            <div className="filter-buttons">
              {[
                ['all', 'সব'],
                ['biology', 'জীববিজ্ঞান'],
                ['chemistry', 'রসায়ন'],
                ['physics', 'পদার্থবিজ্ঞান'],
                ['math', 'গণিত'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`filter-btn bengali ${activeSubject === value ? 'active' : ''}`}
                  onClick={() => setActiveSubject(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="summary-strip">
            <div className="summary-row">
              <span className="summary-label bengali">বর্তমানে চালু</span>
              <strong>{currentActiveDisplayName}</strong>
            </div>
            <div className="summary-row">
              <span className="summary-label bengali">নির্বাচন অবস্থা</span>
              <strong className={hasUnsavedSelection ? 'summary-pending' : 'summary-stable'}>
                {hasUnsavedSelection ? `নতুন নির্বাচন: ${selectedDisplayName}` : 'কোনো পরিবর্তন হয়নি'}
              </strong>
            </div>
            <div className="summary-row">
              <span className="summary-label bengali">পুরাতন সেট</span>
              <button
                type="button"
                className="summary-archive-link bengali"
                onClick={() => setShowArchive((prev) => !prev)}
              >
                {showArchive ? 'লুকান' : `দেখুন (${archiveCount})`}
              </button>
            </div>
          </div>

          {showArchive && (
            <div className="archive-panel">
              <div className="archive-panel-header">
                <div>
                  <strong className="bengali">পুরাতন সেট</strong>
                  <p className="bengali">এখান থেকে আগের ব্যবহার করা সেট আবার বেছে নিতে পারবেন।</p>
                </div>
              </div>

              {archiveFiles.length === 0 ? (
                <div className="archive-empty bengali">এখনও কোনো পুরাতন সেট নেই।</div>
              ) : (
                <div className="archive-list">
                  {archiveFiles.map((file) => {
                    const badge = archiveBadgeForFile(file, hasUnsavedSelection)

                    return (
                      <div
                        key={file.name}
                        className={[
                          'archive-item',
                          file.isSelected && isArchiveSelection ? 'selected' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <div className="archive-item-main">
                          <div className="archive-item-title-row">
                            <strong>{file.displayName}</strong>
                            <span className={`${badge.className} bengali archive-item-badge`}>{badge.label}</span>
                          </div>
                          <div className="archive-item-meta">
                            <span>{formatFileSize(file.size)}</span>
                            <span>শেষ চালু: {formatDate(file.lastActivatedAt)}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="archive-use-button bengali"
                          onClick={() => setSelectedFile(file.name)}
                        >
                          পুনরায় ব্যবহার
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p className="bengali">লোড হচ্ছে...</p>
            </div>
          ) : sections.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <h3 className="bengali">কোন প্রশ্ন সেট পাওয়া যায়নি</h3>
              <p>আপনার সার্চ বা ফিল্টার পরিবর্তন করুন</p>
            </div>
          ) : (
            <div className="question-set-sections">
              {sections.map((section) => (
                <section key={section.key} className="question-set-section">
                  <div className="section-heading bengali">{section.title}</div>
                  <div className="question-sets-grid">
                    {section.files.map((file) => {
                      const badge = badgeForFile(file, hasUnsavedSelection)

                      return (
                        <div
                          key={file.name}
                          className={[
                            'question-set-card',
                            file.isActive ? 'active' : '',
                            file.isSelected && hasUnsavedSelection ? 'selected' : '',
                          ].filter(Boolean).join(' ')}
                          onClick={() => setSelectedFile(file.name)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setSelectedFile(file.name)
                            }
                          }}
                        >
                          <input
                            type="radio"
                            name="questionSet"
                            value={file.name}
                            checked={file.isSelected}
                            onChange={() => setSelectedFile(file.name)}
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
                            {badge && (
                              <span className={`${badge.className} bengali`}>{badge.label}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="footer-helper bengali">
            {hasUnsavedSelection
              ? `সংরক্ষণ করলে নতুন সেট চালু হবে: ${selectedDisplayName}`
              : 'বর্তমান সেটই চালু আছে'}
          </div>
          <div className="footer-actions">
            <button className="cancel-button bengali" onClick={onClose} disabled={saving}>
              বাতিল
            </button>
            <button
              className="save-button bengali"
              onClick={handleSave}
              disabled={loading || saving || !selectedFile || !hasUnsavedSelection}
            >
              {saving ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default QuestionSetModal
