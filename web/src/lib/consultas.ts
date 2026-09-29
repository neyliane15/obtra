import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, exigir } from './supabase'
import { useSessao } from './sessao'
import { enviarFoto } from './armazenamento'
import type {
  Atividade, Comentario, Documento, Empresa, Equipamento, Foto, MaoObra, Material, Obra, Ocorrencia, PainelResumo, Perfil, Relatorio,
} from '@/tipos/banco'
import type { ProgressoEnvio } from '@/componentes/midia'

export type ObraLista = Obra & { empresas?: { nome: string } | null }

export function useObras() {
  const { empresaId } = useSessao()
  return useQuery({
    queryKey: ['obras', empresaId],
    queryFn: async () => {
      let q = supabase.from('obras').select('*, empresas(nome)').order('status').order('nome')
      if (empresaId) q = q.eq('empresa_id', empresaId)
      return exigir(await q) as ObraLista[]
    },
  })
}

export function useObra(id: string | undefined) {
  return useQuery({
    queryKey: ['obra', id],
    enabled: !!id,
    queryFn: async () => exigir(await supabase.from('obras').select('*, empresas(nome)').eq('id', id!).maybeSingle()) as ObraLista | null,
  })
}

export function useEmpresa(id: string | null | undefined) {
  return useQuery({
    queryKey: ['empresa', id],
    enabled: !!id,
    queryFn: async () => exigir(await supabase.from('empresas').select('*').eq('id', id!).maybeSingle()) as Empresa | null,
  })
}

export type RelatorioLista = Pick<
  Relatorio,
  'id' | 'obra_id' | 'numero' | 'data' | 'status' | 'clima_manha' | 'clima_tarde' | 'clima_noite' | 'condicao_manha' | 'condicao_tarde' | 'pluviometria_mm' | 'criado_em' | 'atualizado_em'
>

export function useRelatorios(obraId: string | undefined) {
  return useQuery({
    queryKey: ['relatorios', obraId],
    enabled: !!obraId,
    queryFn: async () =>
      exigir(
        await supabase
          .from('relatorios')
          .select('id, obra_id, numero, data, status, clima_manha, clima_tarde, clima_noite, condicao_manha, condicao_tarde, pluviometria_mm, criado_em, atualizado_em')
          .eq('obra_id', obraId!)
          .order('numero', { ascending: false }),
      ) as RelatorioLista[],
  })
}

export interface RelatorioCompleto {
  relatorio: Relatorio
  maoObra: MaoObra[]
  equipamentos: Equipamento[]
  atividades: Atividade[]
  ocorrencias: Ocorrencia[]
  materiais: Material[]
}

export async function carregarRelatorio(id: string): Promise<RelatorioCompleto | null> {
  const [r, mo, eq, at, oc, ma] = await Promise.all([
    supabase.from('relatorios').select('*').eq('id', id).maybeSingle(),
    supabase.from('relatorio_mao_obra').select('*').eq('relatorio_id', id).order('ordem'),
    supabase.from('relatorio_equipamentos').select('*').eq('relatorio_id', id).order('ordem'),
    supabase.from('relatorio_atividades').select('*').eq('relatorio_id', id).order('ordem'),
    supabase.from('relatorio_ocorrencias').select('*').eq('relatorio_id', id).order('ordem'),
    supabase.from('relatorio_materiais').select('*').eq('relatorio_id', id).order('ordem'),
  ])
  const relatorio = exigir(r) as Relatorio | null
  if (!relatorio) return null
  return {
    relatorio,
    maoObra: exigir(mo) as MaoObra[],
    equipamentos: exigir(eq) as Equipamento[],
    atividades: exigir(at) as Atividade[],
    ocorrencias: exigir(oc) as Ocorrencia[],
    materiais: exigir(ma) as Material[],
  }
}

export function useRelatorio(id: string | undefined) {
  return useQuery({ queryKey: ['relatorio', id], enabled: !!id, queryFn: () => carregarRelatorio(id!) })
}

export type ComentarioComAutor = Comentario & { autor?: { nome: string; papel: string } | null }

