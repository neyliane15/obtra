import { useState, type ReactNode } from 'react'
import { format, startOfMonth } from 'date-fns'
import { FileDown, FileSpreadsheet, Info, Package, Users } from 'lucide-react'
import { useObras } from '@/lib/consultas'
import { useSessao } from '@/lib/sessao'
import { supabase, exigir } from '@/lib/supabase'
import { baixarCsv, gerarCsv } from '@/lib/csv'
import { capitalizar, codigoRelatorio, diaDaSemana, formatarData, hojeISO } from '@/lib/formato'
import { formatarDuracao, minutosTrabalhados } from '@/lib/horario'
import { CLIMA, CONDICAO, STATUS_RELATORIO, TIPO_MAO_OBRA, TIPO_MATERIAL } from '@/lib/rotulos'
import type { Relatorio } from '@/tipos/banco'
import { paraNumero } from '@/tipos/banco'
import { Botao, CabecalhoPagina, Campo, CampoData, Interruptor, Progresso, Selecao } from '@/componentes/ui'
import { useAvisos } from '@/componentes/avisos'

type Linha = Relatorio & {
  obras: { nome: string } | null
  relatorio_mao_obra: { funcao: string; quantidade: number; tipo: 'propria' | 'terceirizada'; empresa_terceira: string | null; colaborador_nome?: string | null }[]
  relatorio_atividades: { id: string }[]
  relatorio_materiais: { descricao: string; quantidade: number | string | null; unidade: string | null; tipo: 'recebido' | 'utilizado' }[]
}

function Bloco({ codigo, titulo, descricao, icone, children }: { codigo: string; titulo: string; descricao: string; icone: ReactNode; children: ReactNode }) {
  return (
    <section className="cartao quinas flex flex-col p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-marinho-900 text-ambar-400 [&_svg]:size-4">{icone}</span>
        <div>
          <p className="font-mono text-[9.5px] tracking-widest text-marinho-400">{codigo}</p>
          <h2 className="font-display text-[14.5px] font-bold text-marinho-900">{titulo}</h2>
          <p className="mt-0.5 text-[12px] text-tinta-suave">{descricao}</p>
        </div>
      </div>
      <div className="mt-auto">{children}</div>
    </section>
  )
}

