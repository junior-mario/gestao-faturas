const BASE = '/api'
const TOKEN_KEY = 'gestao_faturas_token'

export interface AppConfig {
  public_url: string
  email_subject_template: string
  email_body_template: string
}

export interface AuthUser {
  id: number
  username: string
  is_admin: boolean
}

export interface UserItem {
  id: number
  username: string
  is_admin: boolean
  created_at: string
}

let _appConfig: AppConfig | null = null

class UnauthorizedError extends Error {
  status: number

  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedError'
    this.status = 401
  }
}

type RequestOptions = RequestInit & {
  skipAuth?: boolean
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  _appConfig = null
}

function emitUnauthorizedEvent(): void {
  window.dispatchEvent(new CustomEvent('auth:unauthorized'))
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries())
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  return { ...headers }
}

async function request<T>(url: string, options?: RequestOptions): Promise<T> {
  const { skipAuth, ...fetchOptions } = options || {}
  const headers = normalizeHeaders(fetchOptions.headers)

  if (!skipAuth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${url}`, {
    ...fetchOptions,
    headers,
  })

  if (!res.ok) {
    const text = await res.text()
    if (res.status === 401) {
      emitUnauthorizedEvent()
      throw new UnauthorizedError(text || 'Nao autenticado')
    }
    throw new Error(`API error ${res.status}: ${text}`)
  }

  if (res.status === 204) {
    return undefined as T
  }

  return res.json()
}

async function getAppConfig(forceRefresh: boolean = false): Promise<AppConfig> {
  if (!forceRefresh && _appConfig) return _appConfig
  const config = await request<AppConfig>('/config')
  _appConfig = config
  return config
}

async function updateAppConfig(payload: Partial<AppConfig>): Promise<AppConfig> {
  const config = await request<AppConfig>('/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  _appConfig = config
  return config
}

async function getPublicUrl(): Promise<string> {
  const config = await getAppConfig()
  return config.public_url
}

async function updatePublicUrl(publicUrl: string): Promise<string> {
  const config = await updateAppConfig({ public_url: publicUrl })
  return config.public_url
}

export const api = {
  getToken,
  clearToken,
  isUnauthorizedError(err: unknown) {
    return err instanceof UnauthorizedError
  },

  async login(username: string, password: string) {
    const token = await request<{ access_token: string; token_type: string; expires_at: string }>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      skipAuth: true,
    })
    setToken(token.access_token)
    return token
  },

  async me() {
    return request<AuthUser>('/auth/me')
  },

  async logout() {
    try {
      if (getToken()) {
        await request<{ ok: boolean }>('/auth/logout', { method: 'POST' })
      }
    } finally {
      clearToken()
    }
  },

  async changeMyPassword(oldPassword: string, newPassword: string) {
    return request<{ ok: boolean }>('/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword,
      }),
    })
  },

  async getUsers() {
    return request<UserItem[]>('/auth/users')
  },

  async createUser(payload: { username: string; password: string; is_admin: boolean }) {
    return request<UserItem>('/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },

  async updateUserPassword(userId: number, newPassword: string) {
    return request<{ ok: boolean }>(`/auth/users/${userId}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword }),
    })
  },

  getAppConfig,
  updateAppConfig,
  getPublicUrl,
  updatePublicUrl,

  getMonthly(ano: number, mes: number) {
    return request<import('./types').Fatura[]>(`/monthly?ano=${ano}&mes=${mes}`)
  },

  getStats(ano: number, mes: number) {
    return request<import('./types').Stats>(`/stats?ano=${ano}&mes=${mes}`)
  },

  updateMonthly(faturaId: number, ano: number, mes: number, data: { valor_override?: string; emissao?: string; vencimento?: string }) {
    return request<import('./types').Monthly>(`/monthly/${faturaId}?ano=${ano}&mes=${mes}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  uploadFile(faturaId: number, ano: number, mes: number, file: File) {
    const form = new FormData()
    form.append('file', file)
    return request<import('./types').Monthly>(`/monthly/${faturaId}/upload?ano=${ano}&mes=${mes}`, {
      method: 'POST',
      body: form,
    })
  },

  markEmailSent(faturaId: number, ano: number, mes: number) {
    return request<import('./types').Monthly>(`/monthly/${faturaId}/email?ano=${ano}&mes=${mes}`, {
      method: 'POST',
    })
  },

  resetMonthly(faturaId: number, ano: number, mes: number) {
    return request<{ ok: boolean }>(`/monthly/${faturaId}/reset?ano=${ano}&mes=${mes}`, {
      method: 'DELETE',
    })
  },

  downloadUrl(faturaId: number, ano: number, mes: number, idx: number = 0) {
    return `${BASE}/monthly/${faturaId}/download?ano=${ano}&mes=${mes}&idx=${idx}`
  },

  downloadPagePath(faturaId: number, ano: number, mes: number) {
    return `${BASE}/monthly/${faturaId}/page/${ano}/${mes}`
  },
}
