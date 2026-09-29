import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Building2, LogIn, MoreHorizontal, Pencil, Plus, Search, Trash2, UserPlus } from 'lucide-react'
import { z } from 'zod'
import type { Empresa } from '@/tipos/banco'
import { paraNumero } from '@/tipos/banco'
import { supabase, exigir, mensagemDeErro } from '@/lib/supabase'
import { useSessao } from '@/lib/sessao'
import { removerPasta } from '@/lib/armazenamento'
import { formatarBytes, formatarData, normalizar, percentualUso } from '@/lib/formato'
import { UFS } from '@/lib/rotulos'
import { Botao, CabecalhoPagina, Campo, CampoTexto, Erro, Esqueleto, Interruptor, Modal, Progresso, Selecao, Selo, Vazio } from '@/componentes/ui'
import { ImagemAssinada } from '@/componentes/midia'
import { ModalNovoUsuario } from '@/componentes/usuarios'
import { useAvisos } from '@/componentes/avisos'

type EmpresaLista = Empresa & { obras?: { count: number }[]; perfis?: { count: number }[] }

function useEmpresas() {
  return useQuery({
    queryKey: ['empresas'],
    queryFn: async () => {
      const r = await supabase.from('empresas').select('*, obras(count), perfis(count)').order('nome')
      if (!r.error) return r.data as EmpresaLista[]
      return exigir(await supabase.from('empresas').select('*').order('nome')) as EmpresaLista[]
    },
  })
}

