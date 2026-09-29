import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { KeyRound, MoreHorizontal, Power, Trash2 } from 'lucide-react'
import type { Perfil } from '@/tipos/banco'
import { supabase } from '@/lib/supabase'
import { usePerfil } from '@/lib/sessao'
import { PAPEL } from '@/lib/rotulos'
import { formatarData } from '@/lib/formato'
import { Avatar, Botao, Esqueleto, Selo } from './ui'
import { useAvisos } from './avisos'
import { ModalRedefinirSenha } from './usuarios'

export function ListaUsuarios({
  usuarios, carregando, extra, acoesExtras, mostrarEmpresa, vazio,
}: {
  usuarios: Perfil[]
  carregando?: boolean
  /** conteúdo extra por linha (ex.: obras do cliente) */
  extra?: (u: Perfil) => ReactNode
  acoesExtras?: (u: Perfil) => ReactNode
  mostrarEmpresa?: (u: Perfil) => string | undefined
  vazio: ReactNode
}) {
  const eu = usePerfil()
  const avisos = useAvisos()
  const qc = useQueryClient()
  const [senhaDe, setSenhaDe] = useState<Perfil | null>(null)
  const [menu, setMenu] = useState<string | null>(null)

  async function alternarAtivo(u: Perfil) {
    const { error } = await supabase.from('perfis').update({ ativo: !u.ativo }).eq('id', u.id)
    if (error) return avisos.erro(error)
    avisos.sucesso(u.ativo ? `${u.nome} foi desativado.` : `${u.nome} foi reativado.`)
    void qc.invalidateQueries({ queryKey: ['perfis'] })
  }
  async function excluir(u: Perfil) {
    const ok = await avisos.confirmar({
      titulo: `Excluir ${u.nome}?`,
      descricao: 'O acesso é removido definitivamente. Relatórios e fotos criados por esta pessoa continuam na obra.',
      confirmar: 'Excluir usuário',
      perigo: true,
    })
    if (!ok) return
    const { error } = await supabase.rpc('admin_excluir_usuario', { p_usuario: u.id })
    if (error) return avisos.erro(error)
    avisos.sucesso('Usuário excluído.')
    void qc.invalidateQueries({ queryKey: ['perfis'] })
    void qc.invalidateQueries({ queryKey: ['vinculos'] })
  }

  if (carregando) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Esqueleto key={i} className="h-16" />)}</div>
  if (!usuarios.length) return <>{vazio}</>

  return (
    <>
      <ul className="cartao divide-y divide-linha">
        {usuarios.map((u) => {
          const proprio = u.id === eu.id
          const protegido = u.papel === 'master'
          return (
            <li key={u.id} className={clsx('flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center', !u.ativo && 'bg-papel/70')}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar nome={u.nome} className={clsx(!u.ativo && 'opacity-40 grayscale')} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={clsx('truncate text-[13px] font-semibold', u.ativo ? 'text-tinta' : 'text-tinta-fraca line-through')}>{u.nome}</span>
                    {proprio && <span className="rounded bg-marinho-50 px-1.5 text-[10px] font-semibold text-marinho-600">você</span>}
                    <Selo tom={u.papel === 'admin' || u.papel === 'master' ? 'marinho' : u.papel === 'cliente' ? 'ambar' : 'neutro'} ponto={false}>{PAPEL[u.papel]}</Selo>
                    {!u.ativo && <Selo tom="perigo">Inativo</Selo>}
                  </p>
                  <p className="truncate text-[11.5px] text-tinta-fraca">
                    {[u.email, u.cargo, u.telefone, mostrarEmpresa?.(u)].filter(Boolean).join(' · ')}
                  </p>
                  {extra && <div className="mt-1.5">{extra(u)}</div>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <span className="num mr-2 hidden font-mono text-[10px] text-tinta-fraca lg:block">desde {formatarData(u.criado_em)}</span>
                {acoesExtras?.(u)}
                {!proprio && !protegido && (
                  <div className="relative">
                    <Botao variante="secundario" tamanho="p" apenasIcone icone={<MoreHorizontal className="size-4" />} onClick={() => setMenu(menu === u.id ? null : u.id)} aria-label={`Ações para ${u.nome}`} aria-expanded={menu === u.id} />
                    {menu === u.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} aria-hidden />
                        <div role="menu" className="anim-subir absolute right-0 z-20 mt-1 w-52 rounded-lg border border-linha bg-white p-1.5 shadow-flutuante">
                          <ItemMenu icone={<KeyRound />} onClick={() => { setSenhaDe(u); setMenu(null) }}>Redefinir senha</ItemMenu>
                          <ItemMenu icone={<Power />} onClick={() => { void alternarAtivo(u); setMenu(null) }}>{u.ativo ? 'Desativar acesso' : 'Reativar acesso'}</ItemMenu>
                          <div className="my-1 border-t border-dashed border-linha-forte" />
                          <ItemMenu icone={<Trash2 />} perigo onClick={() => { void excluir(u); setMenu(null) }}>Excluir usuário</ItemMenu>
                        </div>
                      </>
                    )}
                  </div>
                )}
                {(proprio || protegido) && <span className="hidden size-7 sm:block" aria-hidden />}
              </div>
            </li>
          )
        })}
      </ul>
      <ModalRedefinirSenha usuario={senhaDe} aoFechar={() => setSenhaDe(null)} />
    </>
  )
}

function ItemMenu({ icone, children, onClick, perigo }: { icone: ReactNode; children: ReactNode; onClick: () => void; perigo?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick} className={clsx('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] [&_svg]:size-3.5', perigo ? 'text-perigo-600 hover:bg-perigo-50' : 'text-tinta hover:bg-marinho-50 [&_svg]:text-tinta-fraca')}>
      {icone}
      {children}
    </button>
  )
}
