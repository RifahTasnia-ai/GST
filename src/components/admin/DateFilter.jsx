import './DateFilter.css'

function DateFilter({ dates, selectedDate, onDateSelect, groupedByDate }) {
  function formatDate(dateStr) {
    const date = new Date(dateStr)
    return date.toLocaleDateString('bn-BD', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="date-filter">
      <div className="date-filter-header">
        <h3 className="bengali">তারিখ অনুযায়ী ফিল্টার</h3>
        {selectedDate && (
          <button className="clear-filter-btn bengali" onClick={() => onDateSelect(null)}>
            ✕ সব দেখুন
          </button>
        )}
      </div>
      <div className="date-buttons">
        {dates.map(date => {
          const count = groupedByDate[date]?.length || 0
          return (
            <button
              key={date}
              className={`date-btn ${selectedDate === date ? 'active' : ''}`}
              onClick={() => onDateSelect(date)}
            >
              <span className="date-label bengali">{formatDate(date)}</span>
              <span className="date-count">{count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default DateFilter


