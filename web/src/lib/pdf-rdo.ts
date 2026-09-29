/**
 * PDF do RDO gerado no navegador (jsPDF + autoTable). Nada é salvo no
 * Storage: o arquivo nasce, é baixado e some — custo de armazenamento zero.
 */
import { jsPDF } from 'jspdf'
import autoTable, { type RowInput, type UserOptions } from 'jspdf-autotable'
import type { Empresa, Foto, Obra, Relatorio } from '@/tipos/banco'
import { paraNumero } from '@/tipos/banco'
import { supabase, exigir } from './supabase'
import { carregarRelatorio, type RelatorioCompleto } from './consultas'
import { baixarBlob } from './armazenamento'
import { paraJpegDataUrl } from './imagem'
import { calcularPrazo } from './prazo'
import { diaDaSemana, formatarData, formatarHora, capitalizar, codigoRelatorio, formatarMoeda } from './formato'
import { formatarDuracao, minutosTrabalhados } from './horario'
import { CLIMA, CONDICAO, STATUS_ATIVIDADE, STATUS_RELATORIO, TIPO_MAO_OBRA, TIPO_OCORRENCIA } from './rotulos'
import { format } from 'date-fns'

type RGB = [number, number, number]
const MARINHO: RGB = [11, 31, 58]
const MARINHO_600: RGB = [30, 58, 138]
const AMBAR: RGB = [242, 154, 46]
const LINHA: RGB = [200, 210, 225]
const TINTA: RGB = [15, 27, 45]
const SUAVE: RGB = [90, 104, 125]
const FUNDO: RGB = [241, 245, 253]

const M = 14 // margem
const TOPO_CONTINUACAO = 24

interface Contexto {
  doc: jsPDF
  larg: number
  alt: number
  obra: Obra
  empresa: Empresa | null
  logoEmpresa: { dataUrl: string; largura: number; altura: number } | null
}

/* ------------------------------------------------------------ desenho -- */
function simboloObtra(doc: jsPDF, x: number, y: number, t: number) {
  const k = t / 64
  doc.setFillColor(...MARINHO)
  doc.roundedRect(x, y, t, t, 15 * k, 15 * k, 'F')
  doc.setDrawColor(255, 255, 255)
  doc.setLineWidth(7.5 * k)
  doc.circle(x + 31 * k, y + 34 * k, 15 * k, 'S')
  // apaga o quadrante superior direito do anel
  doc.setFillColor(...MARINHO)
  doc.rect(x + 31 * k, y + 14 * k, 20 * k, 20 * k, 'F')
  doc.setFillColor(...AMBAR)
  doc.roundedRect(x + 38 * k, y + 11 * k, 13 * k, 13 * k, 2.5 * k, 2.5 * k, 'F')
}

function tituloSecao(c: Contexto, y: number, titulo: string, codigo: string): number {
  const { doc, larg } = c
  if (y > c.alt - 40) {
    doc.addPage()
    y = TOPO_CONTINUACAO + 4
  }
  doc.setFillColor(...AMBAR)
  doc.rect(M, y - 2.6, 2.2, 2.2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...MARINHO)
  doc.text(titulo.toUpperCase(), M + 4, y, { charSpace: 0.3 })
  const w = doc.getTextWidth(titulo.toUpperCase()) + titulo.length * 0.3
  doc.setFont('courier', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...SUAVE)
  doc.text(codigo, larg - M, y, { align: 'right' })
  doc.setDrawColor(...LINHA)
  doc.setLineWidth(0.2)
  doc.setLineDashPattern([0.8, 0.8], 0)
  doc.line(M + 6 + w, y - 1, larg - M - doc.getTextWidth(codigo) - 2, y - 1)
  doc.setLineDashPattern([], 0)
  return y + 3
}

