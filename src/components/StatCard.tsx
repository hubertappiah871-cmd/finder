import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  tone?: 'navy' | 'gold' | 'green' | 'red' | 'blue'
}

export default function StatCard({ icon: Icon, label, value, tone = 'navy' }: StatCardProps) {
  return (
    <div className="stat-card">
      <span className={`stat-card__icon stat-card__icon--${tone}`}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <div className="stat-card__text">
        <p className="stat-card__value">{value}</p>
        <p className="stat-card__label">{label}</p>
      </div>
    </div>
  )
}
