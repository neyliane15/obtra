import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { BriefcaseBusiness, Package, Pencil, Plus, Search, Trash2, Users, Wrench } from 'lucide-react'
import type { Colaborador, TipoMaoObra } from '@/tipos/banco'
import { useCadastro, type MapaCadastros, type TabelaCadastro } from '@/lib/consultas'
import { usePerfil, useSessao } from '@/lib/sessao'
import { ehGestor } from '@/lib/permissoes'
import { supabase, mensagemDeErro } from '@/lib/supabase'
import { normalizar, plural } from '@/lib/formato'
import { TIPO_MAO_OBRA, UNIDADES } from '@/lib/rotulos'
import { Botao, CabecalhoPagina, Campo, CampoTexto, Erro, Esqueleto, Interruptor, Modal, Selecao, Selo, Vazio } from '@/componentes/ui'
import { PrecisaEmpresa } from '@/componentes/PrecisaEmpresa'
import { useAvisos } from '@/componentes/avisos'

type Rota = 'mao-de-obra' | 'funcoes' | 'materiais' | 'equipamentos'
type Registro = MapaCadastros[TabelaCadastro] & Record<string, unknown>

interface CampoDef {
  chave: string
  rotulo: string
  tipo?: 'texto' | 'funcao' | 'vinculo' | 'unidade'
  obrigatorio?: boolean
  placeholder?: string
  largura?: string
}

/** Concordância: "Nova função" / "Função cadastrada", "Novo material" / "Material cadastrado". */
function flexao(feminino?: boolean) {
  return { novo: feminino ? 'Nova' : 'Novo', nenhum: feminino ? 'Nenhuma' : 'Nenhum', cadastrado: feminino ? 'cadastrada' : 'cadastrado' }
}

const CONFIG: Record<Rota, { tabela: TabelaCadastro; titulo: string; singular: string; feminino?: boolean; descricao: string; icone: ReactNode; campos: CampoDef[] }> = {
  'mao-de-obra': {
    tabela: 'colaboradores',
    titulo: 'Mão de Obra',
    singular: 'colaborador',
    descricao: 'Colaboradores próprios e terceirizados, usados na seção Mão de Obra do RDO.',
    icone: <Users className="size-3.5" />,
    campos: [
      { chave: 'nome', rotulo: 'Nome', obrigatorio: true, placeholder: 'João da Silva' },
      { chave: 'funcao_id', rotulo: 'Função', tipo: 'funcao' },
      { chave: 'tipo', rotulo: 'Vínculo', tipo: 'vinculo' },
      { chave: 'empresa_terceira', rotulo: 'Empresa terceirizada', placeholder: 'Somente se terceirizado' },
      { chave: 'telefone', rotulo: 'Telefone', placeholder: '(21) 90000-0000' },
      { chave: 'documento', rotulo: 'Documento', placeholder: 'CPF / RG' },
    ],
  },
  funcoes: {
    tabela: 'funcoes',
    titulo: 'Funções',
    singular: 'função',
    feminino: true,
    descricao: 'Funções da obra (pedreiro, servente, armador…) para agilizar o preenchimento.',
    icone: <BriefcaseBusiness className="size-3.5" />,
    campos: [{ chave: 'nome', rotulo: 'Nome da função', obrigatorio: true, placeholder: 'Pedreiro' }],
  },
  materiais: {
    tabela: 'materiais',
    titulo: 'Materiais',
    singular: 'material',
    descricao: 'Catálogo de materiais com unidade, usado em Materiais Recebidos e Utilizados.',
    icone: <Package className="size-3.5" />,
    campos: [
      { chave: 'nome', rotulo: 'Material', obrigatorio: true, placeholder: 'Cimento CP-II 50 kg' },
      { chave: 'unidade', rotulo: 'Unidade', tipo: 'unidade', placeholder: 'sc' },
    ],
  },
  equipamentos: {
    tabela: 'equipamentos',
    titulo: 'Equipamentos',
    singular: 'equipamento',
    descricao: 'Máquinas e equipamentos próprios ou locados.',
    icone: <Wrench className="size-3.5" />,
    campos: [
      { chave: 'nome', rotulo: 'Equipamento', obrigatorio: true, placeholder: 'Betoneira 400 L' },
      { chave: 'identificacao', rotulo: 'Identificação', placeholder: 'Placa, patrimônio ou nº de série' },
    ],
  },
}

export default function Cadastros() {
  const { tipo } = useParams()
  if (!tipo || !(tipo in CONFIG)) return <Navigate to="/cadastros/mao-de-obra" replace />
  return <PaginaCadastro key={tipo} rota={tipo as Rota} />
}