const estiloTabela: Partial<UserOptions> = {
  theme: 'grid',
  margin: { left: M, right: M, top: TOPO_CONTINUACAO + 4, bottom: 18 },
  styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, lineColor: LINHA, lineWidth: 0.15, textColor: TINTA, valign: 'middle' },
  headStyles: { fillColor: FUNDO, textColor: MARINHO_600, fontStyle: 'bold', fontSize: 7, lineColor: LINHA },
  alternateRowStyles: { fillColor: [250, 251, 254] },
}

function tabela(c: Contexto, y: number, opcoes: UserOptions): number {
  autoTable(c.doc, { ...estiloTabela, ...opcoes, startY: y, styles: { ...estiloTabela.styles, ...opcoes.styles }, headStyles: { ...estiloTabela.headStyles, ...opcoes.headStyles } })
  return (c.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
}

function vazioSe<T>(lista: T[], linhas: (l: T[]) => RowInput[], colunas: number): RowInput[] {
  if (lista.length) return linhas(lista)
  return [[{ content: 'Nenhum registro.', colSpan: colunas, styles: { textColor: SUAVE, fontStyle: 'italic' } }]]
}

/* ----------------------------------------------------------- cabeçalho -- */
function cabecalho(c: Contexto, r: Relatorio): number {
  const { doc, larg, obra, empresa, logoEmpresa } = c
  // faixa superior
  doc.setFillColor(...MARINHO)
  doc.rect(0, 0, larg, 3, 'F')
  doc.setFillColor(...AMBAR)
  doc.rect(larg - M - 30, 0, 30, 3, 'F')

  let x = M
  const y0 = 9
  if (logoEmpresa) {
    const h = 14
    const w = Math.min(34, (logoEmpresa.largura / logoEmpresa.altura) * h)
    doc.addImage(logoEmpresa.dataUrl, 'JPEG', x, y0, w, h)
    x += w + 4
  } else {
    simboloObtra(doc, x, y0, 13)
    x += 17
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...MARINHO)
  doc.text(empresa?.nome ?? 'Obtra', x, y0 + 5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...SUAVE)
  const linhaEmp = [empresa?.cnpj && `CNPJ ${empresa.cnpj}`, empresa?.telefone, empresa?.email].filter(Boolean).join('  ·  ')
  if (linhaEmp) doc.text(linhaEmp, x, y0 + 9.5)
  const end = [empresa?.endereco, [empresa?.cidade, empresa?.uf].filter(Boolean).join('/')].filter(Boolean).join(' — ')
  if (end) doc.text(end, x, y0 + 13)

  // bloco do nº
  const bw = 46
  const bx = larg - M - bw
  doc.setDrawColor(...MARINHO)
  doc.setLineWidth(0.4)
  doc.rect(bx, y0 - 1, bw, 17)
  doc.setFillColor(...MARINHO)
  doc.rect(bx, y0 - 1, bw, 5.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(255, 255, 255)
  doc.text('RELATÓRIO DIÁRIO DE OBRA', bx + bw / 2, y0 + 2.8, { align: 'center', charSpace: 0.2 })
  doc.setTextColor(...MARINHO)
  doc.setFontSize(15)
  doc.text(codigoRelatorio(r.numero), bx + bw / 2, y0 + 11.5, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...SUAVE)
  doc.text(`${formatarData(r.data)} · ${capitalizar(diaDaSemana(r.data))}`, bx + bw / 2, y0 + 14.8, { align: 'center' })

  // régua de cota
  const yc = 30
  doc.setDrawColor(...LINHA)
  doc.setLineWidth(0.2)
  doc.line(M, yc, larg - M, yc)
  doc.line(M, yc - 1.5, M, yc + 1.5)
  doc.line(larg - M, yc - 1.5, larg - M, yc + 1.5)

  // carimbo da obra
  const prazo = calcularPrazo(obra, new Date(`${r.data}T12:00:00`))
  const rot = (s: string) => ({ content: s.toUpperCase(), styles: { fontStyle: 'bold' as const, textColor: SUAVE, fontSize: 6.3, fillColor: FUNDO } })
  const local = [obra.endereco, [obra.cidade, obra.uf].filter(Boolean).join('/')].filter(Boolean).join(' — ') || '—'
  return tabela(c, yc + 3, {
    theme: 'grid',
    body: [
      [rot('Obra'), { content: obra.nome, styles: { fontStyle: 'bold', textColor: MARINHO } }, rot('Código'), obra.codigo ?? '—'],
      [rot('Local'), local, rot('Contratante'), obra.contratante ?? '—'],
      [rot('Resp. técnico'), obra.responsavel_tecnico ?? '—', rot('Status'), STATUS_RELATORIO[r.status].rotulo],
      [
        rot('Prazo'),
        prazo.definido ? `${prazo.total} dias · início ${formatarData(obra.data_inicio)} · término ${formatarData(prazo.termino)}` : '—',
        rot('Decorrido'),
        prazo.definido ? `${prazo.decorridos} dias (${prazo.atrasado ? `${Math.abs(prazo.restantes)} em atraso` : `${prazo.restantes} restantes`})` : '—',
      ],
    ],
    columnStyles: { 0: { cellWidth: 24 }, 2: { cellWidth: 22 }, 3: { cellWidth: 44 } },
    alternateRowStyles: {},
  })
}

/* --------------------------------------------------------------- RDO -- */
async function desenharRelatorio(c: Contexto, dados: RelatorioCompleto, fotos: Foto[], opcoes: { comFotos: boolean }) {
  const { doc } = c
  const r = dados.relatorio
  let y = cabecalho(c, r)

  // horário
  const minutos = minutosTrabalhados(r.horario_inicio, r.horario_fim, r.intervalo_inicio, r.intervalo_fim)
  y = tituloSecao(c, y, 'Horário de trabalho', '01')
  y = tabela(c, y, {
    head: [['Responsável', 'Entrada', 'Saída', 'Intervalo', 'Horas trabalhadas']],
    body: [[
      r.responsavel ?? '—',
      formatarHora(r.horario_inicio) || '—',
      formatarHora(r.horario_fim) || '—',
      r.intervalo_inicio && r.intervalo_fim ? `${formatarHora(r.intervalo_inicio)} às ${formatarHora(r.intervalo_fim)}` : '—',
      { content: formatarDuracao(minutos), styles: { fontStyle: 'bold', textColor: MARINHO } },
    ]],
  })

  // clima
  y = tituloSecao(c, y, 'Condição climática', '02')
  const periodos = [
    ['Manhã', r.clima_manha, r.condicao_manha],
    ['Tarde', r.clima_tarde, r.condicao_tarde],
    ['Noite', r.clima_noite, r.condicao_noite],
  ] as const
  const cond = (co: (typeof periodos)[number][2]) => ({
    content: co ? CONDICAO[co] : '—',
    styles: co === 'impraticavel' ? { textColor: [192, 52, 43] as RGB, fontStyle: 'bold' as const } : {},
  })
  y = tabela(c, y, {
    head: [['', ...periodos.map((p) => p[0]), 'Pluviometria']],
    body: [
      [{ content: 'CLIMA', styles: { fontStyle: 'bold', textColor: SUAVE, fontSize: 6.5 } }, ...periodos.map((p) => (p[1] ? CLIMA[p[1]] : '—')), { content: r.pluviometria_mm !== null ? `${paraNumero(r.pluviometria_mm).toLocaleString('pt-BR')} mm` : '—', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } }],
      [{ content: 'CONDIÇÃO', styles: { fontStyle: 'bold', textColor: SUAVE, fontSize: 6.5 } }, ...periodos.map((p) => cond(p[2]))],
    ],
    columnStyles: { 0: { cellWidth: 22 } },
  })

  // mão de obra
  const totalMO = dados.maoObra.reduce((s, m) => s + m.quantidade, 0)
  y = tituloSecao(c, y, `Mão de obra · efetivo ${totalMO}`, '03')
  y = tabela(c, y, {
    head: [['Colaborador', 'Função', 'Vínculo', 'Qtd.']],
    body: vazioSe(dados.maoObra, (l) => l.map((m) => [m.colaborador_nome || 'Equipe', m.funcao || '—', m.tipo === 'terceirizada' ? `Terceirizada${m.empresa_terceira ? ` · ${m.empresa_terceira}` : ''}` : TIPO_MAO_OBRA[m.tipo], { content: String(m.quantidade), styles: { halign: 'right' } }]), 4),
    foot: dados.maoObra.length ? [[{ content: 'Total', colSpan: 3, styles: { halign: 'right' } }, { content: String(totalMO), styles: { halign: 'right' } }]] : undefined,
    footStyles: { fillColor: FUNDO, textColor: MARINHO, fontStyle: 'bold' },
    columnStyles: { 3: { cellWidth: 16 } },
  })

  y = tituloSecao(c, y, 'Equipamentos', '04')
  y = tabela(c, y, {
    head: [['Equipamento', 'Qtd.']],
    body: vazioSe(dados.equipamentos, (l) => l.map((e) => [e.nome, { content: String(e.quantidade), styles: { halign: 'right' } }]), 2),
    columnStyles: { 1: { cellWidth: 16 } },
  })

  y = tituloSecao(c, y, 'Atividades realizadas', '05')
  y = tabela(c, y, {
    head: [['Descrição', 'Situação', '%']],
    body: vazioSe(dados.atividades, (l) => l.map((a) => [a.descricao, STATUS_ATIVIDADE[a.status].rotulo, { content: `${a.progresso}%`, styles: { halign: 'right' } }]), 3),
    columnStyles: { 1: { cellWidth: 28 }, 2: { cellWidth: 16 } },
  })

  y = tituloSecao(c, y, 'Ocorrências', '06')
  y = tabela(c, y, {
    head: [['Tipo', 'Descrição']],
    body: vazioSe(dados.ocorrencias, (l) => l.map((o) => [TIPO_OCORRENCIA[o.tipo], o.descricao]), 2),
    columnStyles: { 0: { cellWidth: 28 } },
  })

  const qtd = (v: number | string | null) => (v === null || v === '' ? '—' : paraNumero(v).toLocaleString('pt-BR'))
  const secMat = (tipo: 'recebido' | 'utilizado', titulo: string, cod: string) => {
    const l = dados.materiais.filter((m) => m.tipo === tipo)
    if (!l.length) return
    y = tituloSecao(c, y, titulo, cod)
    y = tabela(c, y, {
      head: [['Material', 'Quantidade', 'Unidade']],
      body: l.map((m) => [m.descricao, { content: qtd(m.quantidade), styles: { halign: 'right' } }, m.unidade ?? '']),
      columnStyles: { 1: { cellWidth: 26 }, 2: { cellWidth: 22 } },
    })
  }
  secMat('recebido', 'Materiais recebidos', '07')
  secMat('utilizado', 'Materiais utilizados', '08')

  if (dados.notas.length) {
    const totalNotas = dados.notas.reduce((s, n) => s + paraNumero(n.valor), 0)
    y = tituloSecao(c, y, 'Notas de compras', '09')
    y = tabela(c, y, {
      head: [['Fornecedor', 'Nº da nota', 'Descrição', 'Valor']],
      body: dados.notas.map((n) => [n.fornecedor ?? '—', n.numero_nota ?? '—', n.descricao ?? '', { content: formatarMoeda(paraNumero(n.valor)), styles: { halign: 'right' } }]),
      foot: [[{ content: 'Total', colSpan: 3, styles: { halign: 'right' } }, { content: formatarMoeda(totalNotas), styles: { halign: 'right' } }]],
      footStyles: { fillColor: FUNDO, textColor: MARINHO, fontStyle: 'bold' },
      columnStyles: { 1: { cellWidth: 26 }, 3: { cellWidth: 28 } },
    })
  }

  if (r.observacoes?.trim()) {
    y = tituloSecao(c, y, 'Observações', '10')
    y = tabela(c, y, { body: [[r.observacoes]], theme: 'plain', styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: LINHA, lineWidth: 0.15 } })
  }

  // fotos
  if (opcoes.comFotos && fotos.length) {
    const gap = 5
    const cw = (c.larg - 2 * M - gap) / 2
    const ch = cw * 0.72
    const legendaH = 9
    // título não fica órfão: precisa caber ao menos uma linha de fotos
    if (y + 8 + ch + legendaH > c.alt - 20) {
      doc.addPage()
      y = TOPO_CONTINUACAO + 4
    }
    y = tituloSecao(c, y, `Registro fotográfico · ${fotos.length}`, '11')
    let col = 0
    for (let i = 0; i < fotos.length; i++) {
      const f = fotos[i]!
      if (col === 0 && y + ch + legendaH > c.alt - 20) {
        doc.addPage()
        y = TOPO_CONTINUACAO + 4
      }
      const x = M + col * (cw + gap)
      doc.setDrawColor(...LINHA)
      doc.setLineWidth(0.2)
      doc.setFillColor(...FUNDO)
      doc.rect(x, y, cw, ch, 'FD')
      try {
        const blob = await baixarBlob(f.path)
        if (blob) {
          const img = await paraJpegDataUrl(blob, 1100, 0.8)
          const esc = Math.min((cw - 2) / img.largura, (ch - 2) / img.altura)
          const w = img.largura * esc
          const h = img.altura * esc
          doc.addImage(img.dataUrl, 'JPEG', x + (cw - w) / 2, y + (ch - h) / 2, w, h, undefined, 'FAST')
        }
      } catch {
        /* foto indisponível: fica o quadro vazio */
      }
      doc.setFont('courier', 'bold')
      doc.setFontSize(6.5)
      doc.setTextColor(...MARINHO_600)
      doc.text(`FOTO ${String(i + 1).padStart(2, '0')}`, x, y + ch + 3.6)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...TINTA)
      const leg = doc.splitTextToSize(f.legenda || '—', cw - 16) as string[]
      doc.text(leg.slice(0, 2), x + 14, y + ch + 3.6)
      col++
      if (col === 2) {
        col = 0
        y += ch + legendaH + 3
      }
    }
    if (col === 1) y += ch + legendaH + 3
  }

  // assinaturas
  if (y > c.alt - 45) {
    doc.addPage()
    y = TOPO_CONTINUACAO + 10
  }
  y += 14
  const aw = (c.larg - 2 * M - 16) / 2
  const assinaturas = [
    ['Responsável técnico', c.obra.responsavel_tecnico ?? c.empresa?.nome ?? ''],
    ['Cliente / Fiscalização', c.obra.contratante ?? ''],
  ]
  assinaturas.forEach(([rot, nome], i) => {
    const x = M + i * (aw + 16)
    doc.setDrawColor(...TINTA)
    doc.setLineWidth(0.25)
    doc.line(x, y, x + aw, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...TINTA)
    doc.text(nome || ' ', x + aw / 2, y + 4, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...SUAVE)
    doc.text(rot!.toUpperCase(), x + aw / 2, y + 7.5, { align: 'center', charSpace: 0.2 })
  })
  if (r.status === 'aprovado' && r.aprovado_em) {
    doc.setFontSize(6.5)
    doc.setTextColor(19, 121, 91)
    doc.text(`Aprovado em ${formatarData(r.aprovado_em, "dd/MM/yyyy 'às' HH:mm")}`, M, y + 13)
  }
}

