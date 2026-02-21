import './DateSectionCard.css'

function DateSectionCard({ date, count, passCount, failCount, onView }) {
  function formatDate(dateStr) {
    const date = new Date(dateStr)
    return date.toLocaleDateString('bn-BD', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="date-section-card" onClick={onView}>
      <div className="date-section-header">
        <h3 className="date-section-title bengali">{formatDate(date)}</h3>
        <span className="date-section-count">{count}</span>
      </div>
      <div className="date-section-stats">
        <div className="date-stat-item">
          <span className="date-stat-label bengali">পাস:</span>
          <span className="date-stat-value pass">{passCount}</span>
        </div>
        <div className="date-stat-item">
          <span className="date-stat-label bengali">ফেল:</span>
          <span className="date-stat-value fail">{failCount}</span>
        </div>
      </div>
      <button className="view-date-btn bengali">বিস্তারিত দেখুন →</button>
    </div>
  )
}

export default DateSectionCard


