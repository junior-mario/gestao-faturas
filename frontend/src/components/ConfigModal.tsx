import { useEffect, useMemo, useState } from 'react'
import { api, AuthUser, UserItem } from '../api'
import {
  DEFAULT_EMAIL_BODY_TEMPLATE,
  DEFAULT_EMAIL_SUBJECT_TEMPLATE,
  EMAIL_TEMPLATE_HELP,
} from '../emailTemplate'

interface Props {
  onClose: () => void
  currentUser: AuthUser | null
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function normalizeEmailList(value: string): string {
  const items = value
    .split(/[,\n;]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
  return Array.from(new Set(items)).join(', ')
}

function getInvalidEmails(value: string): string[] {
  const items = value
    .split(/[,\n;]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return items.filter((item) => !emailRegex.test(item))
}

export default function ConfigModal({ onClose, currentUser }: Props) {
  const isAdmin = Boolean(currentUser?.is_admin)

  const [publicUrl, setPublicUrl] = useState('')
  const [emailSubjectTemplate, setEmailSubjectTemplate] = useState('')
  const [emailBodyTemplate, setEmailBodyTemplate] = useState('')
  const [emailTestTo, setEmailTestTo] = useState('')

  const [initialPublicUrl, setInitialPublicUrl] = useState('')
  const [initialSubjectTemplate, setInitialSubjectTemplate] = useState('')
  const [initialBodyTemplate, setInitialBodyTemplate] = useState('')
  const [initialEmailTestTo, setInitialEmailTestTo] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [myOldPassword, setMyOldPassword] = useState('')
  const [myNewPassword, setMyNewPassword] = useState('')
  const [myConfirmPassword, setMyConfirmPassword] = useState('')
  const [myPassSaving, setMyPassSaving] = useState(false)
  const [myPassError, setMyPassError] = useState<string | null>(null)
  const [myPassSuccess, setMyPassSuccess] = useState<string | null>(null)

  const [users, setUsers] = useState<UserItem[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)

  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newIsAdmin, setNewIsAdmin] = useState(false)
  const [newUserSaving, setNewUserSaving] = useState(false)
  const [newUserError, setNewUserError] = useState<string | null>(null)
  const [newUserSuccess, setNewUserSuccess] = useState<string | null>(null)

  const [resetPasswords, setResetPasswords] = useState<Record<number, string>>({})
  const [resetSavingId, setResetSavingId] = useState<number | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const config = await api.getAppConfig(true)
        if (!active) return

        setPublicUrl(config.public_url)
        setEmailSubjectTemplate(config.email_subject_template)
        setEmailBodyTemplate(config.email_body_template)
        setEmailTestTo(config.email_test_to)

        setInitialPublicUrl(config.public_url)
        setInitialSubjectTemplate(config.email_subject_template)
        setInitialBodyTemplate(config.email_body_template)
        setInitialEmailTestTo(config.email_test_to)
      } catch {
        if (active) setError('Nao foi possivel carregar as configuracoes.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    let active = true
    ;(async () => {
      setUsersLoading(true)
      setUsersError(null)
      try {
        const list = await api.getUsers()
        if (!active) return
        setUsers(list)
      } catch {
        if (active) setUsersError('Nao foi possivel carregar os usuarios.')
      } finally {
        if (active) setUsersLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [isAdmin])

  const normalizedPublicUrl = useMemo(() => normalizeUrl(publicUrl), [publicUrl])
  const changed = useMemo(() => {
    return (
      normalizedPublicUrl !== normalizeUrl(initialPublicUrl) ||
      emailSubjectTemplate !== initialSubjectTemplate ||
      emailBodyTemplate !== initialBodyTemplate ||
      normalizeEmailList(emailTestTo) !== normalizeEmailList(initialEmailTestTo)
    )
  }, [
    normalizedPublicUrl,
    initialPublicUrl,
    emailSubjectTemplate,
    initialSubjectTemplate,
    emailBodyTemplate,
    initialBodyTemplate,
    emailTestTo,
    initialEmailTestTo,
  ])

  const validationError = useMemo(() => {
    if (!normalizedPublicUrl) return 'Informe uma URL base.'
    if (!/^https?:\/\//i.test(normalizedPublicUrl)) return 'A URL base deve comecar com http:// ou https://.'
    if (!emailSubjectTemplate.trim()) return 'Informe o template de assunto.'
    if (!emailBodyTemplate.trim()) return 'Informe o template de corpo do email.'
    if (!normalizeEmailList(emailTestTo)) return 'Informe pelo menos um email destinatario para envio.'
    const invalidEmails = getInvalidEmails(emailTestTo)
    if (invalidEmails.length > 0) return `Email(s) invalido(s): ${invalidEmails.join(', ')}`
    return null
  }, [normalizedPublicUrl, emailSubjectTemplate, emailBodyTemplate, emailTestTo])

  function handleOverlayClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).className.includes('modal-overlay')) onClose()
  }

  async function handleSaveConfig() {
    setSuccess(null)
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const saved = await api.updateAppConfig({
        public_url: normalizedPublicUrl,
        email_subject_template: emailSubjectTemplate,
        email_body_template: emailBodyTemplate,
        email_test_to: normalizeEmailList(emailTestTo),
      })
      setPublicUrl(saved.public_url)
      setEmailSubjectTemplate(saved.email_subject_template)
      setEmailBodyTemplate(saved.email_body_template)
      setEmailTestTo(saved.email_test_to)

      setInitialPublicUrl(saved.public_url)
      setInitialSubjectTemplate(saved.email_subject_template)
      setInitialBodyTemplate(saved.email_body_template)
      setInitialEmailTestTo(saved.email_test_to)
      setSuccess('Configuracoes atualizadas com sucesso.')
    } catch (err) {
      console.error(err)
      setError('Nao foi possivel salvar as configuracoes.')
    } finally {
      setSaving(false)
    }
  }

  function restoreDefaultTemplate() {
    setEmailSubjectTemplate(DEFAULT_EMAIL_SUBJECT_TEMPLATE)
    setEmailBodyTemplate(DEFAULT_EMAIL_BODY_TEMPLATE)
  }

  async function handleChangeMyPassword() {
    setMyPassError(null)
    setMyPassSuccess(null)

    if (!myOldPassword.trim() || !myNewPassword.trim() || !myConfirmPassword.trim()) {
      setMyPassError('Preencha senha atual, nova senha e confirmacao.')
      return
    }
    if (myNewPassword.length < 6) {
      setMyPassError('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (myNewPassword !== myConfirmPassword) {
      setMyPassError('A confirmacao da nova senha nao confere.')
      return
    }

    setMyPassSaving(true)
    try {
      await api.changeMyPassword(myOldPassword, myNewPassword)
      setMyOldPassword('')
      setMyNewPassword('')
      setMyConfirmPassword('')
      setMyPassSuccess('Sua senha foi alterada com sucesso.')
    } catch (err) {
      console.error(err)
      setMyPassError('Nao foi possivel alterar sua senha. Verifique a senha atual.')
    } finally {
      setMyPassSaving(false)
    }
  }

  async function handleCreateUser() {
    setNewUserError(null)
    setNewUserSuccess(null)
    if (!newUsername.trim()) {
      setNewUserError('Informe o usuario.')
      return
    }
    if (newPassword.trim().length < 6) {
      setNewUserError('A senha do novo usuario deve ter pelo menos 6 caracteres.')
      return
    }

    setNewUserSaving(true)
    try {
      const created = await api.createUser({
        username: newUsername.trim(),
        password: newPassword,
        is_admin: newIsAdmin,
      })
      setUsers((prev) => [...prev, created].sort((a, b) => a.username.localeCompare(b.username)))
      setNewUsername('')
      setNewPassword('')
      setNewIsAdmin(false)
      setNewUserSuccess('Usuario criado com sucesso.')
    } catch (err) {
      console.error(err)
      setNewUserError('Nao foi possivel criar o usuario.')
    } finally {
      setNewUserSaving(false)
    }
  }

  async function handleResetUserPassword(userId: number) {
    const newPass = (resetPasswords[userId] || '').trim()
    setResetError(null)
    setResetSuccess(null)
    if (newPass.length < 6) {
      setResetError('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }

    setResetSavingId(userId)
    try {
      await api.updateUserPassword(userId, newPass)
      setResetPasswords((prev) => ({ ...prev, [userId]: '' }))
      setResetSuccess('Senha do usuario alterada com sucesso.')
    } catch (err) {
      console.error(err)
      setResetError('Nao foi possivel alterar a senha do usuario.')
    } finally {
      setResetSavingId(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal" style={{ maxWidth: '780px' }}>
        <div className="modal-title">Configuracoes do Sistema</div>

        <div className="email-hint" style={{ marginTop: 0 }}>
          URL base e modelo de email usado no envio das faturas.
        </div>

        <div className="form-group" style={{ marginTop: '12px' }}>
          <label className="form-label">URL base do sistema</label>
          <input
            type="url"
            className="form-input"
            placeholder="https://faturas.seudominio.com"
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
            disabled={loading || saving}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Destinatario(s) dos emails (envio e teste)</label>
          <textarea
            className="form-input"
            style={{ minHeight: '82px', resize: 'vertical' }}
            placeholder="email1@dominio.com, email2@dominio.com"
            value={emailTestTo}
            onChange={(e) => setEmailTestTo(e.target.value)}
            disabled={loading || saving}
          />
          <div className="email-hint" style={{ marginTop: '6px' }}>
            Aceita um ou mais emails separados por virgula, ponto e virgula ou linha. Este campo e usado no botao Email e no Teste HTML.
          </div>
        </div>

        <div className="divider" />

        <div className="form-group">
          <label className="form-label">Template do assunto</label>
          <input
            type="text"
            className="form-input"
            value={emailSubjectTemplate}
            onChange={(e) => setEmailSubjectTemplate(e.target.value)}
            disabled={loading || saving}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Template do corpo do email</label>
          <textarea
            className="form-input"
            style={{ minHeight: '220px', resize: 'vertical' }}
            value={emailBodyTemplate}
            onChange={(e) => setEmailBodyTemplate(e.target.value)}
            disabled={loading || saving}
          />
        </div>

        <div className="email-hint" style={{ whiteSpace: 'pre-wrap' }}>
          {EMAIL_TEMPLATE_HELP}
        </div>

        <div style={{ marginTop: '10px' }}>
          <button className="action-btn" type="button" onClick={restoreDefaultTemplate} disabled={loading || saving}>
            Restaurar modelo padrao
          </button>
        </div>

        {error && <div className="validation-msg err" style={{ marginTop: '12px' }}>{error}</div>}
        {success && <div className="validation-msg ok" style={{ marginTop: '12px' }}>{success}</div>}

        <div className="modal-footer">
          <button className="btn confirm" onClick={handleSaveConfig} disabled={loading || saving || !changed}>
            {saving ? 'Salvando...' : 'Salvar configuracoes'}
          </button>
        </div>

        <div className="divider" />

        <div className="modal-title" style={{ fontSize: '15px' }}>Seguranca - Minha senha</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Senha atual</label>
            <input
              type="password"
              className="form-input"
              value={myOldPassword}
              onChange={(e) => setMyOldPassword(e.target.value)}
              disabled={myPassSaving}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Nova senha</label>
            <input
              type="password"
              className="form-input"
              value={myNewPassword}
              onChange={(e) => setMyNewPassword(e.target.value)}
              disabled={myPassSaving}
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Confirmar nova senha</label>
          <input
            type="password"
            className="form-input"
            value={myConfirmPassword}
            onChange={(e) => setMyConfirmPassword(e.target.value)}
            disabled={myPassSaving}
          />
        </div>
        <button className="action-btn primary" type="button" onClick={handleChangeMyPassword} disabled={myPassSaving}>
          {myPassSaving ? 'Alterando...' : 'Alterar minha senha'}
        </button>
        {myPassError && <div className="validation-msg err" style={{ marginTop: '10px' }}>{myPassError}</div>}
        {myPassSuccess && <div className="validation-msg ok" style={{ marginTop: '10px' }}>{myPassSuccess}</div>}

        {isAdmin && (
          <>
            <div className="divider" />
            <div className="modal-title" style={{ fontSize: '15px' }}>Usuarios</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Novo usuario</label>
                <input
                  type="text"
                  className="form-input"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  disabled={newUserSaving}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Senha inicial</label>
                <input
                  type="password"
                  className="form-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={newUserSaving}
                />
              </div>
            </div>

            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={newIsAdmin}
                onChange={(e) => setNewIsAdmin(e.target.checked)}
                disabled={newUserSaving}
              />
              Usuario administrador
            </label>

            <button className="action-btn primary" type="button" onClick={handleCreateUser} disabled={newUserSaving}>
              {newUserSaving ? 'Criando...' : 'Criar usuario'}
            </button>
            {newUserError && <div className="validation-msg err" style={{ marginTop: '10px' }}>{newUserError}</div>}
            {newUserSuccess && <div className="validation-msg ok" style={{ marginTop: '10px' }}>{newUserSuccess}</div>}

            <div className="divider" />
            <div className="form-label" style={{ marginBottom: '6px' }}>Usuarios cadastrados</div>
            {usersLoading && <div className="loading" style={{ padding: '12px' }}>Carregando usuarios...</div>}
            {usersError && <div className="validation-msg err">{usersError}</div>}
            {!usersLoading && !usersError && (
              <div style={{ display: 'grid', gap: '8px' }}>
                {users.map((user) => (
                  <div key={user.id} style={{ border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
                    <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                      <strong>{user.username}</strong> {user.is_admin ? '(admin)' : ''}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="password"
                        className="form-input"
                        placeholder="Nova senha"
                        value={resetPasswords[user.id] || ''}
                        onChange={(e) => setResetPasswords((prev) => ({ ...prev, [user.id]: e.target.value }))}
                        disabled={resetSavingId === user.id}
                      />
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => handleResetUserPassword(user.id)}
                        disabled={resetSavingId === user.id}
                      >
                        {resetSavingId === user.id ? 'Salvando...' : 'Alterar senha'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {resetError && <div className="validation-msg err" style={{ marginTop: '10px' }}>{resetError}</div>}
            {resetSuccess && <div className="validation-msg ok" style={{ marginTop: '10px' }}>{resetSuccess}</div>}
          </>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
