import { useState, useEffect } from 'react'
import MCQContainer from '../components/MCQContainer'
import StartScreen from '../components/StartScreen'
import ErrorBoundary from '../components/ErrorBoundary'
import { getActiveQuestionFile } from '../utils/api'

function ExamPage() {
  const [studentName, setStudentName] = useState(() => {
    // Check localStorage for saved session
    const savedName = localStorage.getItem('exam_session_student')
    const savedSession = savedName ? localStorage.getItem(`mcq_state_v100_${savedName}`) : null
    return savedSession ? savedName : ''
  })
  const [questions, setQuestions] = useState([])
  const [questionFile, setQuestionFile] = useState('questions.json')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadQuestions()
  }, [])

  async function loadQuestions() {
    try {
      const activeConfig = await getActiveQuestionFile()
      const file = activeConfig.activeFile || 'questions.json'

      setQuestionFile(file)

      const cacheBuster = `?t=${Date.now()}`
      const fileUrl = `/${file}${cacheBuster}`

      const res = await fetch(fileUrl, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      })

      if (!res.ok) {
        throw new Error(`Failed to load questions: ${res.status} ${res.statusText}`)
      }

      const contentType = res.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`File ${file} is not a JSON file. Got content-type: ${contentType}`)
      }

      const data = await res.json()

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('No questions found in file')
      }

      const transformed = data.map(q => ({
        id: q.id,
        question: q.question,
        options: Object.entries(q.options).map(([id, text]) => ({ id, text })),
        correctOptionId: q.correctAnswer,
        explanation: q.explanation || `সঠিক উত্তর: ${q.correctAnswer}. ${q.question}`,
        hasDiagram: q.hasDiagram || false,
        svg_code: q.svg_code || null,
        subject: q.subject || ''
      }))

      if (transformed.length === 0) {
        throw new Error('No valid questions found after processing')
      }

      setQuestions(transformed)
      setLoading(false)
    } catch (err) {
      console.error('Error loading questions:', err)
      setError(err.message)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="bengali">প্রশ্ন লোড হচ্ছে...</div>
      </div>
    )
  }

  if (error) {
    return (
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
    return <StartScreen onStart={(name) => {
      localStorage.setItem('exam_session_student', name)
      setStudentName(name)
    }} />
  }

  return (
    <ErrorBoundary>
      <MCQContainer questions={questions} studentName={studentName} questionFile={questionFile} />
    </ErrorBoundary>
  )
}

export default ExamPage
