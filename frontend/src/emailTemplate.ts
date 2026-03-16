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

<strong>RESUMO DA FATURA</strong>
{{invoice_table_html}}

<strong>DOWNLOAD</strong>
{{download_link_html}}

Em caso de duvidas, estamos a disposicao.

Atenciosamente,
Departamento de TI
Quinta da Baroneza`

function safe(value?: string | null): string {
  const text = (value || '').trim()
  return text || '-'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return values[key] ?? ''
  })
}

function getTemplateValues(input: BillingEmailTemplateInput): Record<string, string> {
  const periodo = `${input.mesName}/${input.ano}`
  const link = safe(input.downloadLink)
  const rows: Array<[string, string]> = [
    ['Fatura', safe(input.nome)],
    ['Periodo', safe(periodo)],
    ['Valor', safe(input.valor)],
    ['Conta', safe(input.conta)],
    ['Emissao', safe(input.emissao)],
    ['Vencimento', safe(input.vencimento)],
  ]
  const invoiceTableText = rows
    .map(([label, value]) => `${label.toUpperCase()} ............ ${value}`)
    .join('\n')
  const invoiceTableHtml = `<table style="border-collapse:collapse;width:100%;max-width:560px;font-family:Segoe UI,Arial,sans-serif;font-size:14px;">${rows
    .map(([label, value]) => `<tr><td style="padding:8px 10px;border:1px solid #d7dfdb;background:#f6faf8;font-weight:600;width:38%;">${escapeHtml(label)}</td><td style="padding:8px 10px;border:1px solid #d7dfdb;">${escapeHtml(value)}</td></tr>`)
    .join('')}</table>`
  return {
    nome_fatura: safe(input.nome),
    mes_nome: safe(input.mesName),
    ano: String(input.ano),
    periodo,
    valor: safe(input.valor),
    conta: safe(input.conta),
    emissao: safe(input.emissao),
    vencimento: safe(input.vencimento),
    download_link: link,
    download_link_html: link === '-' ? '-' : `<a href="${link}">${link}</a>`,
    invoice_table_text: invoiceTableText,
    invoice_table_html: invoiceTableHtml,
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
  const values = getTemplateValues(input)
  const plainValues = {
    ...values,
    download_link_html: values.download_link,
    invoice_table_html: values.invoice_table_text,
  }
  return renderTemplate(template, plainValues)
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
{{download_link}}
{{download_link_html}}
{{invoice_table_text}}
{{invoice_table_html}}

HTML permitido no corpo do email (ex.: <strong>texto</strong>, <a href="...">link</a>).`
