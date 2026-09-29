import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Trash2 } from 'lucide-react'
import { z } from 'zod'
import type { Obra, StatusObra } from '@/tipos/banco'
import { supabase } from '@/lib/supabase'
import { useSessao } from '@/lib/sessao'
import { enviarCapa, removerArquivos } from '@/lib/armazenamento'
import { previsaoPorPrazo } from '@/lib/prazo'
import { STATUS_OBRA, UFS } from '@/lib/rotulos'
import { AreaTexto, Botao, Campo, CampoTexto, Modal, Selecao } from './ui'
import { ImagemAssinada } from './midia'
import { useAvisos } from './avisos'

const esquema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da obra.'),
  prazo_dias: z.number().int().positive('Prazo deve ser positivo.').nullable(),
})

type Form = {
  nome: string
  codigo: string
  status: StatusObra
  endereco: string
  cidade: string
  uf: string
  contratante: string
  responsavel_tecnico: string
  data_inicio: string
  prazo_dias: string
  previsao_termino: string
  observacoes: string
  empresa_id: string
}

function inicial(o?: Obra | null, empresaId?: string | null): Form {
  return {
    nome: o?.nome ?? '',
    codigo: o?.codigo ?? '',
    status: o?.status ?? 'em_andamento',
    endereco: o?.endereco ?? '',
    cidade: o?.cidade ?? '',
    uf: o?.uf ?? '',
    contratante: o?.contratante ?? '',
    responsavel_tecnico: o?.responsavel_tecnico ?? '',
    data_inicio: o?.data_inicio ?? '',
    prazo_dias: o?.prazo_dias ? String(o.prazo_dias) : '',
    previsao_termino: o?.previsao_termino ?? '',
    observacoes: o?.observacoes ?? '',
    empresa_id: o?.empresa_id ?? empresaId ?? '',
  }
}

const nulo = (s: string) => (s.trim() ? s.trim() : null)

