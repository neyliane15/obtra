import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, FileText, FileUp, Trash2 } from 'lucide-react'
import type { Documento } from '@/tipos/banco'
import { paraNumero } from '@/tipos/banco'
import { abrirDocumento, enviarDocumento, excluirDocumento } from '@/lib/armazenamento'
import { ehPdf } from '@/lib/pdf-compactar'
import { formatarBytes, formatarData } from '@/lib/formato'
import { supabase } from '@/lib/supabase'
import { Botao, Esqueleto, Interruptor, Progresso, Selo, Vazio } from './ui'
import { useAvisos } from './avisos'

export function ListaDocumentos({
  documentos, carregando, obra, podeEditar,
}: {
  documentos: Documento[]
  carregando?: boolean
  obra: { id: string; empresa_id: string }
  podeEditar: boolean
}) {
  const avisos = useAvisos()
  const qc = useQueryClient()
  const entrada = useRef<HTMLInputElement>(null)
  const [visivel, setVisivel] = useState(false)
  const [envio, setEnvio] = useState<{ total: number; feitos: number; nome: string } | null>(null)
  const atualizar = () => {
    void qc.invalidateQueries({ queryKey: ['documentos', obra.id] })
    void qc.invalidateQueries({ queryKey: ['painel'] })
    void qc.invalidateQueries({ queryKey: ['empresa'] })
  }

  async function enviar(arquivos: File[]) {
    const pdfs = arquivos.filter(ehPdf)
    if (pdfs.length < arquivos.length) avisos.info('Somente arquivos PDF são aceitos.')
    if (!pdfs.length) return
    setEnvio({ total: pdfs.length, feitos: 0, nome: pdfs[0]!.name })
    let ok = 0
    for (const [i, a] of pdfs.entries()) {
      setEnvio({ total: pdfs.length, feitos: i, nome: a.name })
      try {
        await enviarDocumento(a, obra.empresa_id, obra.id, visivel)
        ok++
      } catch (e) {
        avisos.erro(e)
      }
    }
    setEnvio(null)
    if (ok) avisos.sucesso(`${ok} documento(s) enviado(s), compactado(s) antes do envio.`)
    atualizar()
  }

  async function alternar(d: Documento) {
    const { error } = await supabase.from('documentos').update({ visivel_cliente: !d.visivel_cliente }).eq('id', d.id)
    if (error) return avisos.erro(error)
    atualizar()
  }

  async function excluir(d: Documento) {
    const ok = await avisos.confirmar({ titulo: 'Excluir documento?', descricao: <>O arquivo <strong>{d.nome}</strong> será apagado definitivamente.</>, confirmar: 'Excluir', perigo: true })
    if (!ok) return
    try {
      await excluirDocumento(d)
      avisos.sucesso('Documento excluído.')
      atualizar()
    } catch (e) {
      avisos.erro(e)
    }
  }

  async function abrir(d: Documento) {
    try {
      await abrirDocumento(d.path, d.nome)
    } catch (e) {
      avisos.erro(e)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {podeEditar && (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-linha-forte bg-papel/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <input ref={entrada} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { void enviar([...(e.target.files ?? [])]); e.target.value = '' }} />
          <div className="flex items-center gap-3">
            <Botao variante="secundario" icone={<FileUp className="size-4" />} onClick={() => entrada.current?.click()} carregando={!!envio}>
              Anexar PDF
            </Botao>
            <p className="text-xs text-tinta-fraca">Até 15 MB. Regravado e compactado antes do envio.</p>
          </div>
          <Interruptor ligado={visivel} aoMudar={setVisivel} rotulo="Visível ao cliente" />
        </div>
      )}
      {envio && (
        <div>
          <p className="mb-1 text-xs text-tinta-suave">Compactando e enviando “{envio.nome}” ({envio.feitos + 1}/{envio.total})…</p>
          <Progresso valor={((envio.feitos + 0.5) / envio.total) * 100} />
        </div>
      )}
      {carregando ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Esqueleto key={i} className="h-14" />)}</div>
      ) : !documentos.length ? (
        <Vazio compacto titulo="Nenhum documento" descricao={podeEditar ? 'Anexe projetos, ARTs, contratos e laudos em PDF.' : 'Ainda não há documentos compartilhados.'} icone={<FileText className="size-3.5" />} />
      ) : (
        <ul className="cartao divide-y divide-linha">
          {documentos.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => void abrir(d)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Abrir ${d.nome}`}>
                <span className="relative flex h-10 w-8 shrink-0 items-end justify-center rounded-[3px] border border-linha-forte bg-white pb-1 shadow-suave">
                  <span className="absolute top-0 right-0 size-2.5 border-b border-l border-linha-forte bg-papel" />
                  <span className="font-mono text-[7px] font-bold text-perigo-600">PDF</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-tinta hover:text-marinho-700 hover:underline">{d.nome}</span>
                  <span className="num block text-[11px] text-tinta-fraca">{formatarBytes(paraNumero(d.bytes))} · {formatarData(d.criado_em)}</span>
                </span>
              </button>
              {podeEditar ? (
                <>
                  <button
                    onClick={() => void alternar(d)}
                    className="hidden items-center sm:flex"
                    title={d.visivel_cliente ? 'Visível ao cliente — clique para ocultar' : 'Oculto do cliente — clique para mostrar'}
                  >
                    {d.visivel_cliente ? <Selo tom="ok">Cliente vê</Selo> : <Selo tom="neutro">Interno</Selo>}
                  </button>
                  <Botao variante="fantasma" apenasIcone tamanho="p" className="sm:hidden" onClick={() => void alternar(d)} icone={d.visivel_cliente ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} aria-label="Alternar visibilidade ao cliente" />
                  <Botao variante="fantasma" apenasIcone tamanho="p" onClick={() => void excluir(d)} icone={<Trash2 className="size-3.5 text-perigo-600" />} aria-label="Excluir documento" />
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