export default function Exportacao() {
  const { empresaId } = useSessao()
  const obras = useObras()
  const avisos = useAvisos()
  const [obra, setObra] = useState('')
  const [de, setDe] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [ate, setAte] = useState(hojeISO())
  const [aprovados, setAprovados] = useState(false)
  const [comFotos, setComFotos] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [progresso, setProgresso] = useState<number | null>(null)
  const nomeObra = obras.data?.find((o) => o.id === obra)?.nome
  const sufixo = `${nomeObra ? nomeObra.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase() : 'todas-obras'}-${de}-a-${ate}`

  async function buscar(): Promise<Linha[]> {
    let q = supabase
      .from('relatorios')
      .select('*, obras(nome), relatorio_mao_obra(funcao, quantidade, tipo, empresa_terceira, colaborador_nome), relatorio_atividades(id), relatorio_materiais(descricao, quantidade, unidade, tipo)')
      .gte('data', de)
      .lte('data', ate)
      .order('data')
      .order('numero')
    if (obra) q = q.eq('obra_id', obra)
    if (empresaId) q = q.eq('empresa_id', empresaId)
    if (aprovados) q = q.eq('status', 'aprovado')
    const l = exigir(await q) as unknown as Linha[]
    if (!l.length) throw new Error('Nenhum relatório no período.')
    return l
  }

  async function executar(chave: string, fn: () => Promise<void>) {
    if (de > ate) return avisos.erro('Período inválido.')
    setOcupado(chave)
    try {
      await fn()
    } catch (e) {
      avisos.erro(e)
    } finally {
      setOcupado(null)
      setProgresso(null)
    }
  }

  const pdf = () =>
    executar('pdf', async () => {
      if (!obra) throw new Error('Escolha a obra para o PDF do período.')
      setProgresso(0)
      const { baixarPdfPeriodo } = await import('@/lib/pdf-rdo')
      await baixarPdfPeriodo(obra, de, ate, { somenteAprovados: aprovados, comFotos, aoProgredir: (f, t) => setProgresso((f / t) * 100) })
      avisos.sucesso('PDF gerado.')
    })

  const csvRelatorios = () =>
    executar('csv-rdo', async () => {
      const l = await buscar()
      const csv = gerarCsv(
        ['Nº', 'Obra', 'Data', 'Dia', 'Status', 'Responsável', 'Entrada', 'Saída', 'Horas', 'Clima manhã', 'Condição manhã', 'Clima tarde', 'Condição tarde', 'Chuva (mm)', 'Efetivo', 'Atividades', 'Observações'],
        l.map((r) => [
          codigoRelatorio(r.numero), r.obras?.nome, formatarData(r.data), capitalizar(diaDaSemana(r.data)), STATUS_RELATORIO[r.status].rotulo, r.responsavel,
          r.horario_inicio?.slice(0, 5), r.horario_fim?.slice(0, 5), formatarDuracao(minutosTrabalhados(r.horario_inicio, r.horario_fim, r.intervalo_inicio, r.intervalo_fim)),
          r.clima_manha ? CLIMA[r.clima_manha] : '', r.condicao_manha ? CONDICAO[r.condicao_manha] : '', r.clima_tarde ? CLIMA[r.clima_tarde] : '', r.condicao_tarde ? CONDICAO[r.condicao_tarde] : '',
          r.pluviometria_mm === null ? '' : paraNumero(r.pluviometria_mm), r.relatorio_mao_obra.reduce((s, m) => s + m.quantidade, 0), r.relatorio_atividades.length, r.observacoes,
        ]),
      )
      baixarCsv(`relatorios-${sufixo}`, csv)
      avisos.sucesso(`${l.length} relatório(s) exportado(s).`)
    })

  const csvMaoObra = () =>
    executar('csv-mo', async () => {
      const l = await buscar()
      const linhas = l.flatMap((r) => r.relatorio_mao_obra.map((m) => [codigoRelatorio(r.numero), r.obras?.nome, formatarData(r.data), m.colaborador_nome ?? '', m.funcao, TIPO_MAO_OBRA[m.tipo], m.empresa_terceira ?? '', m.quantidade]))
      baixarCsv(`mao-de-obra-${sufixo}`, gerarCsv(['Nº', 'Obra', 'Data', 'Colaborador', 'Função', 'Vínculo', 'Empresa', 'Quantidade'], linhas))
      avisos.sucesso(`${linhas.length} linha(s) exportada(s).`)
    })

  const csvMateriais = () =>
    executar('csv-mat', async () => {
      const l = await buscar()
      const linhas = l.flatMap((r) => r.relatorio_materiais.map((m) => [codigoRelatorio(r.numero), r.obras?.nome, formatarData(r.data), TIPO_MATERIAL[m.tipo], m.descricao, m.quantidade === null ? '' : paraNumero(m.quantidade), m.unidade ?? '']))
      baixarCsv(`materiais-${sufixo}`, gerarCsv(['Nº', 'Obra', 'Data', 'Movimento', 'Material', 'Quantidade', 'Unidade'], linhas))
      avisos.sucesso(`${linhas.length} linha(s) exportada(s).`)
    })

  return (
    <>
      <CabecalhoPagina sobretitulo="Saídas" titulo="Relatórios & Exportação" subtitulo="PDF consolidado para o cliente e planilhas para o escritório." />

      <section className="cartao cantoneiras mb-5 p-4 sm:p-5">
        <p className="rotulo mb-3">Filtro comum</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_auto] lg:items-end">
          <Campo rotulo="Obra" htmlFor="exp-obra">
            <Selecao id="exp-obra" value={obra} onChange={(e) => setObra(e.target.value)}>
              <option value="">Todas as obras</option>
              {(obras.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </Selecao>
          </Campo>
          <CampoData rotulo="De" valor={de} aoMudar={setDe} />
          <CampoData rotulo="Até" valor={ate} aoMudar={setAte} />
          <div className="pb-1.5">
            <Interruptor ligado={aprovados} aoMudar={setAprovados} rotulo="Somente aprovados" />
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Bloco codigo="EXP-01" titulo="PDF do período" descricao="Capa com resumo (efetivo médio, chuva, dias impraticáveis), índice e todos os RDOs da obra." icone={<FileDown />}>
          <Interruptor ligado={comFotos} aoMudar={setComFotos} rotulo="Incluir fotos" descricao="Arquivo maior; a geração leva mais tempo." />
          {progresso !== null && <Progresso valor={progresso} className="mt-3" rotuloAcessivel="Gerando PDF" />}
          <Botao variante="ambar" className="mt-4 w-full" icone={<FileDown className="size-4" />} carregando={ocupado === 'pdf'} onClick={() => void pdf()}>
            Gerar PDF {nomeObra ? `· ${nomeObra}` : ''}
          </Botao>
          {!obra && <p className="mt-2 flex items-center gap-1 text-[11px] text-tinta-fraca"><Info className="size-3" /> Escolha uma obra no filtro acima.</p>}
        </Bloco>
        <Bloco codigo="EXP-02" titulo="Planilha de relatórios" descricao="Uma linha por RDO: data, status, horário, horas, clima, efetivo e atividades." icone={<FileSpreadsheet />}>
          <Botao variante="secundario" className="w-full" icone={<FileSpreadsheet className="size-4" />} carregando={ocupado === 'csv-rdo'} onClick={() => void csvRelatorios()}>Baixar CSV</Botao>
        </Bloco>
        <Bloco codigo="EXP-03" titulo="Mão de obra" descricao="Efetivo por dia, função e vínculo — base para medição de terceirizados." icone={<Users />}>
          <Botao variante="secundario" className="w-full" icone={<FileSpreadsheet className="size-4" />} carregando={ocupado === 'csv-mo'} onClick={() => void csvMaoObra()}>Baixar CSV</Botao>
        </Bloco>
        <Bloco codigo="EXP-04" titulo="Materiais" descricao="Recebimentos e consumos registrados nos relatórios." icone={<Package />}>
          <Botao variante="secundario" className="w-full" icone={<FileSpreadsheet className="size-4" />} carregando={ocupado === 'csv-mat'} onClick={() => void csvMateriais()}>Baixar CSV</Botao>
        </Bloco>
      </div>
      <p className="mt-4 text-center font-mono text-[10px] tracking-widest text-tinta-fraca uppercase">PDFs e planilhas são gerados no seu navegador · não ocupam armazenamento</p>
    </>
  )
}
