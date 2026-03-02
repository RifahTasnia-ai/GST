import { useState, useEffect, useRef } from 'react'
import html2canvas from 'html2canvas'
import { renderLatex } from '../../utils/latex'
import { getExamConfig } from '../../utils/examConfig'
import './SubmissionsTable.css'

function SubmissionsTable({
  submissions,
  onDelete,
  onDeleteStudent,
  loading,
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange
}) {
  const [selectedSubmission, setSelectedSubmission] = useState(null)
  const [spectatingStudent, setSpectatingStudent] = useState(null)
  const [questions, setQuestions] = useState([])
  const [spectateQuestions, setSpectateQuestions] = useState([])
  const [modalFilter, setModalFilter] = useState('all')
  const [activeQuestionId, setActiveQuestionId] = useState(null)
  const questionRefs = useRef({})

  useEffect(() => {
    if (selectedSubmission) {
      loadQuestions()
      setModalFilter('all')
      setActiveQuestionId(null)
    }
  }, [selectedSubmission])

  useEffect(() => {
    if (spectatingStudent) {
      loadSpectateQuestions()
    } else {
      setSpectateQuestions([])
    }
  }, [spectatingStudent])

  useEffect(() => {
    if (!spectatingStudent) return

    const latest = submissions.find((sub) => {
      if (!sub) return false
      if (spectatingStudent.studentName && sub.studentName === spectatingStudent.studentName) return true
      if (spectatingStudent.studentId && sub.studentId && sub.studentId === spectatingStudent.studentId) return true
      return false
    })

    if (!latest) return

    if (hasSpectatorProgressChanged(spectatingStudent, latest)) {
      setSpectatingStudent(latest)
    }
  }, [submissions, spectatingStudent])

  async function loadQuestions() {
    try {
      const questionFile = selectedSubmission?.questionFile || 'questions.json'
      const res = await fetch(`/${questionFile}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load questions')
      const data = await res.json()
      setQuestions(data)
    } catch (err) {
      console.error('Failed to load questions:', err)
    }
  }

  async function loadSpectateQuestions() {
    try {
      const questionFile = spectatingStudent?.questionFile || 'questions.json'
      const res = await fetch(`/${questionFile}`, { cache: 'no-store' })
      if (!res.ok) {
        setSpectateQuestions([])
        return
      }
      const data = await res.json()
      setSpectateQuestions(data)
    } catch (err) {
      console.error('Failed to load spectate questions:', err)
      setSpectateQuestions([])
    }
  }

  function getQuestionStatus(questionId, studentAnswer) {
    const qid = typeof questionId === 'string' ? parseInt(questionId) : questionId
    const question = questions.find(q => q.id === qid || q.id.toString() === questionId.toString())
    if (!question) return { isCorrect: null, correctAnswer: null, question: null }
    const isAnswered = studentAnswer !== undefined && studentAnswer !== null
    return {
      isCorrect: isAnswered ? question.correctAnswer === studentAnswer : null,
      isAnswered,
      correctAnswer: question.correctAnswer,
      question
    }
  }

  function hasSpectatorProgressChanged(currentStudent, nextStudent) {
    if (!currentStudent || !nextStudent) return false

    if (currentStudent.currentQuestion !== nextStudent.currentQuestion) return true
    if (currentStudent.answeredCount !== nextStudent.answeredCount) return true
    if (currentStudent.totalQuestions !== nextStudent.totalQuestions) return true
    if (currentStudent.timestamp !== nextStudent.timestamp) return true
    if (currentStudent.questionFile !== nextStudent.questionFile) return true

    const currentAnswers = currentStudent.answers || {}
    const nextAnswers = nextStudent.answers || {}
    const nextKeys = Object.keys(nextAnswers)

    if (Object.keys(currentAnswers).length !== nextKeys.length) return true

    return nextKeys.some((key) => currentAnswers[key] !== nextAnswers[key])
  }

  function getFilteredQuestions() {
    const answers = selectedSubmission?.answers || {}
    return questions.filter(q => {
      const qid = q.id.toString()
      const ans = answers[qid]
      const isAnswered = ans !== undefined && ans !== null
      const isCorrect = isAnswered && q.correctAnswer === ans

      if (modalFilter === 'correct') return isCorrect
      if (modalFilter === 'wrong') return isAnswered && !isCorrect
      if (modalFilter === 'unanswered') return !isAnswered
      return true
    })
  }

  function scrollToQuestion(qId) {
    setActiveQuestionId(qId)
    const el = questionRefs.current[qId]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  function getStats() {
    if (!selectedSubmission || questions.length === 0) return { correct: 0, wrong: 0, unanswered: 0 }
    const answers = selectedSubmission.answers || {}
    let correct = 0, wrong = 0, unanswered = 0
    questions.forEach(q => {
      const ans = answers[q.id.toString()]
      if (ans === undefined || ans === null) {
        unanswered++
      } else if (q.correctAnswer === ans) {
        correct++
      } else {
        wrong++
      }
    })
    return { correct, wrong, unanswered }
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  function formatFullDate(timestamp) {
    const date = new Date(timestamp)
    return date.toLocaleString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    })
  }

  function getElapsedTime(timestamp, totalQuestions = 100) {
    const now = Date.now()
    const start = new Date(timestamp).getTime()
    const minutes = Math.floor((now - start) / (1000 * 60))
    const resolvedTotalQuestions = Number(totalQuestions) > 0 ? Number(totalQuestions) : 100
    const durationMins = Math.floor(getExamConfig(resolvedTotalQuestions).durationSeconds / 60)
    const warningThreshold = Math.floor(durationMins * (5 / 6))

    return {
      minutes,
      durationMins,
      isExpired: minutes > durationMins,
      isWarning: minutes > warningThreshold && minutes <= durationMins
    }
  }

  async function handleScreenshot() {
    try {
      const modalElement = document.querySelector('.modal-content')
      if (!modalElement) return
      const ogMax = modalElement.style.maxHeight
      const ogOv = modalElement.style.overflow
      const ogOvY = modalElement.style.overflowY
      modalElement.style.maxHeight = 'none'
      modalElement.style.overflow = 'visible'
      modalElement.style.overflowY = 'visible'
      await new Promise(r => setTimeout(r, 100))
      const canvas = await html2canvas(modalElement, {
        backgroundColor: '#ffffff', scale: 2, logging: false,
        useCORS: true, allowTaint: true,
        windowHeight: modalElement.scrollHeight, height: modalElement.scrollHeight
      })
      modalElement.style.maxHeight = ogMax
      modalElement.style.overflow = ogOv
      modalElement.style.overflowY = ogOvY
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `উত্তর-${selectedSubmission?.studentName || 'student'}.jpg`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }, 'image/jpeg', 0.95)
    } catch (error) {
      console.error('Screenshot failed:', error)
      alert('স্ক্রিনশট নিতে সমস্যা হয়েছে।')
    }
  }

  function handleExportJSON() {
    try {
      const answeredCount = Object.keys(selectedSubmission.answers || {}).length
      const unansweredCount = questions.length - answeredCount
      const exportData = {
        subjectName: selectedSubmission.studentName || 'Unknown',
        studentId: selectedSubmission.studentId || 'N/A',
        examInfo: {
          timestamp: formatFullDate(selectedSubmission.timestamp),
          timestampRaw: selectedSubmission.timestamp,
          questionFile: selectedSubmission.questionFile || 'questions.json'
        },
        statistics: {
          totalQuestions: questions.length,
          attempted: selectedSubmission.attempted || answeredCount,
          correct: selectedSubmission.correct || 0,
          wrong: selectedSubmission.wrong || 0,
          unanswered: unansweredCount,
          score: Number(selectedSubmission.score || 0).toFixed(2),
          totalMarks: selectedSubmission.totalMarks || 100,
          passStatus: selectedSubmission.pass || false,
          passLabel: selectedSubmission.pass ? 'পাস' : 'ফেল'
        },
        answers: questions.map((question) => {
          const qid = question.id.toString()
          const studentAnswer = (selectedSubmission.answers || {})[qid]
          const isAnswered = studentAnswer !== undefined && studentAnswer !== null
          const { isCorrect } = getQuestionStatus(qid, studentAnswer)
          return {
            questionId: question.id, question: question.question,
            options: question.options,
            studentAnswer: isAnswered ? studentAnswer : null,
            correctAnswer: question.correctAnswer,
            isCorrect, isAnswered,
            solution: question.explanation || null
          }
        })
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${selectedSubmission?.studentName || 'student'}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('JSON export failed:', error)
      alert('JSON এক্সপোর্ট করতে সমস্যা হয়েছে।')
    }
  }

  if (loading) {
    return (
      <div className="data-table-container">
        <div className="loading-overlay">
          <div className="spinner"></div>
          <div className="bengali">লোড হচ্ছে...</div>
        </div>
      </div>
    )
  }

  if (submissions.length === 0) {
    return (
      <div className="data-table-container">
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <h3 className="bengali">কোন ডাটা পাওয়া যায়নি</h3>
          <p className="bengali">এখনও কোন শিক্ষার্থী পরীক্ষা দেয়নি</p>
        </div>
      </div>
    )
  }

  const stats = getStats()
  const filteredModalQuestions = getFilteredQuestions()
  const spectateTotalQuestions = spectatingStudent
    ? (Number(spectatingStudent.totalQuestions) > 0
      ? Number(spectatingStudent.totalQuestions)
      : (spectateQuestions.length || 100))
    : 100

  return (
    <>
      {/* ===== TABLE ===== */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th className="bengali">নাম</th>
              <th className="bengali">আইডি</th>
              <th className="bengali">স্কোর</th>
              <th className="bengali">স্ট্যাটাস</th>
              <th className="bengali">সময়</th>
              <th className="bengali">অ্যাকশন</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((sub, idx) => (
              <tr key={idx} className={sub.isPending ? 'pending-row' : ''}>
                <td data-label="নাম" className="bengali">{sub.studentName || 'Unknown'}</td>
                <td data-label="আইডি" className="bengali">{sub.studentId || 'N/A'}</td>
                <td data-label="স্কোর">
                  {sub.isPending ? (
                    <span className="bengali" style={{ color: '#999' }}>—</span>
                  ) : (
                    <strong>{Number(sub.score || 0).toFixed(2)}</strong>
                  )}
                </td>
                <td data-label="স্ট্যাটাস">
                  {sub.isPending ? (() => {
                    const timeInfo = getElapsedTime(sub.timestamp, sub.totalQuestions || 100)
                    if (timeInfo.isExpired) {
                      return (
                        <span className="status-badge" style={{ backgroundColor: '#dc2626', color: 'white' }}>
                          ⏱️ টাইম আউট ({timeInfo.minutes} মিনিট)
                        </span>
                      )
                    } else if (timeInfo.isWarning) {
                      return (
                        <span className="status-badge" style={{ backgroundColor: '#f59e0b', color: 'white' }}>
                          ⚠️ পেন্ডিং ({timeInfo.minutes} মিনিট)
                        </span>
                      )
                    } else {
                      return (
                        <span className="status-badge pending">
                          ⏱️ পেন্ডিং ({timeInfo.minutes} মিনিট)
                        </span>
                      )
                    }
                  })() : (
                    <span className={`status-badge ${sub.pass ? 'pass' : 'fail'}`}>
                      {sub.pass ? 'পাস' : 'ফেল'}
                    </span>
                  )}
                </td>
                <td data-label="সময়" className="bengali">{formatDate(sub.timestamp)}</td>
                <td data-label="অ্যাকশন">
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!sub.isPending && (
                      <button className="action-button bengali" onClick={() => setSelectedSubmission(sub)}>দেখুন</button>
                    )}
                    {sub.isPending && (
                      <button
                        className="action-button bengali"
                        onClick={() => setSpectatingStudent(sub)}
                        style={{ backgroundColor: '#6366f1', color: 'white' }}
                      >
                        👁️ দেখুন
                      </button>
                    )}
                    <button
                      className="action-button danger bengali"
                      onClick={() => onDeleteStudent(sub.studentName)}
                      title="ছাত্র মুছুন"
                    >✗</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="pagination">
          <div className="pagination-info bengali">
            দেখানো হচ্ছে {((currentPage - 1) * itemsPerPage) + 1} থেকে {Math.min(currentPage * itemsPerPage, totalItems)} টি, মোট {totalItems} টি
          </div>
          <div className="pagination-buttons">
            <button className="pagination-button" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>←</button>
            <button className="pagination-button active">{currentPage}</button>
            <button className="pagination-button" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>→</button>
          </div>
        </div>
      </div>

      {/* ===== REDESIGNED DETAIL MODAL ===== */}
      {selectedSubmission && (
        <div className="detail-modal" onClick={() => setSelectedSubmission(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>

            {/* Modal Header */}
            <div className="modal-header">
              <h2 className="bengali">{selectedSubmission.studentName}</h2>
              <div className="modal-header-actions">
                <button className="export-json-btn" onClick={handleExportJSON} title="AI-Future Research Export">
                  <img src="/ai-icon.png" alt="AI" className="export-icon" />
                  <span>AI-Future</span>
                </button>
                <button className="screenshot-btn bengali" onClick={handleScreenshot} title="স্ক্রিনশট">
                  📸
                </button>
                <button className="close-btn" onClick={() => setSelectedSubmission(null)}>✕</button>
              </div>
            </div>

            <div className="modal-body">
              {/* Score Summary */}
              <div className="adm-score-row">
                <div className="adm-score-main">
                  <span className="adm-score-val">{Number(selectedSubmission.score || 0).toFixed(2)}</span>
                  <span className="adm-score-total">/ {selectedSubmission.totalMarks || 100}</span>
                </div>
                <span className={`adm-pass-chip ${selectedSubmission.pass ? 'pass' : 'fail'}`}>
                  {selectedSubmission.pass ? '✓ পাস' : '✗ ফেল'}
                </span>
              </div>

              {/* Quick Stats */}
              <div className="adm-stats-row">
                <div className="adm-stat correct">
                  <span className="adm-stat-num">{selectedSubmission.correct || stats.correct}</span>
                  <span className="adm-stat-label bengali">সঠিক</span>
                </div>
                <div className="adm-stat wrong">
                  <span className="adm-stat-num">{selectedSubmission.wrong || stats.wrong}</span>
                  <span className="adm-stat-label bengali">ভুল</span>
                </div>
                <div className="adm-stat">
                  <span className="adm-stat-num">{selectedSubmission.attempted || Object.keys(selectedSubmission.answers || {}).length}</span>
                  <span className="adm-stat-label bengali">চেষ্টা</span>
                </div>
                <div className="adm-stat">
                  <span className="adm-stat-num">{formatDate(selectedSubmission.timestamp)}</span>
                  <span className="adm-stat-label bengali">তারিখ</span>
                </div>
              </div>

              {/* Subject Analysis */}
              {(() => {
                const subjectStats = (() => {
                  if (selectedSubmission.subjectStats) return selectedSubmission.subjectStats
                  const s = {}
                  const answers = selectedSubmission.answers || {}
                  questions.forEach(q => {
                    const subject = q.subject || 'General'
                    if (!s[subject]) s[subject] = { correct: 0, wrong: 0, attempted: 0, total: 0 }
                    s[subject].total++
                    const sel = answers[q.id.toString()]
                    if (sel !== undefined && sel !== null) {
                      s[subject].attempted++
                      if (sel === q.correctAnswer) s[subject].correct++
                      else s[subject].wrong++
                    }
                  })
                  Object.values(s).forEach(st => {
                    st.percentage = st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0
                  })
                  return s
                })()
                const subjectNames = {
                  'Biology': 'জীববিজ্ঞান', 'Chemistry': 'রসায়ন', 'ICT': 'আইসিটি',
                  'Physics': 'পদার্থবিজ্ঞান', 'Mathematics': 'গণিত', 'General': 'সাধারণ'
                }
                if (Object.keys(subjectStats).length === 0) return null
                return (
                  <div className="adm-subjects">
                    <h3 className="adm-section-title bengali">📊 বিষয়ভিত্তিক বিশ্লেষণ</h3>
                    <div className="adm-subject-grid">
                      {Object.entries(subjectStats).map(([subject, s]) => (
                        <div key={subject} className="adm-subject-card">
                          <div className="adm-subject-header">
                            <span className="bengali">{subjectNames[subject] || subject}</span>
                            <span className={`adm-subject-pct ${s.percentage >= 80 ? 'high' : s.percentage >= 50 ? 'mid' : 'low'}`}>
                              {s.percentage}%
                            </span>
                          </div>
                          <div className="adm-subject-bar-track">
                            <div className={`adm-subject-bar-fill ${s.percentage >= 80 ? 'high' : s.percentage >= 50 ? 'mid' : 'low'}`}
                              style={{ width: `${s.percentage}%` }} />
                          </div>
                          <div className="adm-subject-nums">
                            <span className="c">✓{s.correct}</span>
                            <span className="w">✗{s.wrong}</span>
                            <span className="s">—{s.total - s.attempted}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* ===== COMPACT ANSWER GRID ===== */}
              <div className="adm-answer-grid-section">
                <h3 className="adm-section-title bengali">🗂️ উত্তর ম্যাপ <span className="adm-hint">(ক্লিক করে দেখুন)</span></h3>
                <div className="adm-answer-grid">
                  {questions.map(q => {
                    const qid = q.id.toString()
                    const ans = (selectedSubmission.answers || {})[qid]
                    const isAnswered = ans !== undefined && ans !== null
                    const isCorrect = isAnswered && q.correctAnswer === ans
                    const cls = isCorrect ? 'correct' : isAnswered ? 'wrong' : 'skipped'
                    return (
                      <button
                        key={q.id}
                        className={`adm-grid-tile ${cls} ${activeQuestionId === q.id ? 'active' : ''}`}
                        onClick={() => scrollToQuestion(q.id)}
                      >
                        {q.id}
                      </button>
                    )
                  })}
                </div>
                <div className="adm-grid-legend">
                  <span><span className="adm-dot correct" />সঠিক</span>
                  <span><span className="adm-dot wrong" />ভুল</span>
                  <span><span className="adm-dot skipped" />বাদ</span>
                </div>
              </div>

              {/* ===== FILTER TABS ===== */}
              <div className="adm-filter-bar">
                {[
                  { key: 'all', label: `সব (${questions.length})` },
                  { key: 'wrong', label: `ভুল (${stats.wrong})` },
                  { key: 'correct', label: `সঠিক (${stats.correct})` },
                  { key: 'unanswered', label: `বাদ (${stats.unanswered})` },
                ].map(f => (
                  <button
                    key={f.key}
                    className={`adm-filter-btn bengali ${modalFilter === f.key ? 'active' : ''}`}
                    onClick={() => setModalFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* ===== QUESTION DETAILS LIST ===== */}
              <div className="adm-questions-list">
                {filteredModalQuestions.map(q => {
                  const qid = q.id.toString()
                  const ans = (selectedSubmission.answers || {})[qid]
                  const isAnswered = ans !== undefined && ans !== null
                  const isCorrect = isAnswered && q.correctAnswer === ans
                  const statusCls = isCorrect ? 'correct' : isAnswered ? 'wrong' : 'unanswered'
                  const options = [
                    { key: 'a', text: q.options?.a },
                    { key: 'b', text: q.options?.b },
                    { key: 'c', text: q.options?.c },
                    { key: 'd', text: q.options?.d },
                  ]

                  return (
                    <div
                      key={q.id}
                      className={`adm-q-card ${statusCls}`}
                      ref={el => questionRefs.current[q.id] = el}
                    >
                      <div className="adm-q-header">
                        <span className="adm-q-num bengali">প্রশ্ন {q.id}</span>
                        <span className={`adm-q-badge ${statusCls}`}>
                          {isCorrect ? '✓ সঠিক' : isAnswered ? '✗ ভুল' : '— বাদ'}
                        </span>
                      </div>
                      <div className="adm-q-text bengali" dangerouslySetInnerHTML={{ __html: renderLatex(q.question) }} />
                      <div className="adm-options">
                        {options.map(opt => {
                          let optCls = ''
                          if (opt.key === q.correctAnswer) optCls = 'correct-opt'
                          if (isAnswered && opt.key === ans && !isCorrect) optCls += ' wrong-opt'
                          if (isAnswered && opt.key === ans && isCorrect) optCls = 'correct-opt selected'
                          return (
                            <div key={opt.key} className={`adm-option ${optCls}`}>
                              <span className="adm-opt-letter">{opt.key.toUpperCase()}</span>
                              <span className="adm-opt-text bengali" dangerouslySetInnerHTML={{ __html: renderLatex(opt.text || '') }} />
                              {opt.key === q.correctAnswer && <span className="adm-opt-icon correct">✓</span>}
                              {isAnswered && opt.key === ans && !isCorrect && <span className="adm-opt-icon wrong">✗</span>}
                            </div>
                          )
                        })}
                      </div>
                      {q.explanation && (
                        <div className="adm-explanation">
                          <div className="adm-explanation-header bengali">💡 ব্যাখ্যা</div>
                          <div className="adm-explanation-text bengali" dangerouslySetInnerHTML={{ __html: renderLatex(q.explanation) }} />
                          {q.explanationImage && (
                            <div className="adm-explanation-image">
                              <img
                                src={q.explanationImage}
                                alt={`Explanation diagram for question ${q.id}`}
                                style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '8px' }}
                                loading="lazy"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== SPECTATE MODAL ===== */}
      {spectatingStudent && (
        <div className="detail-modal" onClick={() => setSpectatingStudent(null)}>
          <div className="modal-content spectate-modal" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="modal-header">
              <h2 className="bengali">👁️ {spectatingStudent.studentName}</h2>
              <div className="modal-header-actions">
                <button className="close-btn" onClick={() => setSpectatingStudent(null)}>✕</button>
              </div>
            </div>

            <div className="modal-body">
              {/* ===== DONUT CHART + STATS ===== */}
              {(() => {
                const answered = spectatingStudent.answeredCount || 0
                const total = spectateTotalQuestions || 1
                const pct = Math.round((answered / total) * 100)
                const elapsed = getElapsedTime(spectatingStudent.timestamp, spectateTotalQuestions)
                const timeRemaining = Math.max(0, elapsed.durationMins - elapsed.minutes)

                return (
                  <div className="spectate-chart-section">
                    {/* Donut Chart */}
                    <div className="spectate-donut-wrap">
                      <div
                        className="spectate-donut"
                        style={{
                          background: `conic-gradient(
                            #10b981 0deg ${pct * 3.6}deg,
                            #e2e8f0 ${pct * 3.6}deg 360deg
                          )`
                        }}
                      >
                        <div className="spectate-donut-hole">
                          <span className="spectate-donut-pct">{pct}%</span>
                          <span className="spectate-donut-label bengali">সম্পন্ন</span>
                        </div>
                      </div>
                    </div>

                    {/* Stats beside chart */}
                    <div className="spectate-chart-stats">
                      <div className="spectate-stat-item">
                        <span className="spectate-stat-icon">✅</span>
                        <div>
                          <span className="spectate-stat-val">{answered}/{total}</span>
                          <span className="spectate-stat-lbl bengali">উত্তর দিয়েছে</span>
                        </div>
                      </div>
                      <div className="spectate-stat-item">
                        <span className="spectate-stat-icon">📍</span>
                        <div>
                          <span className="spectate-stat-val">প্রশ্ন {spectatingStudent.currentQuestion || '?'}</span>
                          <span className="spectate-stat-lbl bengali">বর্তমান অবস্থান</span>
                        </div>
                      </div>
                      <div className="spectate-stat-item">
                        <span className="spectate-stat-icon">⏱️</span>
                        <div>
                          <span className="spectate-stat-val">{elapsed.minutes} মি.</span>
                          <span className="spectate-stat-lbl bengali">অতিবাহিত সময়</span>
                        </div>
                      </div>
                      <div className="spectate-stat-item">
                        <span className="spectate-stat-icon">{timeRemaining <= 10 ? '🔴' : timeRemaining <= 20 ? '🟡' : '🟢'}</span>
                        <div>
                          <span className="spectate-stat-val">{timeRemaining} মি.</span>
                          <span className="spectate-stat-lbl bengali">বাকি সময়</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Answer Grid */}
              {spectateTotalQuestions > 0 && (
                <div className="adm-answer-grid-section">
                  <h3 className="adm-section-title bengali">🗂️ উত্তর ম্যাপ</h3>
                  <div className="adm-answer-grid">
                    {(() => {
                      const answers = spectatingStudent.answers || {}
                      const answeredKeys = new Set(
                        Object.keys(answers).filter(k => answers[k] !== undefined && answers[k] !== null)
                      )
                      const hasQuestionsLoaded = spectateQuestions.length > 0

                      return Array.from({ length: spectateTotalQuestions }, (_, i) => {
                        const qNum = i + 1
                        let hasAnswer = false
                        let answerVal = null

                        if (hasQuestionsLoaded && spectateQuestions[i]) {
                          // question file লোড হয়েছে: সঠিক question id দিয়ে check করো
                          const qId = spectateQuestions[i].id.toString()
                          hasAnswer = answeredKeys.has(qId)
                          answerVal = answers[qId]
                        } else {
                          // fallback: position number দিয়ে check করো
                          hasAnswer = answeredKeys.has(qNum.toString())
                          answerVal = answers[qNum.toString()]
                        }

                        const isCurrent = qNum === Number(spectatingStudent.currentQuestion || 0)
                        return (
                          <div
                            key={qNum}
                            className={`adm-grid-tile ${hasAnswer ? 'correct' : 'skipped'} ${isCurrent ? 'active' : ''}`}
                            title={hasAnswer ? `উত্তর: ${answerVal}` : 'উত্তর দেয়নি'}
                            style={isCurrent ? { outline: '2px solid #6366f1', outlineOffset: '1px' } : {}}
                          >
                            {qNum}
                          </div>
                        )
                      })
                    })()}

                  </div>
                  <div className="adm-grid-legend">
                    <span><span className="adm-dot correct" />উত্তর দিয়েছে</span>
                    <span><span className="adm-dot skipped" />বাকি আছে</span>
                    <span>🟣 বর্তমান প্রশ্ন</span>
                  </div>
                </div>
              )}

              {/* No data notice */}
              {(!spectatingStudent.answers || Object.keys(spectatingStudent.answers).length === 0) && (
                <div style={{ textAlign: 'center', padding: '24px', color: '#999' }} className="bengali">
                  এখনও কোন উত্তর সিঙ্ক হয়নি।<br />
                  প্রতি ২ মিনিটে আপডেট হবে।
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default SubmissionsTable