export function FormularioObra({
  aberto, aoFechar, obra, aoSalvar,
}: {
  aberto: boolean
  aoFechar: () => void
  obra?: Obra | null
  aoSalvar?: (id: string) => void
}) {
  const { empresaId, ehMaster, empresas } = useSessao()
  const avisos = useAvisos()
  const qc = useQueryClient()
  const [f, setF] = useState<Form>(() => inicial(obra, empresaId))
  const [erros, setErros] = useState<Partial<Record<keyof Form, string>>>({})
  const [capa, setCapa] = useState<File | null>(null)
  const [previa, setPrevia] = useState<string | null>(null)
  const [removerCapa, setRemoverCapa] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (aberto) {
      setF(inicial(obra, empresaId))
      setErros({})
      setCapa(null)
      setPrevia(null)
      setRemoverCapa(false)
    }
  }, [aberto, obra, empresaId])

  useEffect(() => () => {
    if (previa) URL.revokeObjectURL(previa)
  }, [previa])

  const mudar = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const previsaoSugerida = previsaoPorPrazo(f.data_inicio || null, Number(f.prazo_dias) || null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const prazo = f.prazo_dias.trim() ? Number(f.prazo_dias) : null
    const r = esquema.safeParse({ nome: f.nome, prazo_dias: prazo })
    const novos: typeof erros = {}
    if (!r.success) for (const i of r.error.issues) novos[i.path[0] as keyof Form] = i.message
    if (!f.empresa_id) novos.empresa_id = 'Escolha a empresa.'
    setErros(novos)
    if (Object.keys(novos).length) return

    const dados = {
      nome: f.nome.trim(),
      codigo: nulo(f.codigo),
      status: f.status,
      endereco: nulo(f.endereco),
      cidade: nulo(f.cidade),
      uf: nulo(f.uf),
      contratante: nulo(f.contratante),
      responsavel_tecnico: nulo(f.responsavel_tecnico),
      data_inicio: nulo(f.data_inicio),
      prazo_dias: prazo,
      previsao_termino: nulo(f.previsao_termino) ?? previsaoSugerida,
      observacoes: nulo(f.observacoes),
    }
    setSalvando(true)
    try {
      let id = obra?.id
      if (!id) {
        const { data, error } = await supabase.from('obras').insert({ ...dados, empresa_id: f.empresa_id }).select('id').single()
        if (error) throw error
        id = (data as { id: string }).id
      } else {
        const { error } = await supabase.from('obras').update({ ...dados, atualizado_em: new Date().toISOString() }).eq('id', id)
        if (error) throw error
      }
      if (capa) {
        const caminhos = await enviarCapa(capa, f.empresa_id, id)
        const { error } = await supabase.from('obras').update(caminhos).eq('id', id)
        if (error) throw error
        if (obra?.capa_path) await removerArquivos([obra.capa_path, obra.capa_thumb_path])
      } else if (removerCapa && obra?.capa_path) {
        await supabase.from('obras').update({ capa_path: null, capa_thumb_path: null }).eq('id', id)
        await removerArquivos([obra.capa_path, obra.capa_thumb_path])
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['obras'] }),
        qc.invalidateQueries({ queryKey: ['obra', id] }),
        qc.invalidateQueries({ queryKey: ['painel'] }),
      ])
      avisos.sucesso(obra ? 'Obra atualizada.' : 'Obra cadastrada.')
      aoFechar()
      aoSalvar?.(id)
    } catch (err) {
      avisos.erro(err)
    } finally {
      setSalvando(false)
    }
  }

  const temCapa = !removerCapa && (previa || obra?.capa_thumb_path)

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={obra ? 'Editar obra' : 'Nova obra'}
      descricao={obra ? obra.nome : 'Cadastre os dados principais. Você pode completar depois.'}
      codigo={obra?.codigo ? `OBRA · ${obra.codigo}` : 'OBRA · CADASTRO'}
      largura="lg"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" form="form-obra" carregando={salvando}>{obra ? 'Salvar alterações' : 'Cadastrar obra'}</Botao>
        </>
      }
    >
      <form id="form-obra" onSubmit={salvar} className="grid gap-4 sm:grid-cols-6" noValidate>
        {/* capa */}
        <div className="sm:col-span-6">
          <p className="rotulo mb-1.5">Foto de capa</p>
          <div className="flex items-center gap-3">
            <div className="relative aspect-[16/9] w-40 shrink-0 overflow-hidden rounded-md border border-linha">
              {previa ? (
                <img src={previa} alt="Prévia da capa" className="size-full object-cover" />
              ) : temCapa ? (
                <ImagemAssinada caminho={obra?.capa_thumb_path} alt="Capa atual" className="size-full" />
              ) : (
                <div className="milimetrado flex size-full items-center justify-center text-marinho-300">
                  <ImagePlus className="size-5" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <input
                ref={entrada}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const a = e.target.files?.[0]
                  if (a) {
                    setCapa(a)
                    setPrevia(URL.createObjectURL(a))
                    setRemoverCapa(false)
                  }
                  e.target.value = ''
                }}
              />
              <Botao variante="secundario" tamanho="p" icone={<ImagePlus className="size-3.5" />} onClick={() => entrada.current?.click()}>
                {temCapa ? 'Trocar imagem' : 'Escolher imagem'}
              </Botao>
              {temCapa && (
                <Botao variante="fantasma" tamanho="p" icone={<Trash2 className="size-3.5" />} onClick={() => { setCapa(null); setPrevia(null); setRemoverCapa(true) }}>
                  Remover
                </Botao>
              )}
              <p className="text-[11px] text-tinta-fraca">Comprimida para WebP antes de enviar.</p>
            </div>
          </div>
        </div>

        {ehMaster && !obra && (
          <Campo rotulo="Empresa" obrigatorio erro={erros.empresa_id} className="sm:col-span-6" htmlFor="ob-emp">
            <Selecao id="ob-emp" value={f.empresa_id} onChange={(e) => mudar('empresa_id', e.target.value)}>
              <option value="">Selecione…</option>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </Selecao>
          </Campo>
        )}
        <CampoTexto rotulo="Nome da obra" obrigatorio value={f.nome} onChange={(e) => mudar('nome', e.target.value)} erro={erros.nome} className="sm:col-span-4" placeholder="Residencial Vista Azul" />
        <CampoTexto rotulo="Código" value={f.codigo} onChange={(e) => mudar('codigo', e.target.value)} className="sm:col-span-2" placeholder="OB-024" />
        <Campo rotulo="Status" className="sm:col-span-2" htmlFor="ob-st">
          <Selecao id="ob-st" value={f.status} onChange={(e) => mudar('status', e.target.value as StatusObra)}>
            {(Object.keys(STATUS_OBRA) as StatusObra[]).map((s) => <option key={s} value={s}>{STATUS_OBRA[s].rotulo}</option>)}
          </Selecao>
        </Campo>
        <CampoTexto rotulo="Contratante" value={f.contratante} onChange={(e) => mudar('contratante', e.target.value)} className="sm:col-span-2" />
        <CampoTexto rotulo="Responsável técnico" value={f.responsavel_tecnico} onChange={(e) => mudar('responsavel_tecnico', e.target.value)} className="sm:col-span-2" placeholder="Eng. — CREA" />
        <CampoTexto rotulo="Endereço" value={f.endereco} onChange={(e) => mudar('endereco', e.target.value)} className="sm:col-span-6" />
        <CampoTexto rotulo="Cidade" value={f.cidade} onChange={(e) => mudar('cidade', e.target.value)} className="sm:col-span-4" />
        <Campo rotulo="UF" className="sm:col-span-2" htmlFor="ob-uf">
          <Selecao id="ob-uf" value={f.uf} onChange={(e) => mudar('uf', e.target.value)}>
            <option value="">—</option>
            {UFS.map((u) => <option key={u}>{u}</option>)}
          </Selecao>
        </Campo>
        <div className="cota sm:col-span-6" aria-hidden />
        <CampoTexto rotulo="Início" type="date" value={f.data_inicio} onChange={(e) => mudar('data_inicio', e.target.value)} className="sm:col-span-2" />
        <CampoTexto rotulo="Prazo (dias)" type="number" min={1} inputMode="numeric" value={f.prazo_dias} onChange={(e) => mudar('prazo_dias', e.target.value)} erro={erros.prazo_dias} className="sm:col-span-2" />
        <CampoTexto
          rotulo="Previsão de término"
          type="date"
          value={f.previsao_termino}
          onChange={(e) => mudar('previsao_termino', e.target.value)}
          className="sm:col-span-2"
          dica={!f.previsao_termino && previsaoSugerida ? `Calculada: ${previsaoSugerida.split('-').reverse().join('/')}` : undefined}
        />
        <Campo rotulo="Observações" className="sm:col-span-6" htmlFor="ob-obs">
          <AreaTexto id="ob-obs" value={f.observacoes} onChange={(e) => mudar('observacoes', e.target.value)} rows={3} />
        </Campo>
      </form>
    </Modal>
  )
}
