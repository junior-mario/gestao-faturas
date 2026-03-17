import { Fatura } from '../types'
import FaturaRow from './FaturaRow'

interface Props {
  faturas: Fatura[]
  ano: number
  mes: number
  onOpenModal: (f: Fatura) => void
  onReload: () => void
  onNotify: (message: string) => void
}

export default function FaturaTable({ faturas, ano, mes, onOpenModal, onReload, onNotify }: Props) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fatura</th>
            <th>N. Conta</th>
            <th>Valor</th>
            <th>Dia</th>
            <th>Status</th>
            <th>Emissão</th>
            <th>Vencimento</th>
            <th>Arquivo</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {faturas.map((f) => (
            <FaturaRow
              key={f.id}
              fatura={f}
              ano={ano}
              mes={mes}
              onOpenModal={onOpenModal}
              onReload={onReload}
              onNotify={onNotify}
            />
          ))}
        </tbody>
      </table>
      {faturas.length === 0 && (
        <div className="empty-state">Nenhuma fatura encontrada.</div>
      )}
    </div>
  )
}
