import { useMemo } from 'react'
import './SubjectPerformanceChart.css'

// Subject name mapping to Bengali
const SUBJECT_NAMES = {
    'Physics': 'পদার্থবিজ্ঞান',
    'Chemistry': 'রসায়ন',
    'ICT': 'আইসিটি',
    'Mathematics': 'গণিত'
}

function SubjectPerformanceChart({ questions, studentAnswers }) {
    // Calculate subject-wise performance
    const subjectStats = useMemo(() => {
        const stats = {}

        // Initialize stats for all subjects
        questions.forEach(q => {
            const subject = q.subject || 'Other'
            if (!stats[subject]) {
                stats[subject] = {
                    total: 0,
                    correct: 0,
                    wrong: 0,
                    unanswered: 0
                }
            }
            stats[subject].total++

            const studentAnswer = studentAnswers[q.id]

            if (studentAnswer === undefined || studentAnswer === null) {
                stats[subject].unanswered++
            } else if (studentAnswer === q.correctAnswer) {
                stats[subject].correct++
            } else {
                stats[subject].wrong++
            }
        })

        // Calculate percentage for each subject
        Object.keys(stats).forEach(subject => {
            const s = stats[subject]
            s.percentage = s.total > 0 ? (s.correct / s.total) * 100 : 0
        })

        return stats
    }, [questions, studentAnswers])

    // Sort subjects by name for consistent display
    const sortedSubjects = Object.keys(subjectStats).sort()

    // Helper to determine performance level
    const getPerformanceLevel = (percentage) => {
        if (percentage >= 80) return 'excellent'
        if (percentage >= 60) return 'good'
        if (percentage >= 40) return 'average'
        return 'poor'
    }

    const getPerformanceText = (percentage) => {
        if (percentage >= 80) return 'অসাধারণ'
        if (percentage >= 60) return 'ভালো'
        if (percentage >= 40) return 'মোটামুটি'
        return 'দুর্বল'
    }

    return (
        <div className="subject-performance-chart">
            <h3 className="chart-title bengali">
                <span className="chart-icon">📊</span>
                বিষয়ভিত্তিক পারদর্শিতা বিশ্লেষণ
            </h3>

            <div className="subjects-grid">
                {sortedSubjects.map(subject => {
                    const stats = subjectStats[subject]
                    const performanceLevel = getPerformanceLevel(stats.percentage)
                    const subjectNameBengali = SUBJECT_NAMES[subject] || subject

                    return (
                        <div key={subject} className="subject-card-compact">
                            <div className="subject-header-compact">
                                <span className="subject-name-compact bengali">{subjectNameBengali}</span>
                                <span className={`performance-badge-compact ${performanceLevel} bengali`}>
                                    {stats.percentage.toFixed(0)}%
                                </span>
                            </div>

                            <div className="progress-bar-container-compact">
                                <div
                                    className={`progress-bar-compact ${performanceLevel}`}
                                    style={{ width: `${stats.percentage}%` }}
                                />
                            </div>

                            <div className="stats-row-compact bengali">
                                <span className="stat-item correct" title="সঠিক">
                                    ✓ {stats.correct}
                                </span>
                                <span className="stat-item wrong" title="ভুল">
                                    ✗ {stats.wrong}
                                </span>
                                <span className="stat-item total" title="মোট">
                                    📝 {stats.total}
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Summary */}
            <div className="performance-summary bengali">
                <div className="summary-item">
                    <span className="summary-label">মোট প্রশ্ন:</span>
                    <span className="summary-value">{questions.length}</span>
                </div>
                <div className="summary-item">
                    <span className="summary-label">উত্তর দেওয়া হয়েছে:</span>
                    <span className="summary-value">{Object.keys(studentAnswers).length}</span>
                </div>
            </div>
        </div>
    )
}

export default SubjectPerformanceChart
