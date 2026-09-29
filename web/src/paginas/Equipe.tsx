import { useMemo, useState } from 'react'
import { Search, UserPlus, Users } from 'lucide-react'
import { usePerfis } from '@/lib/consultas'
import { useSessao } from '@/lib/sessao'
import { normalizar, plural } from '@/lib/formato'
import { mensagemDeErro } from '@/lib/supabase'
import { Botao, CabecalhoPagina, Erro, Vazio } from '@/componentes/ui'
import { ListaUsuarios } from '@/componentes/listaUsuarios'
import { ModalNovoUsuario } from '@/componentes/usuarios'
import { PrecisaEmpresa } from '@/componentes/PrecisaEmpresa'

export default function Equipe({ embutido = false }: { embutido?: boolean }) {
  const { empresaId, empresa } = useSessao()
  const perfis = usePerfis(empresaId)
  const [novo, setNovo] = useState(false)
  const [busca, setBusca] = useState('')
  const equipe = useMemo(() => {
    const q = normalizar(busca)
    return (perfis.data ?? []).filter((p) => (p.papel === 'admin' || p.papel === 'colaborador') && (!q || normalizar(`${p.nome} ${p.email} ${p.cargo ?? ''}`).includes(q)))
  }, [perfis.data, busca])

  if (!empresaId) return (<>{!embutido && <CabecalhoPagina sobretitulo="Gestão" titulo="Equipe" />}<PrecisaEmpresa oque="a equipe" /></>)
  const ativos = equipe.filter((p) => p.ativo).length

  return (
    <>
      {!embutido && <CabecalhoPagina
        sobretitulo="Gestão"
        titulo="Equipe"
        subtitulo={`${ativos} ${ativos === 1 ? 'pessoa ativa' : 'pessoas ativas'} na ${empresa?.nome ?? 'empresa'}. Administradores gerenciam tudo; colaboradores preenchem relatórios.`}
        acoes={<Botao icone={<UserPlus className="size-4" />} onClick={() => setNovo(true)}>Novo usuário</Botao>}
      />}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="relative block sm:w-80">
        <span className="sr-only">Buscar</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-tinta-fraca" />
        <input className="campo pl-8" placeholder="Buscar por nome, e-mail ou cargo…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </label>
      {embutido && <div className="flex items-center gap-3"><span className="text-[12px] text-tinta-suave">{plural(ativos, 'ativo')} · admins gerenciam, colaboradores preenchem RDOs</span><Botao variante="ambar" icone={<UserPlus className="size-4" />} onClick={() => setNovo(true)}>Novo usuário</Botao></div>}
      </div>
      {perfis.isError ? (
        <Erro mensagem={mensagemDeErro(perfis.error)} aoTentar={() => void perfis.refetch()} />
      ) : (
        <ListaUsuarios
          usuarios={equipe}
          carregando={perfis.isLoading}
          vazio={<Vazio titulo="Ninguém na equipe ainda" descricao="Cadastre engenheiros, mestres e técnicos para preencherem os RDOs." icone={<Users className="size-3.5" />} acao={<Botao icone={<UserPlus className="size-4" />} onClick={() => setNovo(true)}>Novo usuário</Botao>} />}
        />
      )}
      <ModalNovoUsuario aberto={novo} aoFechar={() => setNovo(false)} papeis={['colaborador', 'admin']} empresaIdFixa={empresaId} />
    </>
  )
}
