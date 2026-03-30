import { useState, useEffect, useCallback, useRef } from 'react'
import { api, AuthUser } from './api'
import { Fatura, Stats, StatusFilter } from './types'
import Header from './components/Header'
import StatsBar from './components/StatsBar'
import FilterBar from './components/FilterBar'
import FaturaTable from './components/FaturaTable'
import FaturaModal from './components/FaturaModal'
import AddFaturaModal from './components/AddFaturaModal'
import ConfigModal from './components/ConfigModal'
import LoginForm from './components/LoginForm'

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const EMPTY_STATS: Stats = { total: 0, pendentes: 0, anexadas: 0, enviadas: 0 }
type ThemeMode = 'light' | 'dark'

export default function App() {
  const now = new Date()
  const [ano, setAno] = useState(now.getFullYear())
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [faturas, setFaturas] = useState<Fatura[]>([])
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  const [filterGrupo, setFilterGrupo] = useState('Todos')
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('Todos')
  const [search, setSearch] = useState('')
  const [modalFatura, setModalFatura] = useState<Fatura | null>(null)
  const [addFaturaOpen, setAddFaturaOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [authReady, setAuthReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [footerNotice, setFooterNotice] = useState<string | null>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('gestao_faturas_theme')
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  const clearManagementState = useCallback(() => {
    setConfigOpen(false)
    setModalFatura(null)
    setAddFaturaOpen(false)
    setFaturas([])
    setStats(EMPTY_STATS)
    setCurrentUser(null)
  }, [])

  const handleLogout = useCallback(async () => {
    await api.logout()
    clearManagementState()
    setAuthenticated(false)
    setAuthReady(true)
  }, [clearManagementState])

  const showFooterNotice = useCallback((message: string) => {
    setFooterNotice(message)
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current)
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setFooterNotice(null)
      noticeTimerRef.current = null
    }, 4500)
  }, [])

  useEffect(() => {
    const onUnauthorized = () => {
      api.clearToken()
      clearManagementState()
      setAuthenticated(false)
      setAuthReady(true)
    }
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => {
      window.removeEventListener('auth:unauthorized', onUnauthorized)
    }
  }, [clearManagementState])

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('gestao_faturas_theme', theme)
  }, [theme])

  useEffect(() => {
    let active = true
    ;(async () => {
      const token = api.getToken()
      if (!token) {
        if (active) {
          setAuthenticated(false)
          setCurrentUser(null)
          setAuthReady(true)
        }
        return
      }

      try {
        const me = await api.me()
        if (active) {
          setCurrentUser(me)
          setAuthenticated(true)
        }
      } catch (err) {
        console.error('Falha ao validar sessao:', err)
        api.clearToken()
        if (active) {
          setCurrentUser(null)
          setAuthenticated(false)
        }
      } finally {
        if (active) setAuthReady(true)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const reload = useCallback(async () => {
    if (!authenticated) return
    try {
      const [fList, sList] = await Promise.all([
        api.getMonthly(ano, mes),
        api.getStats(ano, mes),
      ])
      setFaturas(fList)
      setStats(sList)
    } catch (err) {
      if (!api.isUnauthorizedError(err)) {
        console.error('Failed to load data:', err)
      }
    } finally {
      setLoading(false)
    }
  }, [ano, mes, authenticated])

  useEffect(() => {
    if (!authenticated) return
    setLoading(true)
    reload()
  }, [reload, authenticated])

  const grupos = ['Todos', ...Array.from(new Set(faturas.map((f) => f.grupo)))]

  const filtered = faturas.filter((f) => {
    if (filterGrupo !== 'Todos' && f.grupo !== filterGrupo) return false
    if (filterStatus !== 'Todos') {
      const st = getStatus(f)
      if (filterStatus === 'Faltam Enviar' && st === 'sent') return false
      if (filterStatus === 'Pendente' && st !== 'pending') return false
      if (filterStatus === 'Anexada' && st !== 'uploaded') return false
      if (filterStatus === 'Enviada' && st !== 'sent') return false
    }
    if (search) {
      const q = search.toLowerCase()
      if (!f.nome.toLowerCase().includes(q) && !f.conta.toLowerCase().includes(q)) return false
    }
    return true
  })

  function prevMonth() {
    if (mes === 1) {
      setMes(12)
      setAno(ano - 1)
      return
    }
    setMes(mes - 1)
  }

  function nextMonth() {
    if (mes === 12) {
      setMes(1)
      setAno(ano + 1)
      return
    }
    setMes(mes + 1)
  }

  if (!authReady) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="loading">Verificando sessao...</div>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <LoginForm
        onLoginSuccess={(user) => {
          setCurrentUser(user)
          setAuthenticated(true)
          setAuthReady(true)
        }}
      />
    )
  }

  return (
    <div className="app-container">
      <Header
        title={`Gestao de Faturas - ${MONTH_NAMES[mes - 1]} ${ano}`}
        onPrev={prevMonth}
        onNext={nextMonth}
        onOpenAddFatura={() => setAddFaturaOpen(true)}
        onOpenConfig={() => setConfigOpen(true)}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
      />
      <StatsBar stats={stats} />
      <FilterBar
        grupos={grupos}
        filterGrupo={filterGrupo}
        filterStatus={filterStatus}
        search={search}
        onGrupo={setFilterGrupo}
        onStatus={setFilterStatus}
        onSearch={setSearch}
      />
      {loading ? (
        <div className="loading">Carregando...</div>
      ) : (
        <FaturaTable
          faturas={filtered}
          ano={ano}
          mes={mes}
          onOpenModal={setModalFatura}
          onReload={reload}
          onNotify={showFooterNotice}
        />
      )}
      {modalFatura && (
        <FaturaModal
          fatura={modalFatura}
          ano={ano}
          mes={mes}
          onClose={() => setModalFatura(null)}
          onSaved={reload}
          onNotify={showFooterNotice}
        />
      )}
      {addFaturaOpen && (
        <AddFaturaModal
          onClose={() => setAddFaturaOpen(false)}
          onCreated={async (nomeFatura) => {
            setAddFaturaOpen(false)
            setLoading(true)
            await reload()
            showFooterNotice(`Fatura "${nomeFatura}" criada com sucesso.`)
          }}
        />
      )}
      {configOpen && (
        <ConfigModal
          onClose={() => setConfigOpen(false)}
          currentUser={currentUser}
        />
      )}
      {footerNotice && (
        <div className="footer-notice" role="status" aria-live="polite">
          {footerNotice}
        </div>
      )}
    </div>
  )
}

export function getStatus(f: Fatura): 'pending' | 'uploaded' | 'sent' {
  if (!f.monthly) return 'pending'
  if (f.monthly.enviada) return 'sent'
  if (f.monthly.arquivos && f.monthly.arquivos.length > 0) return 'uploaded'
  if (f.monthly.emissao) return 'uploaded'
  return 'pending'
}

export function getStatusLabel(st: string): string {
  if (st === 'sent') return 'Enviada'
  if (st === 'uploaded') return 'Anexada'
  return 'Pendente'
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '-'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export { MONTH_NAMES }
