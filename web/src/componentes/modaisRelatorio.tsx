import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { FileDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { hojeISO } from '@/lib/formato'
import { Botao, CampoTexto, Interruptor, Modal, Progresso } from './ui'
import { useAvisos } from './avisos'

export function ModalNovoRelatorio({
  aberto, aoFechar, obraId, temAnterior,
}: {
  aberto: boolean
  aoFechar: () => void
  obraId: string
  temAnterior: boolean
}) {
  const avisos = useAvisos()
  const qc = useQueryClient()
  const navegar = useNavigate()
  const [data, setData] = useState(hojeISO())
  const [copiar, setCopiar] = useState(true)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    if (aberto) {
      setData(hojeISO())
      setCopiar(temAnterior)
    }
  }, [aberto, temAnterior])

  async function criar(e: FormEvent) {
    e.preventDefault()
    if (!data) return avisos.erro('Informe a data.')
    setSalvando(true)
    const { data: id, error } = await supabase.rpc('criar_relatorio', { p_obra: obraId, p_data: data, p_copiar_anterior: copiar })
    setSalvando(false)
    if (error) return avisos.erro(error)
    void qc.invalidateQueries({ queryKey: ['relatorios', obraId] })
    void qc.invalidateQueries({ queryKey: ['painel'] })
    aoFechar()
    navegar(`/relatorios/${id as string}`)
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Novo relatório diário"
      descricao="O número é atribuído automaticamente, em sequência."
      codigo="RDO · ABERTURA"
      largura="sm"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" form="form-novo-rdo" carregando={salvando}>Criar relatório</Botao>
        </>
      }
    >
      <form id="form-novo-rdo" onSubmit={criar} className="flex flex-col gap-4">
        <CampoTexto rotulo="Data do relatório" type="date" value={data} onChange={(e) => setData(e.target.value)} max="2100-12-31" obrigatorio />
        <Interruptor
          ligado={copiar}
          aoMudar={setCopiar}
          desabilitado={!temAnterior}
          rotulo="Copiar do relatório anterior"
          descricao={temAnterior ? 'Traz a mão de obra e os equipamentos do último RDO.' : 'Esta obra ainda não tem relatórios.'}
        />
      </form>
    </Modal>
  )
}

export function ModalPdfPeriodo({
  aberto, aoFechar, obraId, somenteAprovados: forcarAprovados,
}: {
  aberto: boolean
  aoFechar: () => void
  obraId: string
  somenteAprovados?: boolean
}) {
  const avisos = useAvisos()
  const [de, setDe] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [ate, setAte] = useState(hojeISO())
  const [aprovados, setAprovados] = useState(!!forcarAprovados)
  const [comFotos, setComFotos] = useState(false)
  const [progresso, setProgresso] = useState<number | null>(null)

  async function gerar(e: FormEvent) {
    e.preventDefault()
    if (!de || !ate || de > ate) return avisos.erro('Período inválido.')
    setProgresso(0)
    try {
      const { baixarPdfPeriodo } = await import('@/lib/pdf-rdo')
      await baixarPdfPeriodo(obraId, de, ate, {
        somenteAprovados: forcarAprovados || aprovados,
        comFotos,
        aoProgredir: (f, t) => setProgresso((f / t) * 100),
      })
      avisos.sucesso('PDF do período gerado.')
      aoFechar()
    } catch (err) {
      avisos.erro(err)
    } finally {
      setProgresso(null)
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="PDF do período"
      descricao="Capa com resumo e todos os relatórios entre as datas."
      codigo="RDO · CONSOLIDADO"
      largura="sm"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" form="form-periodo" carregando={progresso !== null} icone={<FileDown className="size-4" />}>Gerar PDF</Botao>
        </>
      }
    >
      <form id="form-periodo" onSubmit={gerar} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <CampoTexto rotulo="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          <CampoTexto rotulo="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        {!forcarAprovados && <Interruptor ligado={aprovados} aoMudar={setAprovados} rotulo="Somente aprovados" />}
        <Interruptor ligado={comFotos} aoMudar={setComFotos} rotulo="Incluir fotos" descricao="Deixa o arquivo maior e a geração mais lenta." />
        {progresso !== null && <Progresso valor={progresso} rotuloAcessivel="Gerando PDF" />}
      </form>
    </Modal>
  )
}
