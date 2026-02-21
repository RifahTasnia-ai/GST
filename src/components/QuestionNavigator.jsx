import { memo, useCallback, useMemo, useState, useEffect, useRef } from 'react'
import './QuestionNavigator.css'

const STATUS_LABELS = {
  active: 'সক্রিয়',
  answered: 'উত্তর দেওয়া',
  visited: 'দেখা হয়েছে',
  unvisited: 'অদেখা'
}

const LEGEND_ITEMS = [
  { key: 'unvisited', label: 'অদেখা' },
  { key: 'visited', label: 'দেখা' },
  { key: 'answered', label: 'উত্তর' },
]

/* ────────────────────────────────────────────
   Shared: single question button
   ──────────────────────────────────────────── */
function QuestionButton({ index, status, onJump }) {
  return (
    <button
      className={`qn-btn ${status}`}
      onClick={() => onJump(index)}
      aria-label={`প্রশ্ন ${index + 1} — ${STATUS_LABELS[status] || status}`}
      aria-current={status === 'active' ? 'step' : undefined}
      title={`প্রশ্ন ${index + 1}`}
      role="listitem"
    >
      {index + 1}
    </button>
  )
}

/* ────────────────────────────────────────────
   Legend Row (shared between sidebar & sheet)
   ──────────────────────────────────────────── */
function Legend({ className }) {
  return (
    <div className={className || 'qn-legend'} aria-hidden="true">
      {LEGEND_ITEMS.map(({ key, label }) => (
        <div className="qn-legend-item" key={key}>
          <span className={`qn-legend-dot ${key}`} />
          <span className="bengali">{label}</span>
        </div>
      ))}
    </div>
  )
}

/* ────────────────────────────────────────────
   SVG Icons (inline, no deps)
   ──────────────────────────────────────────── */
const GridIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
)

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const TargetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
  </svg>
)

const NavIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 4h18v2H3V4zm0 7h12v2H3v-2zm0 7h18v2H3v-2z" />
  </svg>
)

