import { useState, type FormEvent } from 'react'
import { format, startOfMonth } from 'date-fns'
import { FileDown } from 'lucide-react'
import { hojeISO } from '@/lib/formato'
import { Botao, CampoData, Interruptor, Modal, Progresso } from './ui'
import { useAvisos } from './avisos'

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
          <CampoData rotulo="De" valor={de} aoMudar={setDe} />
          <CampoData rotulo="Até" valor={ate} aoMudar={setAte} />
        </div>
        {!forcarAprovados && <Interruptor ligado={aprovados} aoMudar={setAprovados} rotulo="Somente aprovados" />}
        <Interruptor ligado={comFotos} aoMudar={setComFotos} rotulo="Incluir fotos" descricao="Deixa o arquivo maior e a geração mais lenta." />
        {progresso !== null && <Progresso valor={progresso} rotuloAcessivel="Gerando PDF" />}
      </form>
    </Modal>
  )
}
