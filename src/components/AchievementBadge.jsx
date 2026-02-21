import './AchievementBadge.css'

function AchievementBadge({ score, accuracy }) {
    const getBadgeInfo = () => {
        if (accuracy >= 90) {
            return {
                type: 'gold',
                icon: 'G',
                title: 'স্বর্ণ পদক',
                subtitle: 'অসাধারণ!',
                gradient: 'var(--gradient-gold)'
            }
        } else if (accuracy >= 75) {
            return {
                type: 'silver',
                icon: 'S',
                title: 'রৌপ্য পদক',
                subtitle: 'চমৎকার!',
                gradient: 'var(--gradient-silver)'
            }
        } else if (accuracy >= 60) {
            return {
                type: 'bronze',
                icon: 'B',
                title: 'ব্রোঞ্জ পদক',
                subtitle: 'ভালো!',
                gradient: 'var(--gradient-bronze)'
            }
        } else {
            return {
                type: 'participation',
                icon: 'P',
                title: 'অংশগ্রহণ',
                subtitle: 'চেষ্টা চালিয়ে যান!',
                gradient: 'var(--gradient-primary)'
            }
        }
    }

    const badge = getBadgeInfo()

    return (
        <div className={`achievement-badge ${badge.type}`}>
            <div className="badge-glow"></div>
            <div className="badge-icon">{badge.icon}</div>
            <div className="badge-content">
                <div className="badge-title bengali">{badge.title}</div>
                <div className="badge-subtitle bengali">{badge.subtitle}</div>
            </div>
        </div>
    )
}

export default AchievementBadge