export default function Empresas() {
  const lista = useEmpresas()
  const { trocarEmpresa, recarregar } = useSessao()
  const navegar = useNavigate()
  const avisos = useAvisos()
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Empresa | 'nova' | null>(null)
  const [adminDe, setAdminDe] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)

  const itens = useMemo(() => {
    const q = normalizar(busca)
    return (lista.data ?? []).filter((e) => !q || normalizar(`${e.nome} ${e.cnpj ?? ''} ${e.cidade ?? ''}`).includes(q))
  }, [lista.data, busca])
  const totalUsado = (lista.data ?? []).reduce((s, e) => s + paraNumero(e.armazenamento_usado_bytes), 0)

  function entrar(e: Empresa) {
    trocarEmpresa(e.id)
    navegar('/painel')
  }

  async function excluir(e: Empresa) {
    const ok = await avisos.confirmar({
      titulo: `Excluir ${e.nome}?`,
      descricao: <>Todas as obras, relatórios, fotos, documentos e usuários desta empresa serão apagados definitivamente, inclusive os arquivos no armazenamento.</>,
      confirmar: 'Excluir empresa',
      perigo: true,
      digitar: e.nome,
    })
    if (!ok) return
    try {
      const n = await removerPasta(e.id)
      // usuários da empresa: apaga do auth (o perfil cai em cascata)
      const { data: us } = await supabase.from('perfis').select('id').eq('empresa_id', e.id)
      for (const u of (us as { id: string }[] | null) ?? []) await supabase.rpc('admin_excluir_usuario', { p_usuario: u.id })
      const { error } = await supabase.from('empresas').delete().eq('id', e.id)
      if (error) throw error
      avisos.sucesso(`Empresa excluída (${n} arquivo(s) removidos).`)
      trocarEmpresa(null)
      void qc.invalidateQueries({ queryKey: ['empresas'] })
      void recarregar()
    } catch (err) {
      avisos.erro(err)
    }
  }

  return (
    <>
      <CabecalhoPagina
        sobretitulo={<span className="text-ambar-700">Plataforma · master</span>}
        titulo="Empresas"
        subtitulo={`${lista.data?.length ?? 0} empresas · ${formatarBytes(totalUsado)} armazenados no total`}
        acoes={<Botao variante="ambar" icone={<Plus className="size-4" />} onClick={() => setEditando('nova')}>Nova empresa</Botao>}
      />
      <label className="relative mb-4 block sm:w-80">
        <span className="sr-only">Buscar empresa</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-tinta-fraca" />
        <input className="campo pl-8" placeholder="Buscar por nome, CNPJ, cidade…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </label>

      {lista.isError ? (
        <Erro mensagem={mensagemDeErro(lista.error)} aoTentar={() => void lista.refetch()} />
      ) : lista.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Esqueleto key={i} className="h-20" />)}</div>
      ) : !itens.length ? (
        <Vazio titulo="Nenhuma empresa" descricao="Cadastre a primeira construtora da plataforma." icone={<Building2 className="size-3.5" />} acao={<Botao icone={<Plus className="size-4" />} onClick={() => setEditando('nova')}>Nova empresa</Botao>} />
      ) : (
        <div className="cartao overflow-hidden">
          <div className="hidden grid-cols-[1.6fr_90px_90px_1.2fr_110px_120px] gap-4 border-b border-linha bg-papel px-4 py-2 md:grid">
            {['Empresa', 'Obras', 'Usuários', 'Armazenamento', 'Situação', ''].map((c) => <span key={c} className="rotulo !text-[9.5px]">{c}</span>)}
          </div>
          <ul className="divide-y divide-linha">
            {itens.map((e) => {
              const usado = paraNumero(e.armazenamento_usado_bytes)
              const limite = e.limite_armazenamento_mb * 1048576
              const pct = percentualUso(usado, limite)
              return (
                <li key={e.id} className={clsx('grid gap-3 px-4 py-3.5 md:grid-cols-[1.6fr_90px_90px_1.2fr_110px_120px] md:items-center md:gap-4', !e.ativa && 'bg-papel/70')}>
                  <div className="flex min-w-0 items-center gap-3">
                    <ImagemAssinada caminho={e.logo_path} alt="" className="size-10 shrink-0 rounded-md border border-linha bg-white" classeImg="!object-contain p-0.5" fallback={<Building2 className="size-4" />} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-tinta">{e.nome}</p>
                      <p className="truncate text-[11px] text-tinta-fraca">{[e.cnpj, [e.cidade, e.uf].filter(Boolean).join('/'), `desde ${formatarData(e.criado_em)}`].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                  <p className="num text-[12.5px] text-tinta-suave"><span className="rotulo md:hidden">Obras </span>{e.obras?.[0]?.count ?? '—'}</p>
                  <p className="num text-[12.5px] text-tinta-suave"><span className="rotulo md:hidden">Usuários </span>{e.perfis?.[0]?.count ?? '—'}</p>
                  <div>
                    <Progresso valor={pct} tom={pct > 90 ? 'perigo' : pct > 70 ? 'ambar' : 'marinho'} altura={5} rotuloAcessivel={`Armazenamento de ${e.nome}`} />
                    <p className="num mt-1 text-[10.5px] text-tinta-fraca">{formatarBytes(usado)} / {formatarBytes(limite, 0)} · {pct.toFixed(0)}%</p>
                  </div>
                  <div>{e.ativa ? <Selo tom="ok">Ativa</Selo> : <Selo tom="perigo">Inativa</Selo>}</div>
                  <div className="flex items-center justify-end gap-1.5">
                    <Botao variante="secundario" tamanho="p" icone={<LogIn className="size-3.5" />} onClick={() => entrar(e)}>Entrar</Botao>
                    <div className="relative">
                      <Botao variante="fantasma" tamanho="p" apenasIcone icone={<MoreHorizontal className="size-4" />} onClick={() => setMenu(menu === e.id ? null : e.id)} aria-label={`Mais ações para ${e.nome}`} />
                      {menu === e.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} aria-hidden />
                          <div role="menu" className="anim-subir absolute right-0 z-20 mt-1 w-52 rounded-lg border border-linha bg-white p-1.5 shadow-flutuante">
                            <button role="menuitem" onClick={() => { setEditando(e); setMenu(null) }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] hover:bg-marinho-50"><Pencil className="size-3.5 text-tinta-fraca" /> Editar e limites</button>
                            <button role="menuitem" onClick={() => { setAdminDe(e.id); setMenu(null) }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] hover:bg-marinho-50"><UserPlus className="size-3.5 text-tinta-fraca" /> Criar usuário</button>
                            <div className="my-1 border-t border-dashed border-linha-forte" />
                            <button role="menuitem" onClick={() => { void excluir(e); setMenu(null) }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] text-perigo-600 hover:bg-perigo-50"><Trash2 className="size-3.5" /> Excluir empresa</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <ModalEmpresa
        alvo={editando}
        aoFechar={() => setEditando(null)}
        aoCriar={(id) => setAdminDe(id)}
      />
      <ModalNovoUsuario aberto={!!adminDe} aoFechar={() => setAdminDe(null)} papeis={['admin', 'colaborador', 'cliente']} papelInicial="admin" empresaIdFixa={adminDe} />
    </>
  )
}

const esquema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.'),
  limite: z.number().int().min(50, 'Mínimo de 50 MB.').max(1024 * 1024, 'Limite muito alto.'),
})

function ModalEmpresa({ alvo, aoFechar, aoCriar }: { alvo: Empresa | 'nova' | null; aoFechar: () => void; aoCriar: (id: string) => void }) {
  const avisos = useAvisos()
  const qc = useQueryClient()
  const { recarregar } = useSessao()
  const e = alvo && alvo !== 'nova' ? alvo : null
  const vazio = { nome: '', cnpj: '', email: '', telefone: '', endereco: '', cidade: '', uf: '', limite: '2048', ativa: true }
  const [f, setF] = useState(vazio)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    if (!alvo) return
    setErros({})
    setF(e ? { nome: e.nome, cnpj: e.cnpj ?? '', email: e.email ?? '', telefone: e.telefone ?? '', endereco: e.endereco ?? '', cidade: e.cidade ?? '', uf: e.uf ?? '', limite: String(e.limite_armazenamento_mb), ativa: e.ativa } : vazio)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo])
  const mudar = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }))

  async function salvar(ev: FormEvent) {
    ev.preventDefault()
    const r = esquema.safeParse({ nome: f.nome, limite: Number(f.limite) })
    if (!r.success) {
      const n: Record<string, string> = {}
      for (const i of r.error.issues) n[String(i.path[0])] = i.message
      return setErros(n)
    }
    const n = (s: string) => s.trim() || null
    const dados = { nome: f.nome.trim(), cnpj: n(f.cnpj), email: n(f.email), telefone: n(f.telefone), endereco: n(f.endereco), cidade: n(f.cidade), uf: n(f.uf), limite_armazenamento_mb: Number(f.limite), ativa: f.ativa }
    setSalvando(true)
    const res = e
      ? await supabase.from('empresas').update(dados).eq('id', e.id).select('id').single()
      : await supabase.from('empresas').insert(dados).select('id').single()
    setSalvando(false)
    if (res.error) return avisos.erro(res.error)
    avisos.sucesso(e ? 'Empresa atualizada.' : 'Empresa criada. Agora crie o administrador dela.')
    void qc.invalidateQueries({ queryKey: ['empresas'] })
    void recarregar()
    aoFechar()
    if (!e) aoCriar((res.data as { id: string }).id)
  }

  return (
    <Modal
      aberto={!!alvo}
      aoFechar={aoFechar}
      titulo={e ? 'Editar empresa' : 'Nova empresa'}
      descricao={e ? e.nome : 'Depois de criar, cadastre o administrador — ele cuida do resto.'}
      codigo="MASTER · EMPRESA"
      largura="lg"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-empresa" carregando={salvando}>{e ? 'Salvar' : 'Criar empresa'}</Botao></>}
    >
      <form id="form-empresa" onSubmit={salvar} className="grid gap-4 sm:grid-cols-6" noValidate>
        <CampoTexto rotulo="Nome" obrigatorio value={f.nome} onChange={(x) => mudar('nome', x.target.value)} erro={erros.nome} className="sm:col-span-4" />
        <CampoTexto rotulo="CNPJ" value={f.cnpj} onChange={(x) => mudar('cnpj', x.target.value)} className="sm:col-span-2" />
        <CampoTexto rotulo="E-mail" type="email" value={f.email} onChange={(x) => mudar('email', x.target.value)} className="sm:col-span-3" />
        <CampoTexto rotulo="Telefone" value={f.telefone} onChange={(x) => mudar('telefone', x.target.value)} className="sm:col-span-3" />
        <CampoTexto rotulo="Endereço" value={f.endereco} onChange={(x) => mudar('endereco', x.target.value)} className="sm:col-span-6" />
        <CampoTexto rotulo="Cidade" value={f.cidade} onChange={(x) => mudar('cidade', x.target.value)} className="sm:col-span-4" />
        <Campo rotulo="UF" className="sm:col-span-2" htmlFor="me-uf">
          <Selecao id="me-uf" value={f.uf} onChange={(x) => mudar('uf', x.target.value)}>
            <option value="">—</option>
            {UFS.map((u) => <option key={u}>{u}</option>)}
          </Selecao>
        </Campo>
        <div className="cota sm:col-span-6" aria-hidden />
        <CampoTexto rotulo="Limite de armazenamento (MB)" type="number" min={50} step={256} value={f.limite} onChange={(x) => mudar('limite', x.target.value)} erro={erros.limite} className="sm:col-span-3" dica={`≈ ${(Number(f.limite) / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB · cerca de ${Math.round((Number(f.limite) * 1024) / 220).toLocaleString('pt-BR')} fotos`} />
        <div className="flex items-end sm:col-span-3">
          <Interruptor ligado={f.ativa} aoMudar={(v) => mudar('ativa', v)} rotulo="Empresa ativa" descricao="Inativa: ninguém da empresa (nem clientes) consegue ver nada." />
        </div>
      </form>
    </Modal>
  )
}
