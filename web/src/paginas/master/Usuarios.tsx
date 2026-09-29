import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Search, ShieldCheck, UserPlus } from 'lucide-react'
import type { Papel } from '@/tipos/banco'
import { usePerfis } from '@/lib/consultas'
import { useSessao } from '@/lib/sessao'
import { normalizar } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/supabase'
import { PAPEL } from '@/lib/rotulos'
import { Botao, CabecalhoPagina, Erro, Selecao, Vazio } from '@/componentes/ui'
import { ListaUsuarios } from '@/componentes/listaUsuarios'
import { ModalNovoUsuario } from '@/componentes/usuarios'

export default function Usuarios() {
  const { empresas, empresaId } = useSessao()
  const perfis = usePerfis(null, { todos: true })
  const [busca, setBusca] = useState('')
  const [papel, setPapel] = useState<Papel | 'todos'>('todos')
  const [empresa, setEmpresa] = useState<string>(empresaId ?? '')
  const [novo, setNovo] = useState(false)
  const nomeEmpresa = (id: string | null) => empresas.find((e) => e.id === id)?.nome

  const lista = useMemo(() => {
    const q = normalizar(busca)
    return (perfis.data ?? []).filter(
      (p) =>
        (papel === 'todos' || p.papel === papel) &&
        (!empresa || p.empresa_id === empresa) &&
        (!q || normalizar(`${p.nome} ${p.email} ${nomeEmpresa(p.empresa_id) ?? ''}`).includes(q)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfis.data, busca, papel, empresa, empresas])

  const contagem = (p: Papel | 'todos') => (perfis.data ?? []).filter((x) => p === 'todos' || x.papel === p).length

  return (
    <>
      <CabecalhoPagina
        sobretitulo={<span className="text-ambar-700">Plataforma · master</span>}
        titulo="Todos os usuários"
        subtitulo={`${perfis.data?.length ?? 0} contas em ${empresas.length} empresas`}
        acoes={<Botao icone={<UserPlus className="size-4" />} onClick={() => setNovo(true)}>Novo usuário</Botao>}
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="rolagem-fina -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          {(['todos', 'master', 'admin', 'colaborador', 'cliente'] as const).map((p) => (
            <button key={p} onClick={() => setPapel(p)} aria-pressed={papel === p} className={clsx('flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium', papel === p ? 'border-marinho-900 bg-marinho-900 text-white' : 'border-linha-forte bg-white text-tinta-suave hover:border-marinho-300')}>
              {p === 'todos' ? 'Todos' : PAPEL[p]}
              <span className={clsx('num text-[10.5px]', papel === p ? 'text-marinho-200' : 'text-tinta-fraca')}>{contagem(p)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-1 gap-2 lg:justify-end">
          <Selecao value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="lg:!w-56" aria-label="Filtrar por empresa">
            <option value="">Todas as empresas</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </Selecao>
          <label className="relative flex-1 lg:w-64 lg:flex-none">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-tinta-fraca" />
            <input className="campo pl-8" placeholder="Nome ou e-mail…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
        </div>
      </div>
      {perfis.isError ? (
        <Erro mensagem={mensagemDeErro(perfis.error)} />
      ) : (
        <ListaUsuarios
          usuarios={lista}
          carregando={perfis.isLoading}
          mostrarEmpresa={(u) => (u.papel === 'master' ? 'Plataforma' : nomeEmpresa(u.empresa_id))}
          vazio={<Vazio titulo="Nenhum usuário encontrado" icone={<ShieldCheck className="size-3.5" />} />}
        />
      )}
      <ModalNovoUsuario aberto={novo} aoFechar={() => setNovo(false)} papeis={['admin', 'colaborador', 'cliente']} papelInicial="admin" empresaIdFixa={empresa || null} />
    </>
  )
}
