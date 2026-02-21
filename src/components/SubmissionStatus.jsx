import { useEffect, useState } from 'react'
import './SubmissionStatus.css'

function SubmissionStatus({ status, retryCount, nextRetryIn, error }) {
    const [isVisible, setIsVisible] = useState(true)
    const [isManuallyDismissed, setIsManuallyDismissed] = useState(false)

    // Auto-hide success message after 3 seconds
    useEffect(() => {
        if (status === 'success') {
            const timer = setTimeout(() => {
                setIsVisible(false)
            }, 3000)
            return () => clearTimeout(timer)
        } else {
            setIsVisible(true)
        }
    }, [status])

    // Reset manual dismiss when status changes
    useEffect(() => {
        setIsManuallyDismissed(false)
    }, [status])

    if (status === 'idle' || (status === 'success' && !isVisible) || isManuallyDismissed) {
        return null
    }

    const handleClose = () => {
        setIsManuallyDismissed(true)
    }

    const getStatusText = () => {
        switch (status) {
            case 'success':
                return 'সফলভাবে জমা হয়েছে'

            case 'submitting':
                return retryCount === 0 ? 'উত্তরপত্র জমা দেওয়া হচ্ছে...' : `পুনরায় চেষ্টা করা হচ্ছে (${retryCount})...`

            case 'retrying':
                const seconds = Math.ceil(nextRetryIn / 1000)
                return `নেটওয়ার্ক সমস্যা। ${seconds} সেকেন্ডে পুনরায় চেষ্টা করা হবে... (চেষ্টা ${retryCount}/10)`

            case 'failed':
                return 'সাবমিট করতে ব্যর্থ হয়েছে। দয়া করে পেজ রিফ্রেশ করুন।'

            default:
                return 'জমা দেওয়া হচ্ছে...'
        }
    }

    const getIcon = () => {
        switch (status) {
            case 'success':
                return null
            case 'submitting':
                return null
            case 'retrying':
                return null
            case 'failed':
                return null
            default:
                return null
        }
    }

    const statusClass = status === 'failed' ? 'error' : status === 'retrying' ? 'warning' : status === 'success' ? 'success' : 'info'

    return (
        <div className={`submission-status ${statusClass}`}>
            <div className="submission-status-content">
                {getIcon() && <span className="submission-icon">{getIcon()}</span>}
                <span className="submission-text bengali">{getStatusText()}</span>
                <button
                    className="submission-close-btn"
                    onClick={handleClose}
                    aria-label="Close notification"
                >
                    ×
                </button>
            </div>
            {status === 'retrying' && (
                <div className="submission-progress">
                    <div className="progress-bar" style={{ animationDuration: `${nextRetryIn}ms` }}></div>
                </div>
            )}
        </div>
    )
}

export default SubmissionStatus
