import { useState } from 'react'
import { renderLatex } from '../utils/latex'
import SubmissionStatus from './SubmissionStatus'
import './ResultSummary.css'

function ResultSummary({
  questions,
  answers,
  studentName,
  score,
  onRestart,
  questionFile,
  submissionStatus,
  examConfig,
}) {
  const { score: totalScore, correct, wrong, attempted, total, totalMarks = total, subjectStats = {} } = score
  const accuracy = attempted > 0 ? ((correct / attempted) * 100).toFixed(1) : 0
  const unanswered = total - attempted
  const passMark = examConfig?.passMark ?? 60
  const pass = totalScore >= passMark

  const subjectNames = {
    Biology: 'জীববিজ্ঞান',
    Chemistry: 'রসায়ন',
    ICT: 'আইসিটি',
    Physics: 'পদার্থবিজ্ঞান',
    Mathematics: 'গণিত',
    General: 'সাধারণ',
  }

  const [filter, setFilter] = useState('all')
  const [viewingQuestion, setViewingQuestion] = useState(null)

  function getCongratulatoryMessage() {
    if (pass) return 'অভিনন্দন! তুমি পরীক্ষায় পাস করেছ।'
    if (accuracy >= 75) return 'ভালো হয়েছে, আরও একটু অনুশীলন করলে আরও ভালো হবে।'
    if (accuracy >= 50) return 'চেষ্টা ঠিক আছে, এখন ভুলগুলো দেখে নাও।'
    return 'পরেরবার আরও ভালো করার সুযোগ আছে।'
  }

  function getQuestionStatus(question) {
    const selected = answers[question.id]
    const hasAnswer = selected !== undefined
    const isCorrect = hasAnswer && selected === question.correctOptionId
    return { selected, hasAnswer, isCorrect }
  }

  function getFilteredQuestions() {
    return questions.filter((question) => {
      const { hasAnswer, isCorrect } = getQuestionStatus(question)
      if (filter === 'correct') return isCorrect
      if (filter === 'wrong') return hasAnswer && !isCorrect
      if (filter === 'unanswered') return !hasAnswer
      return true
    })
  }

  function openQuestion(questionId) {
    const question = questions.find((item) => item.id === questionId)
    if (question) setViewingQuestion(question)
  }

  function navigateQuestion(direction) {
    if (!viewingQuestion) return
    const index = questions.findIndex((item) => item.id === viewingQuestion.id)
    const nextIndex = index + direction
    if (nextIndex >= 0 && nextIndex < questions.length) {
      setViewingQuestion(questions[nextIndex])
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

  function renderQuestionCard(question) {
    const { selected, hasAnswer, isCorrect } = getQuestionStatus(question)
    const statusClass = isCorrect ? 'correct' : hasAnswer ? 'wrong' : 'unanswered'

    return (
      <>
        <div className="rs-q-header">
          <span className="rs-q-num bengali">প্রশ্ন {question.id}</span>
          <span className={`rs-q-badge ${statusClass}`}>
            {isCorrect ? '✓ সঠিক' : hasAnswer ? '✗ ভুল' : '— বাদ'}
          </span>
        </div>
        <div className="rs-q-text bengali" dangerouslySetInnerHTML={{ __html: renderLatex(question.question) }} />
        <div className="rs-options">
          {question.options.map((option) => {
            let optionClass = ''
            if (option.id === question.correctOptionId) optionClass = 'correct-option'
            if (hasAnswer && option.id === selected && !isCorrect) optionClass += ' wrong-option'
            if (hasAnswer && option.id === selected && isCorrect) optionClass = 'correct-option selected'

            return (
              <div key={option.id} className={`rs-option ${optionClass}`.trim()}>
                <span className="rs-opt-letter">{option.id.toUpperCase()}</span>
                <span className="rs-opt-text bengali" dangerouslySetInnerHTML={{ __html: renderLatex(option.text) }} />
                {option.id === question.correctOptionId && <span className="rs-opt-check">✓</span>}
                {hasAnswer && option.id === selected && !isCorrect && <span className="rs-opt-cross">✗</span>}
              </div>
            )
          })}
        </div>
        {question.explanation && (
          <div className="rs-explanation">
            <div className="rs-explanation-header bengali">💡 ব্যাখ্যা</div>
            <div className="rs-explanation-text bengali" dangerouslySetInnerHTML={{ __html: renderLatex(question.explanation) }} />
            {question.explanationImage && (
              <div className="rs-explanation-image">
                <img
                  src={question.explanationImage}
                  alt={`Explanation diagram for question ${question.id}`}
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
        <div className="rs-header">
          <div className={`rs-badge-chip ${badge.cls}`}>
            <span className="rs-badge-icon">{badge.icon}</span>
            <span className="bengali">{badge.label}</span>
          </div>
          <h1 className="rs-title bengali">পরীক্ষা সম্পন্ন</h1>
          <p className="rs-student bengali">{studentName}</p>
          <p className="rs-congrats bengali">{getCongratulatoryMessage()}</p>
          <p className="bengali" style={{ marginTop: '8px', color: 'var(--slate-500)' }}>
            পাস মার্ক {passMark} | নেগেটিভ {examConfig?.negativeMarking ?? 0.25} | মোট নম্বর {totalMarks}
          </p>
        </div>

        <div className="rs-score-hero">
          <div className={`rs-score-ring ${pass ? 'pass' : 'fail'}`}>
            <svg viewBox="0 0 120 120">
              <circle className="rs-ring-bg" cx="60" cy="60" r="52" />
              <circle
                className="rs-ring-fill"
                cx="60"
                cy="60"
                r="52"
                style={{ strokeDasharray: `${Math.min((totalScore / Math.max(totalMarks, 1)) * 327, 327)} 327` }}
              />
            </svg>
            <div className="rs-ring-text">
              <span className="rs-score-num">{totalScore.toFixed(2)}</span>
              <span className="rs-score-total bengali">/ {totalMarks}</span>
            </div>
          </div>
          <div className={`rs-pass-chip ${pass ? 'pass' : 'fail'}`}>
            {pass ? '✅ পাস' : '❌ ফেল'}
          </div>
        </div>

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

        <div className="rs-answer-grid-section">
          <h2 className="rs-section-title bengali">🗂️ উত্তর সারসংক্ষেপ <span className="rs-hint bengali">(নম্বরে ক্লিক করুন)</span></h2>
          <div className="rs-answer-grid">
            {questions.map((question) => {
              const { hasAnswer, isCorrect } = getQuestionStatus(question)
              const cls = isCorrect ? 'correct' : hasAnswer ? 'wrong' : 'skipped'
              return (
                <button
                  key={question.id}
                  className={`rs-grid-tile ${cls} ${viewingQuestion?.id === question.id ? 'active' : ''}`}
                  onClick={() => openQuestion(question.id)}
                  title={`প্রশ্ন ${question.id}`}
                >
                  {question.id}
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

        {viewingQuestion && (
          <div className="rs-popup-overlay" onClick={() => setViewingQuestion(null)}>
            <div className="rs-popup" onClick={(event) => event.stopPropagation()}>
              <div className="rs-popup-nav">
                <button
                  className="rs-popup-nav-btn bengali"
                  onClick={() => navigateQuestion(-1)}
                  disabled={questions.findIndex((question) => question.id === viewingQuestion.id) === 0}
                >
                  ← আগের
                </button>
                <span className="rs-popup-counter bengali">
                  {viewingQuestion.id} / {questions.length}
                </span>
                <button
                  className="rs-popup-nav-btn bengali"
                  onClick={() => navigateQuestion(1)}
                  disabled={questions.findIndex((question) => question.id === viewingQuestion.id) === questions.length - 1}
                >
                  পরের →
                </button>
                <button className="rs-popup-close" onClick={() => setViewingQuestion(null)}>✕</button>
              </div>
              <div className={`rs-popup-body ${getQuestionStatus(viewingQuestion).isCorrect ? 'correct' : getQuestionStatus(viewingQuestion).hasAnswer ? 'wrong' : 'unanswered'}`}>
                {renderQuestionCard(viewingQuestion)}
              </div>
            </div>
          </div>
        )}

        <div className="rs-toolbar">
          <div className="rs-filters">
            {[
              { key: 'all', label: `সব (${questions.length})` },
              { key: 'wrong', label: `ভুল (${wrong})` },
              { key: 'correct', label: `সঠিক (${correct})` },
              { key: 'unanswered', label: `বাদ (${unanswered})` },
            ].map((item) => (
              <button
                key={item.key}
                className={`rs-filter-btn bengali ${filter === item.key ? 'active' : ''}`}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button className="rs-pdf-btn no-print bengali" onClick={handlePrint}>
            📄 PDF ডাউনলোড
          </button>
        </div>

        <div className="rs-questions-list">
          {filteredQuestions.map((question) => {
            const { hasAnswer, isCorrect } = getQuestionStatus(question)
            const statusClass = isCorrect ? 'correct' : hasAnswer ? 'wrong' : 'unanswered'
            return (
              <div key={question.id} className={`rs-question-card ${statusClass}`}>
                {renderQuestionCard(question)}
              </div>
            )
          })}
        </div>

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
