import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '100vh',
          flexDirection: 'column',
          gap: '16px',
          padding: '20px'
        }}>
          <div style={{ color: 'var(--error)', fontSize: '18px' }} className="bengali">
            একটি ত্রুটি ঘটেছে
          </div>
          <div style={{ color: 'var(--gray-600)', fontSize: '14px' }}>
            {this.state.error?.message}
          </div>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              backgroundColor: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
            className="bengali"
          >
            রিফ্রেশ করুন
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary


