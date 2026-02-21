import { useEffect, useRef } from 'react'
import './PerformanceChart.css'

function PerformanceChart({ correct, wrong, unanswered }) {
    const canvasRef = useRef(null)
    const total = correct + wrong + unanswered

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        const centerX = canvas.width / 2
        const centerY = canvas.height / 2
        const radius = 70

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // Calculate angles
        const correctAngle = (correct / total) * 2 * Math.PI
        const wrongAngle = (wrong / total) * 2 * Math.PI

        let currentAngle = -Math.PI / 2 // Start from top

        // Draw correct segment
        if (correct > 0) {
            ctx.beginPath()
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + correctAngle)
            ctx.lineTo(centerX, centerY)
            ctx.fillStyle = '#10b981'
            ctx.fill()
            currentAngle += correctAngle
        }

        // Draw wrong segment
        if (wrong > 0) {
            ctx.beginPath()
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + wrongAngle)
            ctx.lineTo(centerX, centerY)
            ctx.fillStyle = '#ef4444'
            ctx.fill()
            currentAngle += wrongAngle
        }

        // Draw unanswered segment
        if (unanswered > 0) {
            ctx.beginPath()
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + (unanswered / total) * 2 * Math.PI)
            ctx.lineTo(centerX, centerY)
            ctx.fillStyle = '#9ca3af'
            ctx.fill()
        }

        // Draw center circle (donut hole)
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius - 30, 0, 2 * Math.PI)
        ctx.fillStyle = 'white'
        ctx.fill()

    }, [correct, wrong, unanswered, total])

    return (
        <div className="performance-chart">
            <h3 className="chart-title bengali">উত্তর বন্টন</h3>
            <div className="chart-container">
                <canvas
                    ref={canvasRef}
                    width="200"
                    height="200"
                    className="chart-canvas"
                />
                <div className="chart-center">
                    <div className="chart-total">{total}</div>
                    <div className="chart-label bengali">প্রশ্ন</div>
                </div>
            </div>
            <div className="chart-legend">
                <div className="legend-item">
                    <span className="legend-dot correct"></span>
                    <span className="legend-text bengali">সঠিক ({correct})</span>
                </div>
                <div className="legend-item">
                    <span className="legend-dot wrong"></span>
                    <span className="legend-text bengali">ভুল ({wrong})</span>
                </div>
                <div className="legend-item">
                    <span className="legend-dot unanswered"></span>
                    <span className="legend-text bengali">উত্তরহীন ({unanswered})</span>
                </div>
            </div>
        </div>
    )
}

export default PerformanceChart
