import { useState, useEffect } from 'react'
import { Fatura } from '../types'
import { api } from '../api'
import { formatDate, MONTH_NAMES } from '../App'
import UploadZone from './UploadZone'
import { buildBillingEmailBody, buildBillingEmailSubject } from '../emailTemplate'

interface Props {
  fatura: Fatura
  ano: number
  mes: number
  onClose: () => void
  onSaved: () => void
}

interface Validation {
  ok: boolean
  warn?: boolean
  msg: string
}

export default function FaturaModal({ fatura, ano, mes, onClose, onSaved }: Props) {
  const m = fatura.monthly
  const [valorOverride, setValorOverride] = useState(m?.valor_override || '')
  const [emissao, setEmissao] = useState(m?.emissao || '')
  const [vencimento, setVencimento] = useState(m?.vencimento || '')
  const [files, setFiles] = useState<File[]>([])
  const [validation, setValidation] = useState<Validation | null>(null)
  const [saving, setSaving] = useState(false)
  const existingFiles = m?.arquivos || []

  useEffect(() => {
    if (!emissao) {
      setValidation(null)
      return
    }
    const v = validateDates(emissao, vencimento, ano, mes)
    setValidation(v)
  }, [emissao, vencimento, ano, mes])

  function handleOverlayClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).className.includes('modal-overlay')) onClose()
  }

  function handleAddFiles(newFiles: File[]) {
    setFiles((prev) => [...prev, ...newFiles])
  }

  function handleRemoveNew(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function doSave() {
    await api.updateMonthly(fatura.id, ano, mes, {
      valor_override: valorOverride || undefined,
      emissao: emissao || undefined,
      vencimento: vencimento || undefined,
    })
    for (const file of files) {
      await api.uploadFile(fatura.id, ano, mes, file)
    }
  }

  async function handleSave() {
    if (!validation || !validation.ok) {
      alert('Corrija as datas antes de salvar.')
      return
    }
    setSaving(true)
    try {
      await doSave()
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAndSend() {
    if (!validation || !validation.ok) {
      alert('Corrija as datas antes de enviar.')
      return
    }
    setSaving(true)
    try {
      await doSave()

      const mesName = MONTH_NAMES[mes - 1]
      const valorEmail = valorOverride || fatura.valor
      const config = await api.getAppConfig()

      let downloadLink: string | null = null
      const hasFiles = existingFiles.length > 0 || files.length > 0
      if (hasFiles) {
        downloadLink = `${config.public_url}${api.downloadPagePath(fatura.id, ano, mes)}`
      }

      const emailInput = {
        nome: fatura.nome,
        mesName,
        ano,
        valor: valorEmail,
        conta: fatura.conta && fatura.conta !== '-' ? fatura.conta : null,
        emissao: emissao ? formatDate(emissao) : null,
        vencimento: vencimento ? formatDate(vencimento) : null,
        downloadLink,
      }
      const subject = encodeURIComponent(
        buildBillingEmailSubject(emailInput, config.email_subject_template),
      )
      const fullBody = encodeURIComponent(
        buildBillingEmailBody(emailInput, config.email_body_template),
      )

      window.open(`mailto:nfe@quintadabaroneza.com.br?subject=${subject}&body=${fullBody}`, '_blank')

      await api.markEmailSent(fatura.id, ano, mes)
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar e enviar.')
    } finally {
      setSaving(false)
    }
  }

  const hasAnyFile = existingFiles.length > 0 || files.length > 0

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal">
        <div className="modal-title">Registrar Fatura - {fatura.nome}</div>

        <div className="modal-info-grid">
          <div className="modal-info">
            <span className="modal-info-label">Valor padrao</span>
            <span className="modal-info-value">{fatura.valor}</span>
          </div>
          <div className="modal-info">
            <span className="modal-info-label">Dia previsto</span>
            <span className="modal-info-value">Dia {fatura.dia}</span>
          </div>
        </div>

        <div className="divider" />

        <div className="form-group">
          <label className="form-label">Valor desta fatura (deixe vazio para manter o padrao)</label>
          <input
            type="text"
            className="form-input"
            placeholder={fatura.valor}
            value={valorOverride}
            onChange={(e) => setValorOverride(e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Data de emissao *</label>
            <input
              type="date"
              className="form-input"
              value={emissao}
              onChange={(e) => setEmissao(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Data de vencimento</label>
            <input
              type="date"
              className="form-input"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </div>
        </div>

        {validation && (
          <div className={`validation-msg ${validation.ok ? (validation.warn ? 'warn' : 'ok') : 'err'}`}>
            {validation.msg}
          </div>
        )}

        <div className="divider" />

        <div className="form-group">
          <label className="form-label">Arquivos da fatura (PDF/imagem)</label>
          <UploadZone
            files={files}
            existingNames={existingFiles}
            onAddFiles={handleAddFiles}
            onRemoveNew={handleRemoveNew}
          />
        </div>

        {existingFiles.length > 0 && (
          <div className="email-hint">
            {existingFiles.length} arquivo(s) registrado(s).
            <br />
            Ao clicar em "Salvar e Enviar Email", o Outlook abrira com assunto, corpo e links para download das faturas ja preenchidos.
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn confirm" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          {hasAnyFile && (
            <button className="btn send-email" onClick={handleSaveAndSend} disabled={saving}>
              Salvar e Enviar Email
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function validateDates(emissao: string, vencimento: string, ano: number, mes: number): Validation {
  if (!emissao) return { ok: false, msg: 'Informe a data de emissao.' }

  const em = new Date(`${emissao}T12:00:00`)
  const emM = em.getMonth() + 1
  const emY = em.getFullYear()

  const prevMes = mes === 1 ? 12 : mes - 1
  const prevAno = mes === 1 ? ano - 1 : ano

  const isCurrentMonth = emM === mes && emY === ano
  const isPrevMonth = emM === prevMes && emY === prevAno

  if (!isCurrentMonth && !isPrevMonth) {
    return {
      ok: false,
      msg: `Data de emissao fora do periodo esperado (${MONTH_NAMES[prevMes - 1]}/${prevAno} ou ${MONTH_NAMES[mes - 1]}/${ano}).`,
    }
  }

  if (vencimento) {
    const vc = new Date(`${vencimento}T12:00:00`)
    if (vc < em) return { ok: false, msg: 'Vencimento nao pode ser anterior a emissao.' }
  }

  if (isCurrentMonth) return { ok: true, msg: `Fatura referente ao mes de ${MONTH_NAMES[mes - 1]}/${ano}. OK!` }
  return { ok: true, warn: true, msg: `Fatura de ${MONTH_NAMES[prevMes - 1]}/${prevAno} - mes anterior, mas aceita.` }
}
