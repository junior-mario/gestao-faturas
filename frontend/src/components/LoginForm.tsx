import { FormEvent, useState } from 'react'
import { api, AuthUser } from '../api'

interface Props {
  onLoginSuccess: (user: AuthUser) => void
}

export default function LoginForm({ onLoginSuccess }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await api.login(username.trim(), password)
      const me = await api.me()
      onLoginSuccess(me)
    } catch (err) {
      console.error(err)
      setError('Usuario ou senha invalidos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">Gestao de Faturas</h1>
        <p className="auth-subtitle">Acesso restrito para a area administrativa.</p>

        <label className="form-label">Usuario</label>
        <input
          type="text"
          className="form-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />

        <label className="form-label" style={{ marginTop: '10px' }}>Senha</label>
        <input
          type="password"
          className="form-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {error && <div className="validation-msg err" style={{ marginTop: '12px' }}>{error}</div>}

        <button className="btn confirm auth-submit" type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
