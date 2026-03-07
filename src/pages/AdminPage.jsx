import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteStudent, deleteSubmission, loadPendingStudents, loadSubmissions, removePendingStudent } from '../utils/api'
import SubmissionsTable from '../components/admin/SubmissionsTable'
import NotificationToast from '../components/admin/NotificationToast'
import QuestionSetModal from '../components/admin/QuestionSetModal'
import { getExamConfig } from '../utils/examConfig'
import './AdminPage.css'

function AdminPage() {
  const [submissions, setSubmissions] = useState([])
  const [pendingStudents, setPendingStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('all-subjects')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [notification, setNotification] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [nextRefreshIn, setNextRefreshIn] = useState(1)
  const loadDataRef = useRef(null)
  const itemsPerPage = 7

  useEffect(() => {
    loadData()
    loadDataRef.current = loadData
  }, [])

  useEffect(() => {
    loadDataRef.current = loadData
  })

  useEffect(() => {
    if (!autoRefresh) return

    const refreshIntervalSeconds = 1
    setNextRefreshIn(refreshIntervalSeconds)

    const interval = setInterval(() => {
      loadDataRef.current?.()
    }, refreshIntervalSeconds * 1000)

    const ticker = setInterval(() => {
      setNextRefreshIn((prev) => (prev <= 1 ? refreshIntervalSeconds : prev - 1))
    }, 1000)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadDataRef.current?.()
        setNextRefreshIn(refreshIntervalSeconds)
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(interval)
      clearInterval(ticker)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [autoRefresh])

  async function loadData() {
    try {
      setLoading(true)
      const [submissionsData, pendingData] = await Promise.all([
        loadSubmissions(),
        loadPendingStudents().catch(() => []),
      ])
      setSubmissions(submissionsData)
      setPendingStudents(pendingData)
      setError(null)
      setNextRefreshIn(1)
    } catch (err) {
      setError(err.message)
      console.error('Failed to load data', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(studentName, timestamp) {
    if (!window.confirm(`আপনি কি ${studentName} এর উত্তর মুছে ফেলতে চান?\n\nএই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।`)) {
      return
    }

    try {
      await deleteSubmission(studentName, timestamp)
      await loadData()
      setNotification({ message: `${studentName} এর উত্তর সফলভাবে মুছে ফেলা হয়েছে`, type: 'success' })
    } catch (err) {
      console.error('Delete failed:', err)
      setNotification({ message: `মুছে ফেলতে সমস্যা হয়েছে: ${err.message}`, type: 'error' })
    }
  }

  async function handleDeleteStudent(studentName) {
    if (!window.confirm(`আপনি কি ${studentName} এর সকল উত্তর মুছে ফেলতে চান?\n\nএই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।`)) {
      return
    }

    const results = await Promise.allSettled([
      deleteStudent(studentName),
      removePendingStudent(studentName),
    ])

    const anySuccess = results.some((result) => result.status === 'fulfilled')
    if (anySuccess) {
      await loadData()
      setNotification({ message: `${studentName} এর সকল উত্তর সফলভাবে মুছে ফেলা হয়েছে`, type: 'success' })
      return
    }

    const errorMessage = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason?.message || 'Unknown delete error')
      .join(' | ')

    setNotification({ message: `মুছে ফেলতে সমস্যা হয়েছে: ${errorMessage}`, type: 'error' })
  }

  const submissionsByStudent = useMemo(() => {
    const now = Date.now()
    const groups = {}

    submissions.forEach((sub) => {
      const studentKey = sub.studentId || sub.studentName
      if (!groups[studentKey] || new Date(sub.timestamp) > new Date(groups[studentKey].timestamp)) {
        groups[studentKey] = sub
      }
    })

    pendingStudents.forEach((pending) => {
      const studentKey = pending.studentName
      const start = new Date(pending.timestamp).getTime()
      const elapsed = now - start
      const resolvedQuestions = Number(pending.totalQuestions) > 0 ? Number(pending.totalQuestions) : 100
      const durationSeconds = getExamConfig(resolvedQuestions).durationSeconds
      const durationMs = durationSeconds * 1000
      const timeoutThreshold = Math.floor(durationSeconds / 60)
      const maxDisplayMs = durationMs + (5 * 60 * 1000)

      if (elapsed > maxDisplayMs) return

      const minutes = Math.floor(elapsed / (1000 * 60))
      const pendingEntry = {
        ...pending,
        totalQuestions: resolvedQuestions,
        studentName: pending.studentName,
        timestamp: pending.timestamp,
        status: 'Pending',
        isPending: true,
        isExpired: minutes > timeoutThreshold,
        elapsedMinutes: minutes,
      }

      if (!groups[studentKey]) {
        groups[studentKey] = pendingEntry
        return
      }

      const existingTimestamp = new Date(groups[studentKey].timestamp).getTime()
      const pendingTimestamp = new Date(pending.timestamp).getTime()
      if (pendingTimestamp > existingTimestamp) {
        const oldKey = `${studentKey}_submitted_${groups[studentKey].timestamp}`
        groups[oldKey] = groups[studentKey]
        groups[studentKey] = pendingEntry
      }
    })

    return Object.values(groups)
  }, [pendingStudents, submissions])

  const filteredSubmissions = useMemo(() => {
    let filtered = submissionsByStudent

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter((sub) =>
        sub.studentName?.toLowerCase().includes(term) ||
        sub.studentId?.toLowerCase().includes(term)
      )
    }

    if (subjectFilter !== 'all-subjects') {
      filtered = filtered.filter((sub) => {
        if (!sub.questionFile) return false

        const fileName = sub.questionFile.toLowerCase()
        if (subjectFilter === 'biology') {
          return fileName.includes('biology') || fileName.includes('জীববিজ্ঞান')
        }
        if (subjectFilter === 'chemistry') {
          return fileName.includes('chemistry') || fileName.includes('chem') || fileName.includes('রসায়ন')
        }
        if (subjectFilter === 'physics') {
          return fileName.includes('physics') || fileName.includes('পদার্থ') || fileName.includes('questions2')
        }
        if (subjectFilter === 'math') {
          return fileName.includes('math') || fileName.includes('গণিত')
        }
        return true
      })
    }

    return [...filtered].sort((a, b) => {
      if (a.isPending && !b.isPending) return -1
      if (!a.isPending && b.isPending) return 1
      return new Date(b.timestamp) - new Date(a.timestamp)
    })
  }, [searchTerm, subjectFilter, submissionsByStudent])

  const totalPages = Math.ceil(filteredSubmissions.length / itemsPerPage) || 1
  const paginatedSubmissions = filteredSubmissions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const stats = useMemo(() => {
    const total = submissionsByStudent.length
    const passed = submissionsByStudent.filter((s) => s.pass).length
    const failed = total - passed
    const avgScore = total > 0
      ? (submissionsByStudent.reduce((sum, s) => sum + (s.score || 0), 0) / total).toFixed(1)
      : 0
    return { total, passed, failed, avgScore }
  }, [submissionsByStudent])

  return (
    <div className="admin-page">
      {error && (
        <div className="admin-error-banner">
          <span className="bengali">ডাটা লোড সমস্যা: {error}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={loadData} className="admin-error-retry bengali">আবার চেষ্টা</button>
            <button onClick={() => setError(null)} className="admin-error-dismiss">×</button>
          </div>
        </div>
      )}

      <div className="admin-header">
        <h1 className="bengali">শিক্ষার্থী ডাটাবেস</h1>
        <div className="admin-header-right">
          <div className="stats-badge bengali">
            মোট: <strong>{stats.total}</strong>
          </div>

          <button
            className={`icon-button ${autoRefresh ? 'active' : ''}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? `অটো রিফ্রেশ চালু (${nextRefreshIn}s)` : 'অটো রিফ্রেশ বন্ধ'}
            style={{ position: 'relative', flexDirection: 'column', fontSize: '0.7rem', gap: '1px', paddingTop: '4px' }}
          >
            ↻
            {autoRefresh && <span style={{ fontSize: '0.6rem', lineHeight: 1, opacity: 0.85 }}>{nextRefreshIn}s</span>}
          </button>

          <button
            className="icon-button"
            onClick={loadData}
            title="রিফ্রেশ করুন"
            disabled={loading}
          >
            ↺
          </button>

          <button
            className="icon-button"
            onClick={() => setShowSettingsModal(true)}
            title="প্রশ্ন সেট সেটিংস"
          >
            ⚙️
          </button>
        </div>
      </div>

      <div className="admin-content">
        <div className="filter-bar">
          <input
            type="text"
            className="search-input bengali"
            placeholder="নাম বা আইডি দিয়ে খুঁজুন..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <select
            className="filter-select bengali"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
          >
            <option value="all-subjects">সকল বিষয়</option>
            <option value="biology">জীববিজ্ঞান</option>
            <option value="chemistry">রসায়ন</option>
            <option value="physics">পদার্থবিজ্ঞান</option>
            <option value="math">গণিত</option>
          </select>

          <button className="export-button bengali" onClick={() => alert('Export feature coming soon!')}>
            Export CSV
          </button>
        </div>

        <SubmissionsTable
          submissions={paginatedSubmissions}
          onDelete={handleDelete}
          onDeleteStudent={handleDeleteStudent}
          loading={loading}
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredSubmissions.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </div>

      {notification && (
        <NotificationToast
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      <QuestionSetModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onSave={(fileName) => {
          setNotification({
            message: `প্রশ্ন সেট সংরক্ষিত হয়েছে: ${fileName}`,
            type: 'success',
          })
        }}
      />
    </div>
  )
}

export default AdminPage