export async function carregarComentarios(relatorioId: string): Promise<ComentarioComAutor[]> {
  const r = await supabase
    .from('relatorio_comentarios')
    .select('*, autor:perfis(nome, papel)')
    .eq('relatorio_id', relatorioId)
    .order('criado_em')
  if (!r.error) return (r.data ?? []) as ComentarioComAutor[]
  // sem permissão de ler perfis alheios (ou sem FK exposta): sem o nome
  return exigir(await supabase.from('relatorio_comentarios').select('*').eq('relatorio_id', relatorioId).order('criado_em')) as ComentarioComAutor[]
}

export function useComentarios(relatorioId: string | undefined) {
  return useQuery({ queryKey: ['comentarios', relatorioId], enabled: !!relatorioId, queryFn: () => carregarComentarios(relatorioId!) })
}

export function useFotosObra(obraId: string | undefined) {
  return useQuery({
    queryKey: ['fotos', obraId],
    enabled: !!obraId,
    queryFn: async () =>
      exigir(await supabase.from('fotos').select('*').eq('obra_id', obraId!).order('criado_em', { ascending: false })) as Foto[],
  })
}

export function useFotosRelatorio(relatorioId: string | undefined) {
  return useQuery({
    queryKey: ['fotos-relatorio', relatorioId],
    enabled: !!relatorioId,
    queryFn: async () =>
      exigir(await supabase.from('fotos').select('*').eq('relatorio_id', relatorioId!).order('criado_em')) as Foto[],
  })
}

export function useDocumentos(obraId: string | undefined) {
  return useQuery({
    queryKey: ['documentos', obraId],
    enabled: !!obraId,
    queryFn: async () =>
      exigir(await supabase.from('documentos').select('*').eq('obra_id', obraId!).order('criado_em', { ascending: false })) as Documento[],
  })
}

export function usePainel() {
  return useQuery({
    queryKey: ['painel'],
    queryFn: async () => exigir(await supabase.rpc('painel_resumo')) as PainelResumo,
  })
}

/** Usuários de uma empresa (ou todos, para o master sem filtro). */
export function usePerfis(empresaId: string | null, opcoes: { todos?: boolean } = {}) {
  return useQuery({
    queryKey: ['perfis', empresaId, opcoes.todos ?? false],
    enabled: !!empresaId || !!opcoes.todos,
    queryFn: async () => {
      let q = supabase.from('perfis').select('*').order('nome')
      if (empresaId) q = q.eq('empresa_id', empresaId)
      return exigir(await q) as Perfil[]
    },
  })
}

export function useVinculos(empresaId: string | null) {
  return useQuery({
    queryKey: ['vinculos', empresaId],
    queryFn: async () => exigir(await supabase.from('obra_clientes').select('obra_id, cliente_id')) as { obra_id: string; cliente_id: string }[],
  })
}

/** Envia várias fotos em sequência, com progresso e contagem de falhas. */
export function useEnvioFotos(destino: { empresaId?: string; obraId?: string; relatorioId?: string | null }, aoErro: (e: unknown) => void) {
  const qc = useQueryClient()
  const [progresso, setProgresso] = useState<ProgressoEnvio | null>(null)
  const enviar = useCallback(
    async (arquivos: File[]) => {
      if (!destino.empresaId || !destino.obraId) return
      const p: ProgressoEnvio = { total: arquivos.length, feitos: 0, falhas: 0 }
      setProgresso({ ...p })
      let ultimoErro: unknown = null
      for (const a of arquivos) {
        try {
          await enviarFoto(a, { empresaId: destino.empresaId, obraId: destino.obraId, relatorioId: destino.relatorioId })
          p.feitos++
        } catch (e) {
          p.falhas++
          ultimoErro = e
          // cota estourada: não adianta insistir nas próximas
          if (/Limite de armazenamento/i.test(String((e as { message?: string })?.message))) {
            p.falhas += p.total - p.feitos - p.falhas
            setProgresso({ ...p })
            break
          }
        }
        setProgresso({ ...p })
      }
      if (ultimoErro) aoErro(ultimoErro)
      void qc.invalidateQueries({ queryKey: ['fotos', destino.obraId] })
      if (destino.relatorioId) void qc.invalidateQueries({ queryKey: ['fotos-relatorio', destino.relatorioId] })
      void qc.invalidateQueries({ queryKey: ['painel'] })
      setTimeout(() => setProgresso(null), 2500)
    },
    [destino.empresaId, destino.obraId, destino.relatorioId, qc, aoErro],
  )
  return { enviar, progresso }
}
