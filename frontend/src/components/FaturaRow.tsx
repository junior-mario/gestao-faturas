import { Fatura } from '../types'
import { getStatus, getStatusLabel, formatDate } from '../App'
import { api } from '../api'
import { buildBillingEmailBody, buildBillingEmailSubject } from '../emailTemplate'

interface Props {
  fatura: Fatura
  ano: number
  mes: number
  onOpenModal: (f: Fatura) => void
  onReload: () => void
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export default function FaturaRow({ fatura, ano, mes, onOpenModal, onReload }: Props) {
  const st = getStatus(fatura)
  const m = fatura.monthly

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
    const mesName = MONTH_NAMES[mes - 1]
    const valorEmail = m?.valor_override || fatura.valor
    const config = await api.getAppConfig()

    let downloadLink: string | null = null
    if (m?.arquivos && m.arquivos.length > 0) {
      downloadLink = `${config.public_url}${api.downloadPagePath(fatura.id, ano, mes)}`
    }

    const emailInput = {
      nome: fatura.nome,
      mesName,
      ano,
      valor: valorEmail,
      conta: fatura.conta && fatura.conta !== '-' ? fatura.conta : null,
      emissao: m?.emissao ? formatDate(m.emissao) : null,
      vencimento: m?.vencimento ? formatDate(m.vencimento) : null,
      downloadLink,
    }
    const subject = encodeURIComponent(
      buildBillingEmailSubject(emailInput, config.email_subject_template),
    )
    const body = encodeURIComponent(
      buildBillingEmailBody(emailInput, config.email_body_template),
    )

    const mailto = `mailto:nfe@quintadabaroneza.com.br?subject=${subject}&body=${body}`
    window.open(mailto, '_blank')

    await api.markEmailSent(fatura.id, ano, mes)
    onReload()
  }

  async function handleReset() {
    if (!confirm('Resetar status desta fatura?')) return
    await api.resetMonthly(fatura.id, ano, mes)
    onReload()
  }

  return (
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
          {st !== 'pending' && (
            <button className="action-btn" onClick={handleReset} title="Resetar">
              Reset
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
