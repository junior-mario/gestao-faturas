export interface Monthly {
  id: number
  fatura_id: number
  ano: number
  mes: number
  valor_override: string | null
  emissao: string | null
  vencimento: string | null
  arquivo_nome: string | null
  arquivos: string[]
  enviada: boolean
  created_at: string
  updated_at: string
}

export interface Fatura {
  id: number
  nome: string
  conta: string
  valor: string
  moeda: string
  valor_num: number
  dia: number
  grupo: string
  ativo: boolean
  created_at: string
  monthly: Monthly | null
}

export interface Stats {
  total: number
  pendentes: number
  anexadas: number
  enviadas: number
}

export type StatusFilter = 'Todos' | 'Pendente' | 'Anexada' | 'Enviada'
export type FaturaStatus = 'pending' | 'uploaded' | 'sent'
