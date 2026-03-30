import { useMemo, useState } from 'react'
import { api } from '../api'

interface Props {
  onClose: () => void
  onCreated: (nomeFatura: string) => Promise<void> | void
}

function toNumber(value: string): number | null {
  const normalized = value.replace(/\./g, '').replace(',', '.').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export default function AddFaturaModal({ onClose, onCreated }: Props) {
  const [nome, setNome] = useState('')
  const [conta, setConta] = useState('-')
  const [valor, setValor] = useState('')
  const [moeda, setMoeda] = useState('BRL')
  const [valorNum, setValorNum] = useState('')
  const [dia, setDia] = useState('1')
  const [grupo, setGrupo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validationError = useMemo(() => {
    if (!nome.trim()) return 'Informe o nome da fatura.'
    if (!valor.trim()) return 'Informe o valor exibido (ex.: R$ 120,00).'
    const numeric = toNumber(valorNum)
    if (numeric === null || numeric < 0) return 'Informe um valor numerico valido.'
    const day = Number(dia)
    if (!Number.isInteger(day) || day < 1 || day > 31) return 'Informe um dia entre 1 e 31.'
    if (!grupo.trim()) return 'Informe o grupo da fatura.'
    return null
  }, [nome, valor, valorNum, dia, grupo])

  function handleOverlayClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).className.includes('modal-overlay')) onClose()
  }

  async function handleCreate() {
    setError(null)
    if (validationError) {
      setError(validationError)
      return
    }

    const numeric = toNumber(valorNum)
    if (numeric === null) {
      setError('Valor numerico invalido.')
      return
    }

    setSaving(true)
    try {
      const nomeNormalizado = nome.trim()
      await api.createFatura({
        nome: nomeNormalizado,
        conta: conta.trim() || '-',
        valor: valor.trim(),
        moeda: moeda.trim().toUpperCase(),
        valor_num: numeric,
        dia: Number(dia),
        grupo: grupo.trim(),
      })
      await onCreated(nomeNormalizado)
    } catch (err) {
      console.error(err)
      setError('Nao foi possivel criar a fatura.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal" style={{ maxWidth: '620px' }}>
        <div className="modal-title">Nova Fatura Mensal</div>

        <div className="form-group">
          <label className="form-label">Nome da fatura</label>
          <input
            type="text"
            className="form-input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={saving}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Conta (opcional)</label>
            <input
              type="text"
              className="form-input"
              value={conta}
              onChange={(e) => setConta(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Grupo</label>
            <input
              type="text"
              className="form-input"
              value={grupo}
              onChange={(e) => setGrupo(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Valor exibido</label>
            <input
              type="text"
              className="form-input"
              placeholder="R$ 120,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Valor numerico</label>
            <input
              type="text"
              className="form-input"
              placeholder="120,00"
              value={valorNum}
              onChange={(e) => setValorNum(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Moeda</label>
            <select
              className="form-input"
              value={moeda}
              onChange={(e) => setMoeda(e.target.value)}
              disabled={saving}
            >
              <option value="BRL">BRL</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Dia do vencimento</label>
            <input
              type="number"
              min={1}
              max={31}
              className="form-input"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        {error && <div className="validation-msg err">{error}</div>}

        <div className="modal-footer">
          <button className="btn" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn confirm" type="button" onClick={handleCreate} disabled={saving}>
            {saving ? 'Salvando...' : 'Criar fatura'}
          </button>
        </div>
      </div>
    </div>
  )
}
