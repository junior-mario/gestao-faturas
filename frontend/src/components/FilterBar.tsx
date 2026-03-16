import { StatusFilter } from '../types'

interface Props {
  grupos: string[]
  filterGrupo: string
  filterStatus: StatusFilter
  search: string
  onGrupo: (g: string) => void
  onStatus: (s: StatusFilter) => void
  onSearch: (v: string) => void
}

export default function FilterBar({ grupos, filterGrupo, filterStatus, search, onGrupo, onStatus, onSearch }: Props) {
  const statuses: StatusFilter[] = ['Todos', 'Pendente', 'Anexada', 'Enviada']

  return (
    <div className="filter-bar">
      {grupos.map((g) => (
        <button
          key={g}
          className={`filter-btn${filterGrupo === g ? ' active' : ''}`}
          onClick={() => onGrupo(g)}
        >
          {g}
        </button>
      ))}
      <span className="filter-divider" />
      {statuses.map((s) => (
        <button
          key={s}
          className={`filter-btn${filterStatus === s ? ' active' : ''}`}
          onClick={() => onStatus(s)}
        >
          {s}
        </button>
      ))}
      <input
        className="search"
        placeholder="Buscar fatura..."
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
    </div>
  )
}
