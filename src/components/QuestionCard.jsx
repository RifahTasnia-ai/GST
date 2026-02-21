import { useSwipe } from '../hooks/useSwipe'
import { renderLatex } from '../utils/latex'
import './QuestionCard.css'

function QuestionCard({
  question,
  questionNumber,
  selectedAnswer,
  onAnswerSelect,
  onPrev,
  onNext,
  canGoPrev,
  canGoNext,
  onSubmit,
  onExit
}) {
  const swipeHandlers = useSwipe(
    () => canGoNext && onNext(),
    () => canGoPrev && onPrev()
  )

  if (!question) return null

  return (
    <div
      className="question-card"
      {...swipeHandlers}
    >
      <div className="question-header">
        <span className="question-badge bengali">প্রশ্ন {questionNumber}</span>
      </div>

      <div className="question-text bengali" dangerouslySetInnerHTML={{ __html: renderLatex(question.question) }} />

      {question.hasDiagram && question.svg_code && (
        <div className="question-diagram" dangerouslySetInnerHTML={{ __html: question.svg_code }} />
      )}

      <div className="options-grid">
        {question.options.map((option) => {
          const isSelected = selectedAnswer === option.id
          return (
            <button
              key={option.id}
              className={`option-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onAnswerSelect(question.id, option.id)}
            >
              <span className="option-label">{option.id})</span>
              <span className="option-text bengali" dangerouslySetInnerHTML={{ __html: renderLatex(option.text) }} />
              {isSelected && <span className="check-icon">✓</span>}
            </button>
          )
        })}
      </div>

      <div className="question-actions">
        {/* Exit button — replaces the old Review button */}
        <button
          className="action-btn exit-btn"
          onClick={onExit}
        >
          <span className="bengali">✕ বের হন</span>
        </button>

        <div className="nav-buttons">
          <button
            className="action-btn"
            onClick={onPrev}
            disabled={!canGoPrev}
          >
            ← <span className="bengali">পূর্বের</span>
          </button>
          {canGoNext ? (
            <button
              className="action-btn primary"
              onClick={onNext}
            >
              <span className="bengali">পরের</span> →
            </button>
          ) : (
            <button
              className="action-btn primary submit-btn"
              onClick={onSubmit}
            >
              <span className="bengali">সাবমিট</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default QuestionCard
