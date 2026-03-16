import { Stats } from '../types'

interface Props {
  stats: Stats
}

export default function StatsBar({ stats }: Props) {
  return (
    <div className="stats">
      <div className="stat">
        <div className="stat-label">Total</div>
        <div className="stat-value">{stats.total}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Pendentes</div>
        <div className="stat-value amber">{stats.pendentes}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Anexadas</div>
        <div className="stat-value green">{stats.anexadas}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Enviadas</div>
        <div className="stat-value blue">{stats.enviadas}</div>
      </div>
    </div>
  )
}
