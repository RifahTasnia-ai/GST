import { useState, useEffect, useCallback, useRef } from 'react'
import ExamHeader from './ExamHeader'
import QuestionCard from './QuestionCard'
import QuestionNavigator from './QuestionNavigator'
import ResultSummary from './ResultSummary'
import SubmissionStatus from './SubmissionStatus'
import { saveSubmission, savePendingStudent, removePendingStudent } from '../utils/api'
import { queueSubmission, processSubmission, startBackgroundSync } from '../utils/SubmissionManager'
import './MCQContainer.css'


const STATUS = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  SUBMITTED: 'SUBMITTED'
}

const DURATION_SECONDS = 60 * 60 // 60 minutes
const MARK_PER_QUESTION = 1.0 // Each correct answer = 1 mark
const NEGATIVE_MARKING = 0.25
const PASS_MARK = 60.0 // 100 * 1.0 * 0.60
const SAVE_THROTTLE_MS = 5000 // Throttle localStorage writes to every 5 seconds

function MCQContainer({ questions, studentName, questionFile = 'questions.json' }) {
  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  const [status, setStatus] = useState(STATUS.RUNNING)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [visitedQuestions, setVisitedQuestions] = useState(new Set([0]))
  const [timeLeft, setTimeLeft] = useState(DURATION_SECONDS)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  // WK-4 fix: useRef instead of useState so guard works reliably across re-renders
  const pendingSentRef = useRef(false)
  const [submissionStatus, setSubmissionStatus] = useState({ status: 'idle', retryCount: 0 })

  // examStartTime stored in a ref AND persisted in localStorage so it survives tab switches/refreshes
  const examStartTimeRef = useRef(null)

  // Refs for throttled save
  const lastSaveRef = useRef(0)
  const saveTimerRef = useRef(null)
  const timeLeftRef = useRef(timeLeft)

  // Keep timeLeftRef in sync without triggering re-renders
  useEffect(() => {
    timeLeftRef.current = timeLeft
  }, [timeLeft])

  // All useCallback hooks must be defined before any returns
  const handleAnswerSelect = useCallback((questionId, optionId) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: optionId
    }))
    setVisitedQuestions(prev => new Set([...prev, currentQuestionIndex]))
  }, [currentQuestionIndex])

  const handleQuestionJump = useCallback((index) => {
    if (questions && index >= 0 && index < questions.length) {
      setCurrentQuestionIndex(index)
      setVisitedQuestions(prev => new Set([...prev, index]))
    }
  }, [questions])

  const handlePrev = useCallback(() => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => {
        const newIndex = prev - 1
        setVisitedQuestions(prevSet => new Set([...prevSet, newIndex]))
        return newIndex
      })
    }
  }, [currentQuestionIndex])

  const handleNext = useCallback(() => {
    if (questions && currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => {
        const newIndex = prev + 1
        setVisitedQuestions(prevSet => new Set([...prevSet, newIndex]))
        return newIndex
      })
    }
  }, [currentQuestionIndex, questions])

  const toggleMarkForReview = useCallback(() => {
    setMarkedForReview(prev => {
      const newSet = new Set(prev)
      if (newSet.has(currentQuestionIndex)) {
        newSet.delete(currentQuestionIndex)
      } else {
        newSet.add(currentQuestionIndex)
      }
      return newSet
    })
  }, [currentQuestionIndex])

  const calculateScore = useCallback(() => {
    if (!questions || !Array.isArray(questions)) return { score: 0, correct: 0, wrong: 0, attempted: 0, total: 0, subjectStats: {} }

    let correct = 0
    let wrong = 0
    const subjectStats = {}

    questions.forEach(q => {
      const subject = q.subject || 'General'
      if (!subjectStats[subject]) {
        subjectStats[subject] = { correct: 0, wrong: 0, attempted: 0, total: 0 }
      }
      subjectStats[subject].total++

      const selected = answers[q.id]
      if (!selected) return

      subjectStats[subject].attempted++
      if (selected === q.correctOptionId) {
        correct++
        subjectStats[subject].correct++
      } else {
        wrong++
        subjectStats[subject].wrong++
      }
    })

    // Calculate percentages for each subject
    Object.keys(subjectStats).forEach(subject => {
      const stats = subjectStats[subject]
      stats.percentage = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
    })

    const score = Math.max(correct * MARK_PER_QUESTION - wrong * NEGATIVE_MARKING, 0)
    return {
      score,
      correct,
      wrong,
      attempted: correct + wrong,
      total: questions.length,
      subjectStats
    }
  }, [questions, answers])

  const handleSubmit = useCallback(async () => {
    if (status === STATUS.SUBMITTED) return

    const scoreData = calculateScore()
    const payload = {
      studentName,
      answers,
      score: parseFloat(scoreData.score.toFixed(2)),
      totalMarks: scoreData.total * MARK_PER_QUESTION,
      timestamp: new Date().toISOString(),
      attempted: scoreData.attempted,
      correct: scoreData.correct,
      wrong: scoreData.wrong,
      pass: scoreData.score >= PASS_MARK,
      questionFile: questionFile
    }

    // Immediately queue the submission to localStorage for insurance
    const queueId = queueSubmission(payload)

    // Show result screen immediately
    setStatus(STATUS.SUBMITTED)

    // Start attempting to submit in background
    const queueItem = { id: queueId, payload, retryCount: 0 }

    processSubmission(queueItem, (progress) => {
      setSubmissionStatus(progress)

      if (progress.status === 'success') {
        // Clean up only on confirmed success
        localStorage.removeItem(`mcq_state_v100_${studentName}`)
        localStorage.removeItem('exam_session_student')
      }
    }).catch(err => {
      console.error('Submission error:', err)
      // Don't remove anything - let retry mechanism handle it
    })
  }, [status, studentName, answers, questions, calculateScore, questionFile])

  // Throttled save to localStorage — avoids synchronous write every second
  const saveStateToStorage = useCallback(() => {
    if (status !== STATUS.RUNNING) return

    const now = Date.now()
    const state = {
      answers,
      currentIndex: currentQuestionIndex,
      timeLeft: timeLeftRef.current,
      // CRITICAL: always persist the real start time so tab-switching can't cheat the timer
      examStartTime: examStartTimeRef.current,
      visited: Array.from(visitedQuestions)
    }

    if (now - lastSaveRef.current >= SAVE_THROTTLE_MS) {
      localStorage.setItem(`mcq_state_v100_${studentName}`, JSON.stringify(state))
      lastSaveRef.current = now
    } else {
      // Schedule a trailing save
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        localStorage.setItem(`mcq_state_v100_${studentName}`, JSON.stringify(state))
        lastSaveRef.current = Date.now()
      }, SAVE_THROTTLE_MS)
    }
  }, [answers, currentQuestionIndex, visitedQuestions, status, studentName])

  const handleExit = useCallback(() => {
    setShowExitConfirm(true)
  }, [])

  // All useEffect hooks must be called before any returns
  useEffect(() => {
    if (!questions || questions.length === 0) return

    const saved = localStorage.getItem(`mcq_state_v100_${studentName}`)
    if (saved) {
      try {
        const data = JSON.parse(saved)
        setAnswers(data.answers || {})
        const maxIndex = Math.max(0, questions.length - 1)
        setCurrentQuestionIndex(Math.min(data.currentIndex || 0, maxIndex))
        setVisitedQuestions(new Set(data.visited || [0]))
        setMarkedForReview(new Set(data.marked || []))

        // Restore wall-clock start time so timer can't be cheated by tab switching
        if (data.examStartTime) {
          examStartTimeRef.current = data.examStartTime
          // Compute REAL time left using wall-clock, not saved snapshot
          const elapsed = Math.floor((Date.now() - data.examStartTime) / 1000)
          const realTimeLeft = Math.max(DURATION_SECONDS - elapsed, 0)
          setTimeLeft(realTimeLeft)
        } else {
          // First ever load — record the real start time
          const now = Date.now()
          examStartTimeRef.current = now
          setTimeLeft(data.timeLeft ?? DURATION_SECONDS)
        }
      } catch (e) {
        console.error('Failed to load saved state', e)
      }
    } else {
      // Brand new exam — record start time
      const now = Date.now()
      examStartTimeRef.current = now
    }
  }, [studentName, questions])

  // Save on meaningful state changes (NOT on every timeLeft tick)
  useEffect(() => {
    saveStateToStorage()
    return () => clearTimeout(saveTimerRef.current)
  }, [saveStateToStorage])

  // Timer — uses wall-clock (Date.now) so background tabs / mobile tab-switching cannot cheat
  useEffect(() => {
    if (status !== STATUS.RUNNING || timeLeft <= 0) return

    const interval = setInterval(() => {
      if (!examStartTimeRef.current) return
      const elapsed = Math.floor((Date.now() - examStartTimeRef.current) / 1000)
      const remaining = Math.max(DURATION_SECONDS - elapsed, 0)
      setTimeLeft(remaining)
      if (remaining <= 0) {
        handleSubmit()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [status, handleSubmit])

  // Correct timer & send Spectre heartbeat when tab becomes visible again after being hidden
  useEffect(() => {
    if (status !== STATUS.RUNNING) return

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Correct the timer immediately using real wall-clock
        if (examStartTimeRef.current) {
          const elapsed = Math.floor((Date.now() - examStartTimeRef.current) / 1000)
          const remaining = Math.max(DURATION_SECONDS - elapsed, 0)
          setTimeLeft(remaining)
          if (remaining <= 0) {
            handleSubmit()
            return
          }
        }
        // Send Spectre heartbeat so admin sees the student is still active
        savePendingStudent(studentName, null, {
          answers,
          currentQuestion: currentQuestionIndex + 1,
          answeredCount: Object.keys(answers).length,
          totalQuestions: questions?.length || 0,
          questionFile
        }).catch(err => console.error('Visibility heartbeat failed:', err))
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [status, studentName, answers, currentQuestionIndex, questions, questionFile, handleSubmit])

  // Safety check for current question index
  useEffect(() => {
    if (questions && questions.length > 0 && (currentQuestionIndex < 0 || currentQuestionIndex >= questions.length)) {
      setCurrentQuestionIndex(0)
    }
  }, [currentQuestionIndex, questions])

  // Track pending students - First after 1 minute (registered with Spectre), then heartbeat every 2 min
  // 2 min interval = 4x fewer Vercel invocations vs 30s (saves monthly quota)
  useEffect(() => {
    if (status !== STATUS.RUNNING) return

    const ONE_MINUTE = 1 * 60 * 1000
    const TWO_MINUTES = 2 * 60 * 1000

    // 1. Initial trigger after 1 minute — register student with Spectre
    const initialTimer = setTimeout(() => {
      if (!pendingSentRef.current) {
        pendingSentRef.current = true  // WK-4: ref guard, never resets between renders
        savePendingStudent(studentName, null, {
          answers,
          currentQuestion: currentQuestionIndex + 1,
          answeredCount: Object.keys(answers).length,
          totalQuestions: questions.length,
          questionFile
        })
          .then((result) => {
            // WK-5: Re-anchor exam clock to SERVER time to defeat localStorage tampering
            // Server returns serverTimestamp = when the heartbeat was received (1 min into exam)
            if (result?.serverTimestamp) {
              const serverNow = new Date(result.serverTimestamp).getTime()
              // Exam really started ~1 minute before this heartbeat
              const serverExamStart = serverNow - ONE_MINUTE
              // Only recalibrate if the drift is more than 5s (avoids noise)
              if (Math.abs(examStartTimeRef.current - serverExamStart) > 5000) {
                console.warn('Clock recalibrated from server:', {
                  local: new Date(examStartTimeRef.current).toISOString(),
                  server: new Date(serverExamStart).toISOString()
                })
                examStartTimeRef.current = serverExamStart
              }
            }
          })
          .catch(err => console.error('Failed to save pending student (1 min):', err))
      }
    }, ONE_MINUTE)

    // 2. Heartbeat every 2 minutes (syncs answers for Spectre live view)
    // Was 30s → now 2min: saves ~75% Vercel function calls per exam
    const heartbeatInterval = setInterval(() => {
      savePendingStudent(studentName, null, {
        answers,
        currentQuestion: currentQuestionIndex + 1,
        answeredCount: Object.keys(answers).length,
        totalQuestions: questions.length,
        questionFile
      })
        .catch(err => console.error('Failed to send heartbeat:', err))
    }, TWO_MINUTES)

    return () => {
      clearTimeout(initialTimer)
      clearInterval(heartbeatInterval)
    }
  }, [status, studentName, answers, currentQuestionIndex, questions, questionFile])

  // Background sync for pending submissions (network reconnection handling)
  useEffect(() => {
    const cleanup = startBackgroundSync((progress) => {
      setSubmissionStatus(progress)
    })

    return cleanup
  }, [])

  // NOW we can do conditional returns after all hooks
  // Validate questions array AFTER all hooks (React rules)
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    console.error('MCQContainer: Invalid questions array', { questions })
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        flexDirection: 'column',
        gap: '16px',
        padding: '20px',
        backgroundColor: 'var(--gray-50)'
      }}>
        <div style={{ color: 'var(--error)', fontSize: '18px', textAlign: 'center' }} className="bengali">
          প্রশ্ন পাওয়া যায়নি। দয়া করে পৃষ্ঠাটি রিফ্রেশ করুন।
        </div>
        <div style={{ color: 'var(--gray-600)', fontSize: '14px', marginTop: '8px', textAlign: 'center' }}>
          {!questions ? 'Questions is null/undefined' :
            !Array.isArray(questions) ? 'Questions is not an array' :
              questions.length === 0 ? 'Questions array is empty' : 'Unknown error'}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '12px 24px',
            backgroundColor: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px',
            marginTop: '8px'
          }}
          className="bengali"
        >
          রিফ্রেশ করুন
        </button>
      </div>
    )
  }

  if (status === STATUS.SUBMITTED) {
    return (
      <ResultSummary
        questions={questions}
        answers={answers}
        studentName={studentName}
        score={calculateScore()}
        onRestart={() => window.location.reload()}
        questionFile={questionFile}
        submissionStatus={submissionStatus}
      />
    )
  }

  const safeIndex = Math.max(0, Math.min(currentQuestionIndex, questions.length - 1))
  const currentQuestion = questions[safeIndex]

  if (!currentQuestion) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh'
      }}>
        <div className="bengali">প্রশ্ন লোড হচ্ছে...</div>
      </div>
    )
  }

  try {
    return (
      <div className="mcq-container">
        <ExamHeader
          examName="MCQ Exam"
          timeLeft={timeLeft}
          totalQuestions={questions.length}
        />
        <div className="mcq-content">
          <div className="question-section">
            <QuestionCard
              question={currentQuestion}
              questionNumber={safeIndex + 1}
              selectedAnswer={answers[currentQuestion.id]}
              onAnswerSelect={handleAnswerSelect}
              onPrev={handlePrev}
              onNext={handleNext}
              canGoPrev={safeIndex > 0}
              canGoNext={safeIndex < questions.length - 1}
              onSubmit={handleSubmit}
              onExit={handleExit}
            />
          </div>
          <QuestionNavigator
            totalQuestions={questions.length}
            currentIndex={safeIndex}
            answers={answers}
            questions={questions}
            visitedQuestions={visitedQuestions}
            onQuestionJump={handleQuestionJump}
          />
        </div>

        <SubmissionStatus {...submissionStatus} />

        {/* Exit Confirm Popup */}
        {showExitConfirm && (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1000, padding: '20px'
            }}
            onClick={() => setShowExitConfirm(false)}
          >
            <div
              style={{
                background: 'white', borderRadius: '16px', padding: '32px 28px',
                maxWidth: '360px', width: '100%', textAlign: 'center',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
              <h3 className="bengali" style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '10px', color: '#1e293b' }}>
                পরীক্ষা থেকে বের হবেন?
              </h3>
              <p className="bengali" style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '24px' }}>
                এখন পর্যন্ত যতটুকু উত্তর দিয়েছেন সেটা সাবমিট হয়ে যাবে।
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  className="bengali"
                  onClick={() => setShowExitConfirm(false)}
                  style={{
                    flex: 1, padding: '12px', border: '1.5px solid #e2e8f0',
                    borderRadius: '10px', background: 'white', color: '#475569',
                    fontWeight: '600', fontSize: '1rem', cursor: 'pointer'
                  }}
                >
                  না, থাকব
                </button>
                <button
                  className="bengali"
                  onClick={() => { setShowExitConfirm(false); handleSubmit() }}
                  style={{
                    flex: 1, padding: '12px', border: 'none',
                    borderRadius: '10px', background: '#dc2626', color: 'white',
                    fontWeight: '700', fontSize: '1rem', cursor: 'pointer'
                  }}
                >
                  হ্যাঁ, সাবমিট
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  } catch (error) {
    console.error('MCQContainer render error:', error)
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        flexDirection: 'column',
        gap: '16px',
        padding: '20px'
      }}>
        <div style={{ color: 'var(--error)', fontSize: '18px' }} className="bengali">
          রেন্ডারিং ত্রুটি: {error.message}
        </div>
        <button onClick={() => window.location.reload()} className="bengali">
          রিফ্রেশ করুন
        </button>
      </div>
    )
  }
}

export default MCQContainer
