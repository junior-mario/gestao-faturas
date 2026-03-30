interface Props {
  title: string
  onPrev: () => void
  onNext: () => void
  onOpenAddFatura: () => void
  onOpenConfig: () => void
  onLogout: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export default function Header({ title, onPrev, onNext, onOpenAddFatura, onOpenConfig, onLogout, theme, onToggleTheme }: Props) {
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
        <button className="action-btn" onClick={onToggleTheme}>
          Tema: {theme === 'dark' ? 'Escuro' : 'Claro'}
        </button>
        <button className="action-btn primary" onClick={onOpenAddFatura}>
          Nova fatura
        </button>
        <button className="action-btn" onClick={onOpenConfig}>
          Configuracao
        </button>
        <button className="action-btn" onClick={onLogout}>
          Sair
        </button>
        <div className="month-nav">
          <button className="nav-btn" onClick={onPrev} aria-label="Mes anterior" title="Mes anterior">
            <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button className="nav-btn" onClick={onNext} aria-label="Proximo mes" title="Proximo mes">
            <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <div className="header-date">
          Hoje: {day}/{month}/{year}
        </div>
      </div>
    </div>
  )
}
