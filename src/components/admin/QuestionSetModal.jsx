import { useEffect, useMemo, useState } from 'react'
import {
  getActiveQuestionFile,
  getStoredAdminApiKey,
  loadQuestionFiles,
  setActiveQuestionFile,
  setAdminApiKey,
} from '../../utils/api'
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

  if (file.isUsedBefore) {
    return { label: 'আগে ব্যবহৃত', className: 'used-badge' }
  }

  return null
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
      // keep original message when it is not valid JSON
    }
  }

  if (message.toLowerCase().includes('unauthorized')) {
    return 'Admin API key মেলেনি। Vercel-এর ADMIN_API_KEY এই বক্সে দিন, তারপর আবার সংরক্ষণ করুন।'
  }
  return message
}

function QuestionSetModal({ isOpen, onClose, onSave }) {
  const [questionFiles, setQuestionFiles] = useState([])
  const [questionSetHistory, setQuestionSetHistory] = useState([])
  const [activeFile, setActiveFile] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [adminApiKey, setAdminApiKeyValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSubject, setActiveSubject] = useState('all')

  useEffect(() => {
    if (!isOpen) return
    setAdminApiKeyValue(getStoredAdminApiKey())
    loadData()
    setSearchQuery('')
    setActiveSubject('all')
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
      const trimmedAdminKey = adminApiKey.trim()
      if (trimmedAdminKey) {
        setAdminApiKey(trimmedAdminKey)
      }

      const result = await setActiveQuestionFile(selectedFile)
      const nextHistory = Array.isArray(result?.questionSetHistory) ? result.questionSetHistory : questionSetHistory

      setActiveFile(selectedFile)
      setQuestionSetHistory(nextHistory)

      if (onSave) {
        onSave(selectedFile)
      }

      setTimeout(() => {
        onClose()
      }, 400)
    } catch (err) {
      console.error('Failed to save selection:', err)
      setError(formatUiError(err))
      setSaving(false)
    }
  }

  function handleRememberAdminKey() {
    const trimmedAdminKey = adminApiKey.trim()
    setAdminApiKey(trimmedAdminKey)
    setAdminApiKeyValue(trimmedAdminKey)
    setError(null)
  }

  function handleClearAdminKey() {
    setAdminApiKey('')
    setAdminApiKeyValue('')
    setError(null)
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
  const activeVisible = filteredFiles.some((file) => file.name === activeFile)
  const selectedVisible = filteredFiles.some((file) => file.name === selectedFile)

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
    const used = enrichedFiles
      .filter((file) => file.isUsedBefore)
      .sort((a, b) => {
        if (a.isSelected && !b.isSelected) return -1
        if (!a.isSelected && b.isSelected) return 1
        return sortByDisplayName(a, b)
      })

    return [
      { key: 'active', title: 'চলমান সেট', files: active },
      { key: 'unused', title: 'নতুন / এখনো ব্যবহার হয়নি', files: unused },
      { key: 'used', title: 'আগে ব্যবহার হয়েছে', files: used },
    ].filter((section) => section.files.length > 0)
  }, [enrichedFiles])

  if (!isOpen) return null

  const currentActiveDisplayName = getDisplayName(activeFile)
  const selectedDisplayName = getDisplayName(selectedFile)
  const selectedOutsideFilter = hasUnsavedSelection && !selectedVisible

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
          <button className="close-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="error-message">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className="admin-key-panel">
            <div className="admin-key-copy">
              <strong>Admin API Key</strong>
              <p className="bengali">Question set save/delete করতে হলে Vercel-এর `ADMIN_API_KEY` একবার এখানে দিন।</p>
            </div>
            <div className="admin-key-actions">
              <input
                type="password"
                className="admin-key-input"
                placeholder="ADMIN_API_KEY"
                value={adminApiKey}
                onChange={(event) => setAdminApiKeyValue(event.target.value)}
                autoComplete="off"
              />
              <button type="button" className="admin-key-button" onClick={handleRememberAdminKey}>
                Save Key
              </button>
              <button type="button" className="admin-key-button secondary" onClick={handleClearAdminKey}>
                Clear
              </button>
            </div>
          </div>

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
          </div>

          {!activeVisible && activeFile && (
            <div className="filter-warning bengali">
              চলমান সেটটি বর্তমান ফিল্টারের বাইরে আছে: {currentActiveDisplayName}
            </div>
          )}

          {selectedOutsideFilter && (
            <div className="filter-warning bengali">
              নির্বাচিত সেট ফিল্টারের বাইরে আছে: {selectedDisplayName}
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
                            file.isUsedBefore ? 'used' : '',
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
                              {file.lastActivatedAt && (
                                <div className="last-used-meta bengali">
                                  শেষ চালু: {formatDate(file.lastActivatedAt)}
                                </div>
                              )}
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
