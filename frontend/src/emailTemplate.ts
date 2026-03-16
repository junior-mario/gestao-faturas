export interface BillingEmailTemplateInput {
  nome: string
  mesName: string
  ano: number
  valor: string
  conta?: string | null
  emissao?: string | null
  vencimento?: string | null
  downloadLink?: string | null
}

export const DEFAULT_EMAIL_SUBJECT_TEMPLATE = 'Fatura | {{nome_fatura}} | {{mes_nome}}/{{ano}}'

export const DEFAULT_EMAIL_BODY_TEMPLATE = `Prezados,

Encaminhamos a fatura referente a {{nome_fatura}} ({{mes_nome}}/{{ano}}).

RESUMO DA FATURA
FATURA ............ {{nome_fatura}}
PERIODO ........... {{periodo}}
VALOR ............. {{valor}}
CONTA ............. {{conta}}
EMISSAO ........... {{emissao}}
VENCIMENTO ........ {{vencimento}}

DOWNLOAD
{{download_link}}

Em caso de duvidas, estamos a disposicao.

Atenciosamente,
Departamento de TI
Quinta da Baroneza`

function safe(value?: string | null): string {
  const text = (value || '').trim()
  return text || '-'
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return values[key] ?? ''
  })
}

function getTemplateValues(input: BillingEmailTemplateInput): Record<string, string> {
  const periodo = `${input.mesName}/${input.ano}`
  return {
    nome_fatura: safe(input.nome),
    mes_nome: safe(input.mesName),
    ano: String(input.ano),
    periodo,
    valor: safe(input.valor),
    conta: safe(input.conta),
    emissao: safe(input.emissao),
    vencimento: safe(input.vencimento),
    download_link: safe(input.downloadLink),
  }
}

export function buildBillingEmailSubject(
  input: BillingEmailTemplateInput,
  subjectTemplate?: string | null,
): string {
  const template = (subjectTemplate || DEFAULT_EMAIL_SUBJECT_TEMPLATE).trim() || DEFAULT_EMAIL_SUBJECT_TEMPLATE
  return renderTemplate(template, getTemplateValues(input))
}

export function buildBillingEmailBody(
  input: BillingEmailTemplateInput,
  bodyTemplate?: string | null,
): string {
  const template = (bodyTemplate || DEFAULT_EMAIL_BODY_TEMPLATE).trim() || DEFAULT_EMAIL_BODY_TEMPLATE
  return renderTemplate(template, getTemplateValues(input))
}

export const EMAIL_TEMPLATE_HELP = `Placeholders disponiveis:
{{nome_fatura}}
{{mes_nome}}
{{ano}}
{{periodo}}
{{valor}}
{{conta}}
{{emissao}}
{{vencimento}}
{{download_link}}`
