interface Props {
  title: string
  onPrev: () => void
  onNext: () => void
  onOpenConfig: () => void
  onLogout: () => void
}

export default function Header({ title, onPrev, onNext, onOpenConfig, onLogout }: Props) {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()

  return (
    <div className="header">
      <div>
        <div className="header-title">{title}</div>
        <div className="header-sub">Quinta da Baroneza - Departamento de TI</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button className="action-btn" onClick={onOpenConfig}>
          Configuracao
        </button>
        <button className="action-btn" onClick={onLogout}>
          Sair
        </button>
        <div className="month-nav">
          <button className="nav-btn" onClick={onPrev}>{'<'}</button>
          <button className="nav-btn" onClick={onNext}>{'>'}</button>
        </div>
        <div style={{ fontSize: '12px', color: '#666' }}>
          Hoje: {day}/{month}/{year}
        </div>
      </div>
    </div>
  )
}