/* ════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════ */
function QuestionNavigatorInner({
  totalQuestions,
  currentIndex,
  answers,
  questions,
  visitedQuestions,
  onQuestionJump
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const sheetBodyRef = useRef(null)

  // -- Tab Pagination Setup --
  const GROUP_SIZE = 25;
  const groupsCount = Math.ceil(totalQuestions / GROUP_SIZE);
  const activeGroupIndex = Math.floor(currentIndex / GROUP_SIZE);

  const [viewedGroupIndex, setViewedGroupIndex] = useState(activeGroupIndex);

  // Auto-switch tabs when the current question changes (e.g., via "Next" button)
  useEffect(() => {
    setViewedGroupIndex(Math.floor(currentIndex / GROUP_SIZE));
  }, [currentIndex, GROUP_SIZE]);

  // Lock body scroll when sheet is open (prevent background scroll on mobile)
  useEffect(() => {
    if (sheetOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [sheetOpen])

  // Scroll the active question into view inside the sheet when opening
  useEffect(() => {
    if (sheetOpen && sheetBodyRef.current) {
      // Use requestAnimationFrame so DOM has painted
      requestAnimationFrame(() => {
        const activeBtn = sheetBodyRef.current?.querySelector('.qn-btn.active')
        if (activeBtn) {
          activeBtn.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      })
    }
  }, [sheetOpen])

  const getStatus = useCallback((index) => {
    const question = questions[index]
    if (!question) return 'unvisited'
    const hasAnswer = answers[question.id] !== undefined
    const isVisited = visitedQuestions.has(index)

    if (index === currentIndex) return 'active'
    if (hasAnswer) return 'answered'
    if (isVisited) return 'visited'
    return 'unvisited'
  }, [questions, answers, visitedQuestions, currentIndex])

  const answeredCount = useMemo(() => {
    if (!questions) return 0
    return questions.filter(q => answers[q.id] !== undefined).length
  }, [questions, answers])

  // Build status array once (perf: avoid recalculating per-button)
  const statuses = useMemo(() =>
    Array.from({ length: totalQuestions }, (_, i) => getStatus(i)),
    [totalQuestions, getStatus]
  )

  const handleSheetSelect = useCallback((index) => {
    onQuestionJump(index)
    setSheetOpen(false)
  }, [onQuestionJump])

  const handleGoToCurrent = useCallback(() => {
    setSheetOpen(false)
  }, [])

  /* ── Pagination Tabs ── */
  const SUBJECT_LABELS = ['Physics', 'Chemistry', 'Math', 'Biology'];

  const renderTabs = () => {
    if (groupsCount <= 1) return null;
    return (
      <div className="qn-tabs">
        {Array.from({ length: groupsCount }, (_, i) => {
          const start = i * GROUP_SIZE + 1;
          const end = Math.min((i + 1) * GROUP_SIZE, totalQuestions);
          const tabLabel = SUBJECT_LABELS[i] || `${start}-${end}`;

          return (
            <button
              key={i}
              className={`qn-tab ${viewedGroupIndex === i ? 'active' : ''}`}
              onClick={() => setViewedGroupIndex(i)}
            >
              {tabLabel}
            </button>
          )
        })}
      </div>
    )
  }

  // Get only the statuses for the CURRENT viewed group
  const startIndex = viewedGroupIndex * GROUP_SIZE;
  const endIndex = Math.min(startIndex + GROUP_SIZE, totalQuestions);
  const currentGroupItems = statuses
    .map((status, index) => ({ status, index }))
    .slice(startIndex, endIndex);

  /* ── Desktop Sidebar ── */
  const desktopSidebar = (
    <aside className="qn-sidebar" role="navigation" aria-label="প্রশ্ন নেভিগেশন">
      <div className="qn-sidebar-inner">
        <div className="qn-header">
          <h3 className="qn-title bengali">
            <span className="qn-title-icon"><NavIcon /></span>
            প্রশ্ন নেভিগেশন
          </h3>
          <div className="qn-stats">
            <span className="qn-stats-num">{answeredCount}</span>
            <span>/ {totalQuestions}</span>
          </div>
        </div>

        <Legend />

        {renderTabs()}

        <div className="qn-grid" role="list">
          {currentGroupItems.map(({ status, index }) => (
            <QuestionButton key={index} index={index} status={status} onJump={onQuestionJump} />
          ))}
        </div>
      </div>
    </aside>
  )

  /* ── Mobile FAB + Bottom Sheet ── */
  const mobileSheet = (
    <div className="qn-fab">
      {/* FAB Trigger */}
      <button
        className="qn-fab-btn"
        onClick={() => setSheetOpen(true)}
        aria-label="প্রশ্ন তালিকা খুলুন"
      >
        <GridIcon />
        {answeredCount > 0 && (
          <span className="qn-fab-badge">{answeredCount}</span>
        )}
      </button>

      {/* Backdrop */}
      <div
        className={`qn-backdrop ${sheetOpen ? 'open' : ''}`}
        onClick={() => setSheetOpen(false)}
        aria-hidden="true"
      />

      {/* Bottom Sheet */}
      <div
        className={`qn-sheet ${sheetOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="প্রশ্ন তালিকা"
      >
        {/* Handle */}
        <div className="qn-sheet-handle">
          <div className="qn-sheet-handle-bar" />
        </div>

        {/* Header */}
        <div className="qn-sheet-header">
          <div className="qn-sheet-title-row">
            <h3 className="qn-sheet-title bengali">
              প্রশ্ন তালিকা
              <span style={{ fontWeight: 400, fontSize: '14px', color: 'var(--slate-400)', marginLeft: 8 }}>
                {answeredCount}/{totalQuestions}
              </span>
            </h3>
            <button
              className="qn-sheet-close"
              onClick={() => setSheetOpen(false)}
              aria-label="বন্ধ করুন"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Go to current question */}
          <button className="qn-goto-btn bengali" onClick={handleGoToCurrent}>
            <TargetIcon />
            বর্তমান প্রশ্নে যান ({currentIndex + 1})
          </button>
        </div>

        {/* Scrollable body */}
        <div className="qn-sheet-body" ref={sheetBodyRef}>
          <Legend className="qn-sheet-legend qn-legend" />

          {renderTabs()}

          <div className="qn-sheet-grid" role="list">
            {currentGroupItems.map(({ status, index }) => (
              <QuestionButton key={index} index={index} status={status} onJump={handleSheetSelect} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {desktopSidebar}
      {mobileSheet}
    </>
  )
}

const QuestionNavigator = memo(QuestionNavigatorInner, (prev, next) => {
  return (
    prev.totalQuestions === next.totalQuestions &&
    prev.currentIndex === next.currentIndex &&
    prev.answers === next.answers &&
    prev.visitedQuestions === next.visitedQuestions &&
    prev.onQuestionJump === next.onQuestionJump
  )
})

QuestionNavigator.displayName = 'QuestionNavigator'

export default QuestionNavigator
