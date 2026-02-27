import { useState } from 'react'
import { renderLatex } from '../utils/latex'
import SubmissionStatus from './SubmissionStatus'
import './ResultSummary.css'

function ResultSummary({ questions, answers, studentName, score, onRestart, questionFile, submissionStatus }) {
  const { score: totalScore, correct, wrong, attempted, total, subjectStats = {} } = score
  const accuracy = attempted > 0 ? ((correct / attempted) * 100).toFixed(1) : 0
  const unanswered = total - attempted
  const pass = totalScore >= 60.0

  const subjectNames = {
    'Biology': 'জীববিজ্ঞান',
    'Chemistry': 'রসায়ন',
    'ICT': 'আইসিটি',
    'Physics': 'পদার্থবিজ্ঞান',
    'Mathematics': 'গণিত',
    'General': 'সাধারণ'
  }

  const [filter, setFilter] = useState('all')
  // Single question popup — null means closed
  const [viewingQuestion, setViewingQuestion] = useState(null)

  function getCongratulatoryMessage() {
    if (totalScore >= 60) return 'Congratulations! তুমি GST এর জন্য Perfect 🎯'
    if (accuracy >= 90) return 'অসাধারণ! তুমি চমৎকার করেছো! 🏆'
    if (accuracy >= 75) return 'খুব ভালো! চমৎকার কাজ! 🌟'
    if (accuracy >= 60) return 'ভালো করেছো! এগিয়ে চলো! 💪'
    return 'পরবর্তীতে আরও ভাল করবে! 📚'
  }

  function getQuestionStatus(q) {
    const selected = answers[q.id]
    const hasAnswer = selected !== undefined
    const isCorrect = hasAnswer && selected === q.correctOptionId
    return { selected, hasAnswer, isCorrect }
  }

  function getFilteredQuestions() {
    return questions.filter((q) => {
      const { hasAnswer, isCorrect } = getQuestionStatus(q)
      if (filter === 'correct') return isCorrect
      if (filter === 'wrong') return hasAnswer && !isCorrect
      if (filter === 'unanswered') return !hasAnswer
      return true
    })
  }

  // Open single question popup
  function openQuestion(qId) {
    const q = questions.find(q => q.id === qId)
    if (q) setViewingQuestion(q)
  }

  // Navigate prev/next in popup
  function navigateQuestion(direction) {
    if (!viewingQuestion) return
    const idx = questions.findIndex(q => q.id === viewingQuestion.id)
    const nextIdx = idx + direction
    if (nextIdx >= 0 && nextIdx < questions.length) {
      setViewingQuestion(questions[nextIdx])
    }
  }

  function handlePrint() {
    window.print()
  }

  function getBadge() {
    if (accuracy >= 90) return { icon: '🥇', label: 'স্বর্ণ পদক', cls: 'gold' }
    if (accuracy >= 75) return { icon: '🥈', label: 'রৌপ্য পদক', cls: 'silver' }
    if (accuracy >= 60) return { icon: '🥉', label: 'ব্রোঞ্জ পদক', cls: 'bronze' }
    return { icon: '📋', label: 'অংশগ্রহণ', cls: 'participation' }
  }

  const badge = getBadge()
  const filteredQuestions = getFilteredQuestions()

  // Render a single question card (reused in both list and popup)
  function renderQuestionCard(q) {
    const { selected, hasAnswer, isCorrect } = getQuestionStatus(q)
    const statusCls = isCorrect ? 'correct' : hasAnswer ? 'wrong' : 'unanswered'
    const options = [
      { key: 'a', text: q.options.a },
      { key: 'b', text: q.options.b },
      { key: 'c', text: q.options.c },
      { key: 'd', text: q.options.d },
    ]

    return (
      <>
        <div className="rs-q-header">
          <span className="rs-q-num bengali">প্রশ্ন {q.id}</span>
          <span className={`rs-q-badge ${statusCls}`}>
            {isCorrect ? '✓ সঠিক' : hasAnswer ? '✗ ভুল' : '— বাদ'}
          </span>
        </div>
        <div className="rs-q-text bengali" dangerouslySetInnerHTML={{ __html: renderLatex(q.question) }} />
        <div className="rs-options">
          {options.map(opt => {
            let optCls = ''
            if (opt.key === q.correctOptionId) optCls = 'correct-option'
            if (hasAnswer && opt.key === selected && !isCorrect) optCls += ' wrong-option'
            if (hasAnswer && opt.key === selected && isCorrect) optCls = 'correct-option selected'
            return (
              <div key={opt.key} className={`rs-option ${optCls}`}>
                <span className="rs-opt-letter">{opt.key.toUpperCase()}</span>
                <span className="rs-opt-text bengali" dangerouslySetInnerHTML={{ __html: renderLatex(opt.text) }} />
                {opt.key === q.correctOptionId && <span className="rs-opt-check">✓</span>}
                {hasAnswer && opt.key === selected && !isCorrect && <span className="rs-opt-cross">✗</span>}
              </div>
            )
          })}
        </div>
        {q.explanation && (
          <div className="rs-explanation">
            <div className="rs-explanation-header bengali">💡 ব্যাখ্যা</div>
            <div className="rs-explanation-text bengali" dangerouslySetInnerHTML={{ __html: renderLatex(q.explanation) }} />
            {q.explanationImage && (
              <div className="rs-explanation-image">
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
      </>
    )
  }

  return (
    <div className="result-summary">
      <div className="result-card">

        {/* ===== HEADER ===== */}
        <div className="rs-header">
          <div className={`rs-badge-chip ${badge.cls}`}>
            <span className="rs-badge-icon">{badge.icon}</span>
            <span className="bengali">{badge.label}</span>
          </div>
          <h1 className="rs-title bengali">পরীক্ষা সম্পন্ন</h1>
          <p className="rs-student bengali">{studentName}</p>
          <p className="rs-congrats bengali">{getCongratulatoryMessage()}</p>
        </div>

        {/* ===== SCORE HERO ===== */}
        <div className="rs-score-hero">
          <div className={`rs-score-ring ${pass ? 'pass' : 'fail'}`}>
            <svg viewBox="0 0 120 120">
              <circle className="rs-ring-bg" cx="60" cy="60" r="52" />
              <circle
                className="rs-ring-fill"
                cx="60" cy="60" r="52"
                style={{ strokeDasharray: `${(totalScore / total) * 327} 327` }}
              />
            </svg>
            <div className="rs-ring-text">
              <span className="rs-score-num">{totalScore.toFixed(1)}</span>
              <span className="rs-score-total bengali">/ {total}</span>
            </div>
          </div>
          <div className={`rs-pass-chip ${pass ? 'pass' : 'fail'}`}>
            {pass ? '✅ পাস' : '❌ ফেল'}
          </div>
        </div>

        {/* ===== QUICK STATS ===== */}
        <div className="rs-stats-row">
          <div className="rs-stat correct">
            <div className="rs-stat-num">{correct}</div>
            <div className="rs-stat-label bengali">সঠিক</div>
          </div>
          <div className="rs-stat wrong">
            <div className="rs-stat-num">{wrong}</div>
            <div className="rs-stat-label bengali">ভুল</div>
          </div>
          <div className="rs-stat skipped">
            <div className="rs-stat-num">{unanswered}</div>
            <div className="rs-stat-label bengali">বাদ</div>
          </div>
          <div className="rs-stat accuracy">
            <div className="rs-stat-num">{accuracy}%</div>
            <div className="rs-stat-label bengali">সঠিকতা</div>
          </div>
        </div>

        {/* ===== SUBJECT ANALYSIS ===== */}
        {Object.keys(subjectStats).length > 0 && (
          <div className="rs-subjects">
            <h2 className="rs-section-title bengali">📊 বিষয়ভিত্তিক বিশ্লেষণ</h2>
            <div className="rs-subject-grid">
              {Object.entries(subjectStats).map(([subject, stats]) => (
                <div key={subject} className="rs-subject-card">
                  <div className="rs-subject-header">
                    <span className="rs-subject-name bengali">{subjectNames[subject] || subject}</span>
                    <span className={`rs-subject-pct ${stats.percentage >= 80 ? 'high' : stats.percentage >= 50 ? 'mid' : 'low'}`}>
                      {stats.percentage}%
                    </span>
                  </div>
                  <div className="rs-subject-bar-track">
                    <div
                      className={`rs-subject-bar-fill ${stats.percentage >= 80 ? 'high' : stats.percentage >= 50 ? 'mid' : 'low'}`}
                      style={{ width: `${stats.percentage}%` }}
                    />
                  </div>
                  <div className="rs-subject-nums">
                    <span className="correct-text">✓ {stats.correct}</span>
                    <span className="wrong-text">✗ {stats.wrong}</span>
                    <span className="skip-text">— {stats.total - stats.attempted}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== COMPACT ANSWER GRID — click opens popup ===== */}
        <div className="rs-answer-grid-section">
          <h2 className="rs-section-title bengali">🗂️ উত্তর সারসংক্ষেপ <span className="rs-hint bengali">(নম্বরে ক্লিক করুন)</span></h2>
          <div className="rs-answer-grid">
            {questions.map((q) => {
              const { hasAnswer, isCorrect } = getQuestionStatus(q)
              const cls = isCorrect ? 'correct' : hasAnswer ? 'wrong' : 'skipped'
              return (
                <button
                  key={q.id}
                  className={`rs-grid-tile ${cls} ${viewingQuestion?.id === q.id ? 'active' : ''}`}
                  onClick={() => openQuestion(q.id)}
                  title={`প্রশ্ন ${q.id}`}
                >
                  {q.id}
                </button>
              )
            })}
          </div>
          <div className="rs-grid-legend">
            <span><span className="rs-legend-dot correct" /> সঠিক</span>
            <span><span className="rs-legend-dot wrong" /> ভুল</span>
            <span><span className="rs-legend-dot skipped" /> বাদ</span>
          </div>
        </div>

        {/* ===== SINGLE QUESTION POPUP ===== */}
        {viewingQuestion && (
          <div className="rs-popup-overlay" onClick={() => setViewingQuestion(null)}>
            <div className="rs-popup" onClick={(e) => e.stopPropagation()}>
              {/* Popup navigation */}
              <div className="rs-popup-nav">
                <button
                  className="rs-popup-nav-btn bengali"
                  onClick={() => navigateQuestion(-1)}
                  disabled={questions.findIndex(q => q.id === viewingQuestion.id) === 0}
                >
                  ← আগের
                </button>
                <span className="rs-popup-counter bengali">
                  {viewingQuestion.id} / {questions.length}
                </span>
                <button
                  className="rs-popup-nav-btn bengali"
                  onClick={() => navigateQuestion(1)}
                  disabled={questions.findIndex(q => q.id === viewingQuestion.id) === questions.length - 1}
                >
                  পরের →
                </button>
                <button className="rs-popup-close" onClick={() => setViewingQuestion(null)}>✕</button>
              </div>
              {/* Question content */}
              <div className={`rs-popup-body ${getQuestionStatus(viewingQuestion).isCorrect ? 'correct' : getQuestionStatus(viewingQuestion).hasAnswer ? 'wrong' : 'unanswered'}`}>
                {renderQuestionCard(viewingQuestion)}
              </div>
            </div>
          </div>
        )}

        {/* ===== PDF & FILTER BAR ===== */}
        <div className="rs-toolbar">
          <div className="rs-filters">
            {[
              { key: 'all', label: `সব (${questions.length})` },
              { key: 'wrong', label: `ভুল (${wrong})` },
              { key: 'correct', label: `সঠিক (${correct})` },
              { key: 'unanswered', label: `বাদ (${unanswered})` },
            ].map(f => (
              <button
                key={f.key}
                className={`rs-filter-btn bengali ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button className="rs-pdf-btn no-print bengali" onClick={handlePrint}>
            📄 PDF ডাউনলোড
          </button>
        </div>

        {/* ===== FULL QUESTION LIST (for PDF / filter view) ===== */}
        <div className="rs-questions-list">
          {filteredQuestions.map((q) => {
            const { selected, hasAnswer, isCorrect } = getQuestionStatus(q)
            const statusCls = isCorrect ? 'correct' : hasAnswer ? 'wrong' : 'unanswered'
            return (
              <div key={q.id} className={`rs-question-card ${statusCls}`}>
                {renderQuestionCard(q)}
              </div>
            )
          })}
        </div>

        {/* ===== ACTIONS ===== */}
        <div className="rs-actions no-print">
          <button className="rs-restart-btn bengali" onClick={onRestart}>
            🔄 নতুন পরীক্ষা শুরু করুন
          </button>
        </div>
      </div>

      <SubmissionStatus {...submissionStatus} />
    </div>
  )
}

export default ResultSummary