/* ------------------------------------------------------ rodapé geral -- */
function finalizar(c: Contexto, titulosPorPagina: Map<number, string>) {
  const { doc, larg, alt } = c
  const total = doc.getNumberOfPages()
  const gerado = format(new Date(), "dd/MM/yyyy 'às' HH:mm")
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    const titulo = titulosPorPagina.get(p)
    if (titulo) {
      doc.setFillColor(...MARINHO)
      doc.rect(0, 0, larg, 3, 'F')
      simboloObtra(doc, M, 8, 7)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...MARINHO)
      doc.text(titulo, M + 10, 12.8)
      doc.setDrawColor(...LINHA)
      doc.setLineWidth(0.2)
      doc.line(M, 18, larg - M, 18)
    }
    doc.setDrawColor(...LINHA)
    doc.setLineWidth(0.2)
    doc.setLineDashPattern([0.8, 0.8], 0)
    doc.line(M, alt - 12, larg - M, alt - 12)
    doc.setLineDashPattern([], 0)
    simboloObtra(doc, M, alt - 9.6, 4.2)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...MARINHO)
    doc.text('obtra', M + 5.5, alt - 6.4)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...SUAVE)
    doc.text(`· diário de obra · gerado em ${gerado}`, M + 13, alt - 6.4)
    doc.setFont('courier', 'bold')
    doc.text(`PÁGINA ${p} DE ${total}`, larg - M, alt - 6.4, { align: 'right' })
  }
}

