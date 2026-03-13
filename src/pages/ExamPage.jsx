import { useState, useEffect } from 'react'
import MCQContainer from '../components/MCQContainer'
import StartScreen from '../components/StartScreen'
import ErrorBoundary from '../components/ErrorBoundary'
import NotificationToast from '../components/admin/NotificationToast'
import { getActiveQuestionFile } from '../utils/api'
import { getExamConfig } from '../utils/examConfig'

const STUDENT_NOTICE_SEEN_KEY = 'student_notice_seen_id'

function ExamPage() {
  const [studentName, setStudentName] = useState(() => {
    const savedName = localStorage.getItem('exam_session_student')
    if (!savedName) return ''

    const hasSession =
      localStorage.getItem(`mcq_state_v100_${savedName}`) ||
      localStorage.getItem(`mcq_state_v50_${savedName}`)

    return hasSession ? savedName : ''
  })

  const [questions, setQuestions] = useState([])
  const [questionFile, setQuestionFile] = useState('questions.json')
  const [examConfig, setExamConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [studentNoticeToast, setStudentNoticeToast] = useState(null)

  useEffect(() => {
    loadQuestions()
  }, [])

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const activeConfig = await getActiveQuestionFile()
        maybeShowStudentNotice(activeConfig?.studentNotice)
      } catch {
        // Ignore background polling errors
      }
    }, 45 * 1000)

    return () => clearInterval(interval)
  }, [])

  function maybeShowStudentNotice(notice) {
    if (!notice || !notice.id) return

    const seenId = localStorage.getItem(STUDENT_NOTICE_SEEN_KEY)
    if (seenId === notice.id) return

    localStorage.setItem(STUDENT_NOTICE_SEEN_KEY, notice.id)
    setStudentNoticeToast({
      message: notice.message || 'New exam update available. Please follow teacher instructions.',
      type: 'success'
    })
  }

  function renderWithNotice(content) {
    return (
      <>
        {content}
        {studentNoticeToast && (
          <NotificationToast
            message={studentNoticeToast.message}
            type={studentNoticeToast.type}
            onClose={() => setStudentNoticeToast(null)}
          />
        )}
      </>
    )
  }

  async function loadQuestions() {
    try {
      const activeConfig = await getActiveQuestionFile()
      const file = activeConfig.activeFile || 'questions.json'
      maybeShowStudentNotice(activeConfig?.studentNotice)

      setQuestionFile(file)

      const cacheBuster = `t=${Date.now()}`
      const fileUrl = `/api/get-questions?file=${encodeURIComponent(file)}&${cacheBuster}`

      const res = await fetch(fileUrl, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      })

      if (!res.ok) {
        throw new Error(`Failed to load questions: ${res.status} ${res.statusText}`)
      }

      const contentType = res.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        // Just in case it returns something weird - -
      }

      const data = await res.json()
      const questionList = Array.isArray(data) ? data : data?.questions

      if (!Array.isArray(questionList) || questionList.length === 0) {
        throw new Error('No questions found in file')
      }

      const transformed = questionList.map(q => ({
        id: q.id,
        question: q.question,
        options: Object.entries(q.options).map(([id, text]) => ({ id, text })),
        correctOptionId: q.correctAnswer,
        explanation: q.explanation || `সঠিক উত্তর: ${q.correctAnswer}. ${q.question}`,
        hasDiagram: q.hasDiagram || false,
        svg_code: q.svg_code || null,
        questionImage: q.questionImage ?? q.image ?? null,
        explanationImage: q.explanationImage ?? null,
        subject: q.subject || ''
      }))

      if (transformed.length === 0) {
        throw new Error('No valid questions found after processing')
      }

      setQuestions(transformed)
      setExamConfig(getExamConfig(transformed.length))
      setLoading(false)
    } catch (err) {
      console.error('Error loading questions:', err)
      setError(err.message)
      setLoading(false)
    }
  }

  if (loading) {
    return renderWithNotice(
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="bengali">প্রশ্ন লোড হচ্ছে...</div>
      </div>
    )
  }

  if (error) {
    return renderWithNotice(
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: '100vh', flexDirection: 'column', gap: '16px',
        padding: '20px', textAlign: 'center'
      }}>
        <div style={{ color: 'var(--error)', fontSize: '18px' }} className="bengali">
          প্রশ্ন লোড করতে সমস্যা হয়েছে
        </div>
        <div style={{ color: 'var(--gray-600)', fontSize: '14px', marginTop: '8px' }}>
          {error}
        </div>
        <button
          onClick={loadQuestions}
          style={{
            padding: '12px 24px', backgroundColor: 'var(--primary)', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', marginTop: '16px'
          }}
          className="bengali"
        >
          আবার চেষ্টা করুন
        </button>
      </div>
    )
  }

  if (!studentName) {
    return renderWithNotice(
      <StartScreen
        onStart={(name) => {
          localStorage.setItem('exam_session_student', name)
          setStudentName(name)
        }}
        examConfig={examConfig}
      />
    )
  }

  return renderWithNotice(
    <ErrorBoundary>
      <MCQContainer
        questions={questions}
        studentName={studentName}
        questionFile={questionFile}
        examConfig={examConfig}
      />
    </ErrorBoundary>
  )
}

export default ExamPage
