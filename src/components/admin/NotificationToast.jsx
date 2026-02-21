import { useEffect } from 'react'
import './NotificationToast.css'

function NotificationToast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, 5000)

    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`notification-toast ${type}`}>
      <div className="notification-content">
        <span className="notification-message bengali">{message}</span>
        <button className="notification-close" onClick={onClose}>✕</button>
      </div>
    </div>
  )
}

export default NotificationToast


