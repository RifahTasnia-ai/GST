import './StatisticsCard.css'

function StatisticsCard({ submissions, groupedByDate }) {
  const total = submissions.length
  const passCount = submissions.filter(s => s.pass).length
  const failCount = total - passCount
  const avgScore = total > 0 
    ? (submissions.reduce((sum, s) => sum + (s.score || 0), 0) / total).toFixed(2)
    : 0

  const today = new Date().toISOString().split('T')[0]
  const todaySubmissions = groupedByDate[today] || []
  const todayCount = todaySubmissions.length
  const todayPass = todaySubmissions.filter(s => s.pass).length

  return (
    <div className="statistics-card">
      <h2 className="statistics-title bengali">সারাংশ</h2>
      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-icon">📊</div>
          <div className="stat-value">{total}</div>
          <div className="stat-label bengali">মোট উত্তর</div>
        </div>
        <div className="stat-box success">
          <div className="stat-icon">✓</div>
          <div className="stat-value">{passCount}</div>
          <div className="stat-label bengali">পাস</div>
        </div>
        <div className="stat-box error">
          <div className="stat-icon">✗</div>
          <div className="stat-value">{failCount}</div>
          <div className="stat-label bengali">ফেল</div>
        </div>
        <div className="stat-box primary">
          <div className="stat-icon">⭐</div>
          <div className="stat-value">{avgScore}</div>
          <div className="stat-label bengali">গড় স্কোর</div>
        </div>
        <div className="stat-box">
          <div className="stat-icon">📅</div>
          <div className="stat-value">{todayCount}</div>
          <div className="stat-label bengali">আজকের উত্তর</div>
        </div>
        <div className="stat-box success">
          <div className="stat-icon">✓</div>
          <div className="stat-value">{todayPass}</div>
          <div className="stat-label bengali">আজকের পাস</div>
        </div>
      </div>
    </div>
  )
}

export default StatisticsCard