async function prepararContexto(obraId: string): Promise<Contexto> {
  const obra = exigir(await supabase.from('obras').select('*').eq('id', obraId).single()) as Obra
  const empresa = (exigir(await supabase.from('empresas').select('*').eq('id', obra.empresa_id).maybeSingle()) as Empresa | null) ?? null
  let logoEmpresa: Contexto['logoEmpresa'] = null
  if (empresa?.logo_path) {
    try {
      const blob = await baixarBlob(empresa.logo_path)
      if (blob) logoEmpresa = await paraJpegDataUrl(blob, 400, 0.9)
    } catch {
      logoEmpresa = null
    }
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({ title: `RDO — ${obra.nome}`, creator: 'Obtra' })
  return { doc, larg: doc.internal.pageSize.getWidth(), alt: doc.internal.pageSize.getHeight(), obra, empresa, logoEmpresa }
}

function nomeArquivo(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

async function fotosDoRelatorio(relatorioId: string): Promise<Foto[]> {
  return exigir(await supabase.from('fotos').select('*').eq('relatorio_id', relatorioId).order('criado_em')) as Foto[]
}

/** Gera e baixa o PDF de um RDO. */
export async function baixarPdfRelatorio(relatorioId: string, opcoes: { comFotos?: boolean } = {}) {
  const dados = await carregarRelatorio(relatorioId)
  if (!dados) throw new Error('Relatório não encontrado.')
  const c = await prepararContexto(dados.relatorio.obra_id)
  const fotos = opcoes.comFotos === false ? [] : await fotosDoRelatorio(relatorioId)
  await desenharRelatorio(c, dados, fotos, { comFotos: opcoes.comFotos !== false })
  const titulos = new Map<number, string>()
  const total = c.doc.getNumberOfPages()
  for (let p = 2; p <= total; p++) titulos.set(p, `${c.obra.nome} · ${codigoRelatorio(dados.relatorio.numero)} · ${formatarData(dados.relatorio.data)}`)
  finalizar(c, titulos)
  c.doc.save(`${codigoRelatorio(dados.relatorio.numero)}-${nomeArquivo(c.obra.nome)}-${dados.relatorio.data}.pdf`)
}

/** Relatório do período: capa com resumo + cada RDO em sequência. */
export async function baixarPdfPeriodo(
  obraId: string,
  de: string,
  ate: string,
  opcoes: { somenteAprovados?: boolean; comFotos?: boolean; aoProgredir?: (feito: number, total: number) => void } = {},
) {
  let q = supabase.from('relatorios').select('id, numero, data, status').eq('obra_id', obraId).gte('data', de).lte('data', ate).order('data').order('numero')
  if (opcoes.somenteAprovados) q = q.eq('status', 'aprovado')
  const lista = exigir(await q) as Pick<Relatorio, 'id' | 'numero' | 'data' | 'status'>[]
  if (!lista.length) throw new Error('Nenhum relatório no período selecionado.')
  const c = await prepararContexto(obraId)
  const { doc, larg } = c
  const completos: RelatorioCompleto[] = []
  for (const r of lista) {
    const d = await carregarRelatorio(r.id)
    if (d) completos.push(d)
  }

  // capa
  doc.setFillColor(...MARINHO)
  doc.rect(0, 0, larg, 70, 'F')
  doc.setDrawColor(157, 182, 232)
  doc.setLineWidth(0.08)
  for (let x = 0; x < larg; x += 6) doc.line(x, 0, x, 70)
  for (let y = 0; y < 70; y += 6) doc.line(0, y, larg, y)
  simboloObtra(doc, M, 14, 14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.text('RELATÓRIO DO PERÍODO', M, 40, { charSpace: 0.5 })
  doc.setFontSize(20)
  doc.text(c.obra.nome, M, 50)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(201, 215, 242)
  doc.text(`${formatarData(de)} a ${formatarData(ate)}  ·  ${completos.length} relatório(s)`, M, 58)
  doc.setFillColor(...AMBAR)
  doc.rect(M, 63, 24, 1.2, 'F')

  let y = 82
  const totalEfetivo = completos.reduce((s, d) => s + d.maoObra.reduce((a, m) => a + m.quantidade, 0), 0)
  const diasImprat = completos.filter((d) => d.relatorio.condicao_manha === 'impraticavel' || d.relatorio.condicao_tarde === 'impraticavel').length
  const chuva = completos.reduce((s, d) => s + paraNumero(d.relatorio.pluviometria_mm), 0)
  const kpis = [
    ['Relatórios', String(completos.length)],
    ['Efetivo médio', completos.length ? (totalEfetivo / completos.length).toFixed(1).replace('.', ',') : '0'],
    ['Dias impraticáveis', String(diasImprat)],
    ['Chuva acumulada', `${chuva.toLocaleString('pt-BR')} mm`],
  ]
  const kw = (larg - 2 * M - 9) / 4
  kpis.forEach(([rot, val], i) => {
    const x = M + i * (kw + 3)
    doc.setDrawColor(...LINHA)
    doc.setLineWidth(0.25)
    doc.rect(x, y, kw, 20)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(...SUAVE)
    doc.text(rot!.toUpperCase(), x + 3, y + 5.5)
    doc.setFontSize(15)
    doc.setTextColor(...MARINHO)
    doc.text(val!, x + 3, y + 15)
  })
  y += 30
  y = tituloSecao(c, y, 'Índice de relatórios', 'IDX')
  tabela(c, y, {
    head: [['Nº', 'Data', 'Dia', 'Manhã', 'Tarde', 'Efetivo', 'Atividades', 'Situação']],
    body: completos.map((d) => [
      codigoRelatorio(d.relatorio.numero),
      formatarData(d.relatorio.data),
      capitalizar(diaDaSemana(d.relatorio.data)),
      d.relatorio.clima_manha ? CLIMA[d.relatorio.clima_manha] : '—',
      d.relatorio.clima_tarde ? CLIMA[d.relatorio.clima_tarde] : '—',
      String(d.maoObra.reduce((a, m) => a + m.quantidade, 0)),
      String(d.atividades.length),
      STATUS_RELATORIO[d.relatorio.status].rotulo,
    ]),
  })

  const titulos = new Map<number, string>()
  for (let i = 0; i < completos.length; i++) {
    const d = completos[i]!
    doc.addPage()
    const inicio = doc.getNumberOfPages()
    const fotos = opcoes.comFotos ? await fotosDoRelatorio(d.relatorio.id) : []
    await desenharRelatorio(c, d, fotos, { comFotos: !!opcoes.comFotos })
    const fim = doc.getNumberOfPages()
    for (let p = inicio + 1; p <= fim; p++) titulos.set(p, `${c.obra.nome} · ${codigoRelatorio(d.relatorio.numero)} · ${formatarData(d.relatorio.data)}`)
    opcoes.aoProgredir?.(i + 1, completos.length)
  }
  finalizar(c, titulos)
  doc.save(`Relatorio-periodo-${nomeArquivo(c.obra.nome)}-${de}-a-${ate}.pdf`)
}
