import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ExamHeader from './ExamHeader'
import QuestionCard from './QuestionCard'
import QuestionNavigator from './QuestionNavigator'
import ResultSummary from './ResultSummary'
import SubmissionStatus from './SubmissionStatus'
import { savePendingStudent } from '../utils/api'
import { processSubmission, queueSubmission, startBackgroundSync } from '../utils/SubmissionManager'
import './MCQContainer.css'

const STATUS = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  SUBMITTED: 'SUBMITTED',
}

const SAVE_THROTTLE_MS = 5000

function buildStorageCandidates(storageKey, legacyStorageKeys, studentName) {
  const uniqueKeys = Array.from(new Set([storageKey, ...(legacyStorageKeys || [])].filter(Boolean)))
  return uniqueKeys.map((key) => `${key}_${studentName}`)
}

function loadSavedState(storageKeys) {
  for (const key of storageKeys) {
    const saved = localStorage.getItem(key)
    if (!saved) continue

    try {
      return {
        storageItemKey: key,
        data: JSON.parse(saved),
      }
    } catch (error) {
      console.error('Failed to parse saved exam state', error)
    }
  }

  return null
}

function MCQContainer({ questions, studentName, questionFile = 'questions.json', examConfig }) {
  const durationSeconds = examConfig?.durationSeconds ?? 60 * 60
  const markPerQuestion = examConfig?.markPerQuestion ?? 1
  const negativeMarking = examConfig?.negativeMarking ?? 0.25
  const passMark = examConfig?.passMark ?? 60
  const storageKey = examConfig?.storageKey ?? 'mcq_state_questions_100'
  const legacyStorageKeys = examConfig?.legacyStorageKeys ?? []
  const totalMarks = examConfig?.totalMarks ?? Number((questions.length * markPerQuestion).toFixed(2))
  const storageCandidates = useMemo(
    () => buildStorageCandidates(storageKey, legacyStorageKeys, studentName),
    [storageKey, legacyStorageKeys, studentName]
  )
  const primaryStorageKey = storageCandidates[0]

  const [status, setStatus] = useState(STATUS.RUNNING)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [visitedQuestions, setVisitedQuestions] = useState(new Set([0]))
  const [timeLeft, setTimeLeft] = useState(durationSeconds)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [submissionStatus, setSubmissionStatus] = useState({ status: 'idle', retryCount: 0 })

  const pendingSentRef = useRef(false)
  const examStartTimeRef = useRef(null)
  const lastSaveRef = useRef(0)
  const saveTimerRef = useRef(null)
  const timeLeftRef = useRef(timeLeft)

  const examConfigSnapshot = useMemo(() => ({
    title: examConfig?.title || 'GST MCQ Exam',
    questionFile,
    totalQuestions: questions.length,
    totalMarks,
    durationSeconds,
    durationMinutes: Number((durationSeconds / 60).toFixed(2)),
    markPerQuestion,
    negativeMarking,
    passMark,
  }), [
    durationSeconds,
    examConfig?.title,
    markPerQuestion,
    negativeMarking,
    passMark,
    questionFile,
    questions.length,
    totalMarks,
  ])

  useEffect(() => {
    timeLeftRef.current = timeLeft
  }, [timeLeft])

  const handleAnswerSelect = useCallback((questionId, optionId) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }))
    setVisitedQuestions((prev) => new Set([...prev, currentQuestionIndex]))
  }, [currentQuestionIndex])

  const handleQuestionJump = useCallback((index) => {
    if (!questions || index < 0 || index >= questions.length) return
    setCurrentQuestionIndex(index)
    setVisitedQuestions((prev) => new Set([...prev, index]))
  }, [questions])

  const handlePrev = useCallback(() => {
    if (currentQuestionIndex <= 0) return

    setCurrentQuestionIndex((prev) => {
      const nextIndex = prev - 1
      setVisitedQuestions((prevVisited) => new Set([...prevVisited, nextIndex]))
      return nextIndex
    })
  }, [currentQuestionIndex])

  const handleNext = useCallback(() => {
    if (!questions || currentQuestionIndex >= questions.length - 1) return

    setCurrentQuestionIndex((prev) => {
      const nextIndex = prev + 1
      setVisitedQuestions((prevVisited) => new Set([...prevVisited, nextIndex]))
      return nextIndex
    })
  }, [currentQuestionIndex, questions])

  const calculateScore = useCallback(() => {
    if (!Array.isArray(questions) || questions.length === 0) {
      return { score: 0, correct: 0, wrong: 0, attempted: 0, total: 0, totalMarks: 0, subjectStats: {} }
    }

    let correct = 0
    let wrong = 0
    const subjectStats = {}

    questions.forEach((question) => {
      const subject = question.subject || 'General'
      if (!subjectStats[subject]) {
        subjectStats[subject] = { correct: 0, wrong: 0, attempted: 0, total: 0 }
      }

      subjectStats[subject].total += 1

      const selectedAnswer = answers[question.id]
      if (selectedAnswer === undefined) return

      subjectStats[subject].attempted += 1
      if (selectedAnswer === question.correctOptionId) {
        correct += 1
        subjectStats[subject].correct += 1
      } else {
        wrong += 1
        subjectStats[subject].wrong += 1
      }
    })

    Object.values(subjectStats).forEach((stats) => {
      stats.percentage = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
    })

    const score = Math.max(correct * markPerQuestion - wrong * negativeMarking, 0)

    return {
      score: Number(score.toFixed(2)),
      correct,
      wrong,
      attempted: correct + wrong,
      total: questions.length,
      totalMarks,
      subjectStats,
    }
  }, [answers, markPerQuestion, negativeMarking, questions, totalMarks])

  const saveStateToStorage = useCallback(() => {
    if (status !== STATUS.RUNNING || !primaryStorageKey) return

    const state = {
      answers,
      currentIndex: currentQuestionIndex,
      timeLeft: timeLeftRef.current,
      examStartTime: examStartTimeRef.current,
      visited: Array.from(visitedQuestions),
    }

    const now = Date.now()
    if (now - lastSaveRef.current >= SAVE_THROTTLE_MS) {
      localStorage.setItem(primaryStorageKey, JSON.stringify(state))
      lastSaveRef.current = now
      return
    }

    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(primaryStorageKey, JSON.stringify(state))
      lastSaveRef.current = Date.now()
    }, SAVE_THROTTLE_MS)
  }, [answers, currentQuestionIndex, primaryStorageKey, status, visitedQuestions])

  const handleSubmit = useCallback(async () => {
    if (status === STATUS.SUBMITTED) return

    const scoreData = calculateScore()
    const payload = {
      studentName,
      answers,
      score: scoreData.score,
      totalMarks,
      totalQuestions: questions.length,
      timestamp: new Date().toISOString(),
      attempted: scoreData.attempted,
      correct: scoreData.correct,
      wrong: scoreData.wrong,
      pass: scoreData.score >= passMark,
      passMark,
      markPerQuestion,
      negativeMarking,
      durationSeconds,
      durationMinutes: Number((durationSeconds / 60).toFixed(2)),
      examTitle: examConfigSnapshot.title,
      questionFile,
      subjectStats: scoreData.subjectStats,
      examConfigSnapshot,
      visited: Array.from(visitedQuestions),
    }

    const queueId = queueSubmission(payload)
    setStatus(STATUS.SUBMITTED)

    const queueItem = { id: queueId, payload, retryCount: 0 }

    processSubmission(queueItem, (progress) => {
      setSubmissionStatus(progress)

      if (progress.status === 'success') {
        storageCandidates.forEach((key) => localStorage.removeItem(key))
        localStorage.removeItem('exam_session_student')
      }
    }).catch((error) => {
      console.error('Submission error:', error)
    })
  }, [
    answers,
    calculateScore,
    durationSeconds,
    examConfigSnapshot,
    markPerQuestion,
    negativeMarking,
    passMark,
    questionFile,
    questions.length,
    status,
    storageCandidates,
    studentName,
    totalMarks,
  ])

  const handleExit = useCallback(() => {
    setShowExitConfirm(true)
  }, [])

  const syncLiveProgress = useCallback(async () => {
    if (status !== STATUS.RUNNING || !studentName) return null

    return savePendingStudent(studentName, null, {
      answers,
      currentQuestion: currentQuestionIndex + 1,
      answeredCount: Object.keys(answers).length,
      totalQuestions: questions.length || 0,
      questionFile,
      examTitle: examConfigSnapshot.title,
      durationSeconds,
      durationMinutes: Number((durationSeconds / 60).toFixed(2)),
      totalMarks,
      passMark,
      negativeMarking,
      markPerQuestion,
      examConfigSnapshot,
      visited: Array.from(visitedQuestions),
    })
  }, [
    answers,
    currentQuestionIndex,
    durationSeconds,
    examConfigSnapshot,
    markPerQuestion,
    negativeMarking,
    passMark,
    questionFile,
    questions.length,
    status,
    studentName,
    totalMarks,
  ])

  useEffect(() => {
    if (!questions || questions.length === 0 || !primaryStorageKey) return

    const savedState = loadSavedState(storageCandidates)
    if (savedState?.data) {
      const data = savedState.data
      setAnswers(data.answers || {})
      setVisitedQuestions(new Set(data.visited || [0]))
      setCurrentQuestionIndex(Math.min(data.currentIndex || 0, Math.max(questions.length - 1, 0)))

      if (data.examStartTime) {
        examStartTimeRef.current = data.examStartTime
        const elapsed = Math.floor((Date.now() - data.examStartTime) / 1000)
        setTimeLeft(Math.max(durationSeconds - elapsed, 0))
      } else {
        examStartTimeRef.current = Date.now()
        setTimeLeft(data.timeLeft ?? durationSeconds)
      }

      if (savedState.storageItemKey !== primaryStorageKey) {
        localStorage.setItem(primaryStorageKey, JSON.stringify(data))
      }

      return
    }

    examStartTimeRef.current = Date.now()
    setTimeLeft(durationSeconds)
  }, [durationSeconds, primaryStorageKey, questions, storageCandidates])

  useEffect(() => {
    saveStateToStorage()
    return () => clearTimeout(saveTimerRef.current)
  }, [saveStateToStorage])

  useEffect(() => {
    if (status !== STATUS.RUNNING) return undefined

    const interval = setInterval(() => {
      if (!examStartTimeRef.current) return

      const elapsed = Math.floor((Date.now() - examStartTimeRef.current) / 1000)
      const remaining = Math.max(durationSeconds - elapsed, 0)
      setTimeLeft(remaining)

      if (remaining <= 0) {
        handleSubmit()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [durationSeconds, handleSubmit, status])

  useEffect(() => {
    if (status !== STATUS.RUNNING) return undefined

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return

      if (examStartTimeRef.current) {
        const elapsed = Math.floor((Date.now() - examStartTimeRef.current) / 1000)
        const remaining = Math.max(durationSeconds - elapsed, 0)
        setTimeLeft(remaining)

        if (remaining <= 0) {
          handleSubmit()
          return
        }
      }

      syncLiveProgress().catch((error) => console.error('Visibility heartbeat failed:', error))
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [durationSeconds, handleSubmit, status, syncLiveProgress])

  useEffect(() => {
    if (!questions || questions.length === 0) return

    if (currentQuestionIndex < 0 || currentQuestionIndex >= questions.length) {
      setCurrentQuestionIndex(0)
    }
  }, [currentQuestionIndex, questions])

  useEffect(() => {
    if (status !== STATUS.RUNNING || !questions?.length) return

    if (!pendingSentRef.current) {
      pendingSentRef.current = true
      syncLiveProgress().catch((error) => console.error('Failed to register live session:', error))
    }

    syncLiveProgress().catch((error) => console.error('Failed to sync live progress:', error))
  }, [questions, status, syncLiveProgress])

  useEffect(() => {
    if (status !== STATUS.RUNNING) return undefined

    const heartbeatInterval = setInterval(() => {
      syncLiveProgress().catch((error) => console.error('Failed to send heartbeat:', error))
    }, 2000)

    return () => clearInterval(heartbeatInterval)
  }, [status, syncLiveProgress])

  useEffect(() => {
    const cleanup = startBackgroundSync((progress) => {
      setSubmissionStatus(progress)
    })

    return cleanup
  }, [])

  if (!Array.isArray(questions) || questions.length === 0) {
    console.error('MCQContainer: Invalid questions array', { questions })
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          flexDirection: 'column',
          gap: '16px',
          padding: '20px',
          backgroundColor: 'var(--gray-50)',
        }}
      >
        <div style={{ color: 'var(--error)', fontSize: '18px', textAlign: 'center' }} className="bengali">
          প্রশ্ন পাওয়া যায়নি। দয়া করে পৃষ্ঠাটি রিফ্রেশ করুন।
        </div>
        <div style={{ color: 'var(--gray-600)', fontSize: '14px', marginTop: '8px', textAlign: 'center' }}>
          {!questions ? 'Questions is null/undefined' : !Array.isArray(questions) ? 'Questions is not an array' : 'Questions array is empty'}
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
            marginTop: '8px',
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
        examConfig={examConfigSnapshot}
      />
    )
  }

  const safeIndex = Math.max(0, Math.min(currentQuestionIndex, questions.length - 1))
  const currentQuestion = questions[safeIndex]

  if (!currentQuestion) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="bengali">প্রশ্ন লোড হচ্ছে...</div>
      </div>
    )
  }

  try {
    return (
      <div className="mcq-container">
        <ExamHeader
          examName={examConfigSnapshot.title}
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

        {showExitConfirm && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '20px',
            }}
            onClick={() => setShowExitConfirm(false)}
          >
            <div
              style={{
                background: 'white',
                borderRadius: '16px',
                padding: '32px 28px',
                maxWidth: '360px',
                width: '100%',
                textAlign: 'center',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              }}
              onClick={(event) => event.stopPropagation()}
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
                    flex: 1,
                    padding: '12px',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '10px',
                    background: 'white',
                    color: '#475569',
                    fontWeight: '600',
                    fontSize: '1rem',
                    cursor: 'pointer',
                  }}
                >
                  না, থাকব
                </button>
                <button
                  className="bengali"
                  onClick={() => {
                    setShowExitConfirm(false)
                    handleSubmit()
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: 'none',
                    borderRadius: '10px',
                    background: '#dc2626',
                    color: 'white',
                    fontWeight: '700',
                    fontSize: '1rem',
                    cursor: 'pointer',
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          flexDirection: 'column',
          gap: '16px',
          padding: '20px',
        }}
      >
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
