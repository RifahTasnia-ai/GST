import { memo, useCallback, useMemo } from 'react'
import './SidebarGrid.css'

const STATUS_LABELS = {
  active: 'সক্রিয়',
  marked: 'রিভিউ',
  answered: 'উত্তর দেওয়া',
  visited: 'দেখা হয়েছে',
  unvisited: 'অদেখা'
}

function SidebarGridInner({
  totalQuestions,
  currentIndex,
  answers,
  questions,
  visitedQuestions,
  markedQuestions,
  onQuestionJump
}) {
  const getQuestionStatus = useCallback((index) => {
    const question = questions[index]
    if (!question) return 'unvisited'

    const hasAnswer = answers[question.id] !== undefined
    const isVisited = visitedQuestions.has(index)
    const isMarked = markedQuestions.has(index)

    if (index === currentIndex) return 'active'
    if (isMarked) return 'marked'
    if (hasAnswer) return 'answered'
    if (isVisited) return 'visited'
    return 'unvisited'
  }, [questions, answers, visitedQuestions, markedQuestions, currentIndex])

  const bubbles = useMemo(() =>
    Array.from({ length: totalQuestions }, (_, i) => {
      const status = getQuestionStatus(i)
      return (
        <button
          key={i}
          className={`question-bubble ${status}`}
          onClick={() => onQuestionJump(i)}
          aria-label={`প্রশ্ন ${i + 1} — ${STATUS_LABELS[status] || status}`}
          aria-current={status === 'active' ? 'step' : undefined}
          title={`প্রশ্ন ${i + 1}`}
        >
          {i + 1}
        </button>
      )
    }),
    [totalQuestions, getQuestionStatus, onQuestionJump]
  )

  return (
    <aside className="sidebar-grid" role="navigation" aria-label="প্রশ্ন নেভিগেশন">
      <div className="sidebar-header">
        <h3 className="bengali">প্রশ্ন নেভিগেশন</h3>
        <div className="legend" aria-hidden="true">
          <div className="legend-item">
            <span className="legend-dot unvisited"></span>
            <span className="bengali">অদেখা</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot visited"></span>
            <span className="bengali">দেখা</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot answered"></span>
            <span className="bengali">উত্তর</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot marked"></span>
            <span className="bengali">রিভিউ</span>
          </div>
        </div>
      </div>
      <div className="questions-grid" role="list">
        {bubbles}
      </div>
    </aside>
  )
}

const SidebarGrid = memo(SidebarGridInner, (prevProps, nextProps) => {
  // Only re-render when meaningful data changes — NOT on every timer tick
  return (
    prevProps.totalQuestions === nextProps.totalQuestions &&
    prevProps.currentIndex === nextProps.currentIndex &&
    prevProps.answers === nextProps.answers &&
    prevProps.visitedQuestions === nextProps.visitedQuestions &&
    prevProps.markedQuestions === nextProps.markedQuestions &&
    prevProps.onQuestionJump === nextProps.onQuestionJump
  )
})

SidebarGrid.displayName = 'SidebarGrid'

export default SidebarGrid
