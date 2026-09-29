import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Building, HardHat, Search, UserPlus, UserRoundCheck } from 'lucide-react'
import type { Perfil } from '@/tipos/banco'
import { useObras, usePerfis, useVinculos } from '@/lib/consultas'
import { useSessao } from '@/lib/sessao'
import { normalizar } from '@/lib/formato'
import { supabase, mensagemDeErro } from '@/lib/supabase'
import { Botao, CabecalhoPagina, Erro, Modal, Vazio } from '@/componentes/ui'
import { ListaUsuarios } from '@/componentes/listaUsuarios'
import { ModalNovoUsuario, SeletorObras } from '@/componentes/usuarios'
import { PrecisaEmpresa } from '@/componentes/PrecisaEmpresa'
import { useAvisos } from '@/componentes/avisos'

export default function Clientes() {
  const { empresaId } = useSessao()
  const perfis = usePerfis(empresaId)
  const vinculos = useVinculos(empresaId)
  const obras = useObras()
  const [novo, setNovo] = useState(false)
  const [editando, setEditando] = useState<Perfil | null>(null)
  const [busca, setBusca] = useState('')
  const clientes = useMemo(() => {
    const q = normalizar(busca)
    return (perfis.data ?? []).filter((p) => p.papel === 'cliente' && (!q || normalizar(`${p.nome} ${p.email}`).includes(q)))
  }, [perfis.data, busca])
  const nomeObra = (id: string) => obras.data?.find((o) => o.id === id)?.nome

  if (!empresaId) return (<><CabecalhoPagina sobretitulo="Gestão" titulo="Clientes" /><PrecisaEmpresa oque="os clientes" /></>)

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Portal do cliente"
        titulo="Clientes"
        subtitulo="Cada cliente recebe um acesso único para acompanhar as obras dele: relatórios aprovados, fotos e documentos liberados."
        acoes={<Botao icone={<UserPlus className="size-4" />} onClick={() => setNovo(true)}>Novo cliente</Botao>}
      />
      <label className="relative mb-4 block sm:w-80">
        <span className="sr-only">Buscar</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-tinta-fraca" />
        <input className="campo pl-8" placeholder="Buscar cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </label>
      {perfis.isError ? (
        <Erro mensagem={mensagemDeErro(perfis.error)} />
      ) : (
        <ListaUsuarios
          usuarios={clientes}
          carregando={perfis.isLoading}
          extra={(u) => {
            const ids = (vinculos.data ?? []).filter((v) => v.cliente_id === u.id).map((v) => v.obra_id)
            return (
              <div className="flex flex-wrap gap-1">
                {ids.length ? ids.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded border border-linha bg-papel px-1.5 py-0.5 text-[10.5px] text-tinta-suave">
                    <HardHat className="size-2.5" /> {nomeObra(id) ?? 'Obra'}
                  </span>
                )) : <span className="text-[11px] text-ambar-700">Sem obras vinculadas</span>}
              </div>
            )
          }}
          acoesExtras={(u) => <Botao variante="secundario" tamanho="p" icone={<Building className="size-3.5" />} onClick={() => setEditando(u)}>Obras</Botao>}
          vazio={<Vazio titulo="Nenhum cliente cadastrado" descricao="Crie um acesso único para o seu cliente acompanhar a obra pelo celular." icone={<UserRoundCheck className="size-3.5" />} acao={<Botao icone={<UserPlus className="size-4" />} onClick={() => setNovo(true)}>Novo cliente</Botao>} />}
        />
      )}
      <ModalNovoUsuario aberto={novo} aoFechar={() => setNovo(false)} papeis={['cliente']} empresaIdFixa={empresaId} />
      <ModalObrasCliente
        cliente={editando}
        aoFechar={() => setEditando(null)}
        obras={(obras.data ?? []).filter((o) => o.empresa_id === empresaId).map((o) => ({ id: o.id, nome: o.nome }))}
        atuais={(vinculos.data ?? []).filter((v) => v.cliente_id === editando?.id).map((v) => v.obra_id)}
      />
    </>
  )
}

function ModalObrasCliente({ cliente, aoFechar, obras, atuais }: { cliente: Perfil | null; aoFechar: () => void; obras: { id: string; nome: string }[]; atuais: string[] }) {
  const avisos = useAvisos()
  const qc = useQueryClient()
  const [sel, setSel] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    if (cliente) setSel(atuais)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente])
  async function salvar() {
    if (!cliente) return
    setSalvando(true)
    const { error } = await supabase.rpc('definir_obras_cliente', { p_cliente: cliente.id, p_obras: sel })
    setSalvando(false)
    if (error) return avisos.erro(error)
    avisos.sucesso('Obras do cliente atualizadas.')
    void qc.invalidateQueries({ queryKey: ['vinculos'] })
    aoFechar()
  }
  return (
    <Modal
      aberto={!!cliente}
      aoFechar={aoFechar}
      titulo="Obras do cliente"
      descricao={cliente ? `${cliente.nome} verá somente as obras marcadas.` : ''}
      largura="sm"
      codigo="CLIENTE · ACESSO"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao onClick={() => void salvar()} carregando={salvando}>Salvar</Botao></>}
    >
      <SeletorObras obras={obras} selecionadas={sel} aoMudar={setSel} />
    </Modal>
  )
}
