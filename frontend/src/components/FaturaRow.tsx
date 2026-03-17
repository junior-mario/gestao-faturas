import { useRef, useState } from 'react'
import { Fatura } from '../types'
import { getStatus, getStatusLabel, formatDate } from '../App'
import { api } from '../api'

interface Props {
  fatura: Fatura
  ano: number
  mes: number
  onOpenModal: (f: Fatura) => void
  onReload: () => void
  onNotify: (message: string) => void
}

export default function FaturaRow({ fatura, ano, mes, onOpenModal, onReload, onNotify }: Props) {
  const st = getStatus(fatura)
  const m = fatura.monthly
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorDialogText, setErrorDialogText] = useState('')
  const [copyFeedback, setCopyFeedback] = useState('')
  const errorTextRef = useRef<HTMLTextAreaElement | null>(null)

  const now = new Date()
  const currentDay = now.getDate()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  function getDayClass() {
    if (ano !== currentYear || mes !== currentMonth) return ''
    if (fatura.dia < currentDay) return 'past'
    if (fatura.dia === currentDay) return 'today'
    if (fatura.dia - currentDay <= 3) return 'soon'
    return ''
  }

  async function handleSendEmail() {
    try {
      await api.markEmailSent(fatura.id, ano, mes)
      onReload()
      onNotify('Email enviado com sucesso.')
    } catch (err) {
      console.error(err)
      const message = err instanceof Error ? err.message : String(err)
      setErrorDialogText(`Erro ao enviar email.\n\n${message}`)
      setCopyFeedback('')
      setErrorDialogOpen(true)
    }
  }

  async function handleSendHtmlTest() {
    try {
      const res = await api.sendHtmlTestEmail(fatura.id, ano, mes)
      alert(`Email HTML de teste enviado para ${res.to}.`)
    } catch (err) {
      console.error(err)
      const message = err instanceof Error ? err.message : String(err)
      setErrorDialogText(`Erro ao enviar email HTML de teste.\n\n${message}`)
      setCopyFeedback('')
      setErrorDialogOpen(true)
    }
  }

  async function handleCopyError() {
    if (!errorDialogText) return
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(errorDialogText)
        setCopyFeedback('Copiado para a area de transferencia.')
        return
      }
    } catch {
      // fallback below
    }

    if (errorTextRef.current) {
      errorTextRef.current.focus()
      errorTextRef.current.select()
      const copied = document.execCommand('copy')
      setCopyFeedback(copied ? 'Copiado para a area de transferencia.' : 'Selecione o texto e copie manualmente.')
      return
    }

    setCopyFeedback('Selecione o texto e copie manualmente.')
  }

  async function handleReset() {
    if (!confirm('Resetar status desta fatura?')) return
    await api.resetMonthly(fatura.id, ano, mes)
    onReload()
  }

  return (
    <>
      <tr className={st === 'sent' ? 'row-sent' : ''}>
        <td style={{ fontWeight: 500 }}>{fatura.nome}</td>
        <td className="cell-conta">{fatura.conta}</td>
        <td className={fatura.moeda === 'USD' ? 'currency-usd' : 'currency-brl'} style={{ fontVariantNumeric: 'tabular-nums', fontSize: '12px' }}>
          {m?.valor_override ? (
            <span title={`Padrao: ${fatura.valor}`}>
              {m.valor_override}
            </span>
          ) : fatura.valor}
        </td>
        <td>
          <span className={`day-badge ${getDayClass()}`}>{fatura.dia}</span>
        </td>
        <td>
          <span className={`badge ${st}`}>{getStatusLabel(st)}</span>
        </td>
        <td className="cell-date">{formatDate(m?.emissao)}</td>
        <td className="cell-date">{formatDate(m?.vencimento)}</td>
        <td className="cell-arquivo">
          {m?.arquivos && m.arquivos.length > 0 ? (
            <div className="file-list-compact">
              {m.arquivos.map((name, idx) => (
                <a key={idx} href={api.downloadUrl(fatura.id, ano, mes, idx)} target="_blank" rel="noreferrer" className="file-link" title={name}>
                  {m.arquivos.length === 1 ? name : `${idx + 1}. ${name}`}
                </a>
              ))}
            </div>
          ) : '-'}
        </td>
        <td>
          <div className="btn-group">
            <button className="action-btn primary" onClick={() => onOpenModal(fatura)}>
              Anexar
            </button>
            {(st === 'uploaded' || st === 'sent') && (
              <button className="action-btn blue" onClick={handleSendEmail}>
                Email
              </button>
            )}
            {(st === 'uploaded' || st === 'sent') && (
              <button className="action-btn" onClick={handleSendHtmlTest}>
                Teste HTML
              </button>
            )}
            {st !== 'pending' && (
              <button className="action-btn" onClick={handleReset} title="Resetar">
                Reset
              </button>
            )}
          </div>
        </td>
      </tr>

      {errorDialogOpen && (
        <div className="modal-overlay" onClick={() => setErrorDialogOpen(false)}>
          <div className="modal error-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Erro no envio de email HTML</div>
            <p className="email-hint">Copie o detalhe abaixo para analise.</p>
            <textarea
              ref={errorTextRef}
              className="error-textarea"
              value={errorDialogText}
              readOnly
            />
            <div className="modal-footer">
              {copyFeedback ? <span className="copy-feedback">{copyFeedback}</span> : <span />}
              <button className="btn" onClick={() => setErrorDialogOpen(false)}>
                Fechar
              </button>
              <button className="btn confirm" onClick={handleCopyError}>
                Copiar erro
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
