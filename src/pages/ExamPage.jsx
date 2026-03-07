import { useEffect, useState } from 'react'
import MCQContainer from '../components/MCQContainer'
import StartScreen from '../components/StartScreen'
import ErrorBoundary from '../components/ErrorBoundary'
import NotificationToast from '../components/admin/NotificationToast'
import { getActiveQuestionFile } from '../utils/api'
import { parseQuestionSetPayload } from '../utils/examConfig'

const STUDENT_NOTICE_SEEN_KEY = 'student_notice_seen_id'
const EXAM_SESSION_STUDENT_KEY = 'exam_session_student'

function hasSavedExamSession(studentName) {
  if (!studentName) return false

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key || !key.startsWith('mcq_state_')) continue
      if (key.endsWith(`_${studentName}`)) {
        return true
      }
    }
  } catch (error) {
    console.error('Failed to inspect saved exam sessions', error)
  }

  return false
}

function ExamPage() {
  const [studentName, setStudentName] = useState(() => {
    const savedName = localStorage.getItem(EXAM_SESSION_STUDENT_KEY)
    if (!savedName) return ''
    return hasSavedExamSession(savedName) ? savedName : ''
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
      type: 'success',
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
      setLoading(true)
      setError(null)

      const activeConfig = await getActiveQuestionFile()
      const file = activeConfig.activeFile || 'questions.json'
      maybeShowStudentNotice(activeConfig?.studentNotice)

      setQuestionFile(file)

      const cacheBuster = `?t=${Date.now()}`
      const fileUrl = `/${file}${cacheBuster}`

      const res = await fetch(fileUrl, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      })

      if (!res.ok) {
        throw new Error(`Failed to load questions: ${res.status} ${res.statusText}`)
      }

      const contentType = res.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`File ${file} is not a JSON file. Got content-type: ${contentType}`)
      }

      const payload = await res.json()
      const parsed = parseQuestionSetPayload(payload, { questionFile: file })

      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        throw new Error('No valid questions found after processing')
      }

      setQuestions(parsed.questions)
      setExamConfig(parsed.examConfig)
    } catch (err) {
      console.error('Error loading questions:', err)
      setError(err.message)
    } finally {
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          flexDirection: 'column',
          gap: '16px',
          padding: '20px',
          textAlign: 'center',
        }}
      >
        <div style={{ color: 'var(--error)', fontSize: '18px' }} className="bengali">
          প্রশ্ন লোড করতে সমস্যা হয়েছে
        </div>
        <div style={{ color: 'var(--gray-600)', fontSize: '14px', marginTop: '8px' }}>
          {error}
        </div>
        <button
          onClick={loadQuestions}
          style={{
            padding: '12px 24px',
            backgroundColor: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px',
            marginTop: '16px',
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
          localStorage.setItem(EXAM_SESSION_STUDENT_KEY, name)
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
