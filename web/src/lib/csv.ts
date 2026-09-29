/** Célula CSV no padrão do Excel pt-BR (separador ;). */
export function celulaCsv(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v)
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

export function gerarCsv(cabecalho: string[], linhas: unknown[][]): string {
  return [cabecalho, ...linhas].map((l) => l.map(celulaCsv).join(';')).join('\r\n')
}

/** Baixa o CSV com BOM (acentos corretos no Excel). */
export function baixarCsv(nome: string, conteudo: string) {
  const blob = new Blob(['﻿', conteudo], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome.endsWith('.csv') ? nome : `${nome}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