function PaginaCadastro({ rota }: { rota: Rota }) {
  const cfg = CONFIG[rota]
  const perfil = usePerfil()
  const { empresaId } = useSessao()
  const avisos = useAvisos()
  const qc = useQueryClient()
  const lista = useCadastro(cfg.tabela)
  const funcoes = useCadastro('funcoes')
  const [busca, setBusca] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [editando, setEditando] = useState<Registro | 'novo' | null>(null)
  const nomeFuncao = (id: unknown) => funcoes.data?.find((f) => f.id === id)?.nome

  const itens = useMemo(() => {
    const q = normalizar(busca.trim())
    return ((lista.data ?? []) as Registro[]).filter(
      (r) => (mostrarInativos || r.ativo) && (!q || normalizar(cfg.campos.map((c) => (c.tipo === 'funcao' ? nomeFuncao(r[c.chave]) : r[c.chave]) ?? '').join(' ')).includes(q)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista.data, busca, mostrarInativos, funcoes.data])

  if (!empresaId) return (<><CabecalhoPagina sobretitulo="Cadastros" titulo={cfg.titulo} /><PrecisaEmpresa oque="os cadastros" /></>)

  const invalidar = () => void qc.invalidateQueries({ queryKey: ['cadastro'] })
  async function alternar(r: Registro) {
    const { error } = await supabase.from(cfg.tabela).update({ ativo: !r.ativo }).eq('id', r.id)
    if (error) return avisos.erro(error)
    invalidar()
  }
  async function excluir(r: Registro) {
    const ok = await avisos.confirmar({ titulo: `Excluir ${String(r.nome)}?`, descricao: 'Relatórios antigos mantêm o texto registrado. Prefira desativar se ainda houver histórico recente.', confirmar: 'Excluir', perigo: true })
    if (!ok) return
    const { error } = await supabase.from(cfg.tabela).delete().eq('id', r.id)
    if (error) return avisos.erro(error)
    avisos.sucesso('Excluído.')
    invalidar()
  }
  const total = (lista.data ?? []).filter((r) => r.ativo).length
  const colunas = cfg.campos.filter((c) => c.chave !== 'empresa_terceira')

  return (
    <>
      <CabecalhoPagina
        sobretitulo="Cadastros"
        titulo={cfg.titulo}
        subtitulo={`${plural(total, 'ativo')} · ${cfg.descricao}`}
        acoes={<Botao variante="ambar" icone={<Plus className="size-4" />} onClick={() => setEditando('novo')}>{flexao(cfg.feminino).novo} {cfg.singular}</Botao>}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative sm:w-80">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-tinta-fraca" />
          <input className="campo pl-8" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <Interruptor ligado={mostrarInativos} aoMudar={setMostrarInativos} rotulo="Mostrar inativos" />
      </div>

      {lista.isError ? (
        <Erro mensagem={mensagemDeErro(lista.error)} aoTentar={() => void lista.refetch()} />
      ) : lista.isLoading ? (
        <div className="cartao space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Esqueleto key={i} className="h-10" />)}</div>
      ) : !itens.length ? (
        <Vazio
          titulo={lista.data?.length ? 'Nada encontrado' : `${flexao(cfg.feminino).nenhum} ${cfg.singular} ${flexao(cfg.feminino).cadastrado}`}
          descricao={cfg.descricao}
          icone={cfg.icone}
          acao={<Botao variante="ambar" icone={<Plus className="size-4" />} onClick={() => setEditando('novo')}>{flexao(cfg.feminino).novo} {cfg.singular}</Botao>}
        />
      ) : (
        <div className="cartao overflow-hidden">
          <div className="rolagem-fina relative overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-linha bg-papel/80">
                  {colunas.map((c) => <th key={c.chave} scope="col" className="rotulo px-4 py-2.5 !text-[9.5px] font-semibold">{c.rotulo}</th>)}
                  <th scope="col" className="rotulo px-4 py-2.5 !text-[9.5px] font-semibold">Situação</th>
                  <th scope="col" className="rotulo px-4 py-2.5 pr-5 text-right !text-[9.5px] font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linha">
                {itens.map((r) => (
                  <tr key={r.id} className={clsx('hover:bg-marinho-50/40', !r.ativo && 'text-tinta-fraca')}>
                    {colunas.map((c, i) => (
                      <td key={c.chave} className={clsx('px-4 py-2.5', i === 0 ? 'font-semibold text-tinta' : 'text-tinta-suave')}>
                        {c.tipo === 'funcao'
                          ? (nomeFuncao(r[c.chave]) ?? '—')
                          : c.tipo === 'vinculo'
                            ? `${TIPO_MAO_OBRA[r[c.chave] as TipoMaoObra] ?? '—'}${(r as unknown as Colaborador).empresa_terceira ? ` · ${(r as unknown as Colaborador).empresa_terceira}` : ''}`
                            : (String(r[c.chave] ?? '') || '—')}
                      </td>
                    ))}
                    <td className="px-4 py-2.5">
                      <button onClick={() => void alternar(r)} title="Ativar/desativar">{r.ativo ? <Selo tom="ok">Ativo</Selo> : <Selo tom="neutro">Inativo</Selo>}</button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-0.5">
                        <Botao variante="fantasma" tamanho="p" apenasIcone icone={<Pencil className="size-3.5" />} onClick={() => setEditando(r)} aria-label="Editar" title="Editar" />
                        {ehGestor(perfil.papel) && <Botao variante="fantasma" tamanho="p" apenasIcone icone={<Trash2 className="size-3.5" />} onClick={() => void excluir(r)} aria-label="Excluir" title="Excluir" className="hover:!text-perigo-600" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ModalCadastro
        alvo={editando}
        aoFechar={() => setEditando(null)}
        tabela={cfg.tabela}
        singular={cfg.singular}
        feminino={cfg.feminino}
        campos={cfg.campos}
        empresaId={empresaId}
        funcoes={(funcoes.data ?? []).filter((f) => f.ativo)}
      />
    </>
  )
}

function ModalCadastro({
  alvo, aoFechar, tabela, singular, feminino, campos, empresaId, funcoes,
}: {
  alvo: Registro | 'novo' | null
  aoFechar: () => void
  tabela: TabelaCadastro
  singular: string
  feminino?: boolean
  campos: CampoDef[]
  empresaId: string
  funcoes: { id: string; nome: string }[]
}) {
  const avisos = useAvisos()
  const qc = useQueryClient()
  const [v, setV] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const reg = alvo && alvo !== 'novo' ? alvo : null
  useEffect(() => {
    if (!alvo) return
    const ini: Record<string, string> = {}
    for (const c of campos) ini[c.chave] = reg ? String(reg[c.chave] ?? '') : c.tipo === 'vinculo' ? 'propria' : ''
    setV(ini)
    setErro(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if ((v.nome ?? '').trim().length < 2) return setErro('Informe o nome.')
    const dados: Record<string, string | null> = {}
    for (const c of campos) dados[c.chave] = (v[c.chave] ?? '').trim() || null
    if (dados.tipo === 'propria') dados.empresa_terceira = null
    setSalvando(true)
    const r = reg ? await supabase.from(tabela).update(dados).eq('id', reg.id) : await supabase.from(tabela).insert({ ...dados, empresa_id: empresaId })
    setSalvando(false)
    if (r.error) {
      if (/duplicate|unique/i.test(r.error.message)) return setErro('Já existe um cadastro com este nome.')
      return avisos.erro(r.error)
    }
    avisos.sucesso(reg ? 'Alterações salvas.' : `${singular[0]!.toUpperCase()}${singular.slice(1)} ${flexao(feminino).cadastrado}.`)
    void qc.invalidateQueries({ queryKey: ['cadastro'] })
    aoFechar()
  }

  return (
    <Modal
      aberto={!!alvo}
      aoFechar={aoFechar}
      titulo={reg ? `Editar ${singular}` : `${flexao(feminino).novo} ${singular}`}
      codigo={`CADASTRO · ${tabela.toUpperCase()}`}
      largura="sm"
      rodape={<><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" form="form-cadastro" carregando={salvando}>Salvar</Botao></>}
    >
      <form id="form-cadastro" onSubmit={salvar} className="flex flex-col gap-3.5" noValidate>
        {campos.map((c) => {
          if (c.chave === 'empresa_terceira' && v.tipo !== 'terceirizada') return null
          if (c.tipo === 'funcao')
            return (
              <Campo key={c.chave} rotulo={c.rotulo} htmlFor={`cad-${c.chave}`}>
                <Selecao id={`cad-${c.chave}`} value={v[c.chave] ?? ''} onChange={(e) => setV((x) => ({ ...x, [c.chave]: e.target.value }))}>
                  <option value="">—</option>
                  {funcoes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </Selecao>
              </Campo>
            )
          if (c.tipo === 'vinculo')
            return (
              <Campo key={c.chave} rotulo={c.rotulo} htmlFor={`cad-${c.chave}`}>
                <Selecao id={`cad-${c.chave}`} value={v[c.chave] ?? 'propria'} onChange={(e) => setV((x) => ({ ...x, [c.chave]: e.target.value }))}>
                  <option value="propria">Própria</option>
                  <option value="terceirizada">Terceirizada</option>
                </Selecao>
              </Campo>
            )
          return (
            <CampoTexto
              key={c.chave}
              rotulo={c.rotulo}
              obrigatorio={c.obrigatorio}
              value={v[c.chave] ?? ''}
              onChange={(e) => setV((x) => ({ ...x, [c.chave]: e.target.value }))}
              placeholder={c.placeholder}
              list={c.tipo === 'unidade' ? 'cad-unidades' : undefined}
              erro={c.chave === 'nome' ? erro : undefined}
            />
          )
        })}
        <datalist id="cad-unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
      </form>
    </Modal>
  )
}
