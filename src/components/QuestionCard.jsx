import { useState } from 'react'
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
  const [isZoomed, setIsZoomed] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)
  const [imageError, setImageError] = useState(false)
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

      {question.image && (
        <div className="question-diagram-container">
          {imageLoading && (
            <div className="question-diagram-skeleton">
              <span className="bengali">ছবি লোড হচ্ছে...</span>
            </div>
          )}
          {imageError ? (
            <div className="question-diagram-error">
              <span className="bengali">⚠ ছবি লোড করা যায়নি</span>
            </div>
          ) : (
            <img
              src={question.image}
              alt={`Diagram for question ${questionNumber}`}
              className={`question-content-image ${imageLoading ? 'hidden' : ''}`}
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageLoading(false)
                setImageError(true)
              }}
              onClick={() => setIsZoomed(true)}
              loading="lazy"
            />
          )}

          {isZoomed && !imageError && (
            <div className="image-zoom-overlay" onClick={() => setIsZoomed(false)}>
              <button
                className="close-zoom-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsZoomed(false)
                }}
              >
                ✕
              </button>
              <img
                src={question.image}
                alt={`Zoomed diagram for question ${questionNumber}`}
                className="zoomed-image"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>
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
