import './AdminHeader.css'

function AdminHeader({
  searchTerm,
  onSearchChange,
  onRefresh,
  totalSubmissions,
  lastRefresh,
  autoRefresh,
  onAutoRefreshToggle,
  loading
}) {
  function formatTime(date) {
    if (!date) return ''
    return date.toLocaleTimeString('bn-BD', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <header className="admin-header">
      <div className="admin-header-content">
        <div>
          <h1 className="admin-title bengali">Admin Dashboard</h1>
          <p className="admin-subtitle bengali">
            মোট উত্তর: {totalSubmissions} | শেষ আপডেট: {formatTime(lastRefresh)}
          </p>
        </div>
        <div className="admin-actions">
          <div className="search-box">
            <input
              type="text"
              placeholder="নাম দিয়ে খুঁজুন..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="bengali"
            />
          </div>
          <button
            className="refresh-btn"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? '⏳' : '🔄'} <span className="bengali">রিফ্রেশ</span>
          </button>
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => onAutoRefreshToggle(e.target.checked)}
            />
            <span className="bengali">অটো রিফ্রেশ</span>
          </label>
        </div>
      </div>
    </header>
  )
}

export default AdminHeader


