import type { Papel, StatusRelatorio } from '@/tipos/banco'

export const ehEquipe = (p: Papel | null | undefined) => p === 'master' || p === 'admin' || p === 'colaborador'
export const ehGestor = (p: Papel | null | undefined) => p === 'master' || p === 'admin'

/** Ações que a interface libera por papel. A RLS é quem tranca de verdade. */
export function permissoes(papel: Papel | null | undefined) {
  return {
    verPainel: ehEquipe(papel),
    criarObra: ehGestor(papel),
    editarObra: ehEquipe(papel),
    excluirObra: ehGestor(papel),
    criarRelatorio: ehEquipe(papel),
    enviarArquivos: ehEquipe(papel),
    excluirArquivos: ehEquipe(papel),
    gerenciarEquipe: ehGestor(papel),
    gerenciarClientes: ehGestor(papel),
    configurarEmpresa: ehGestor(papel),
    aprovarRelatorio: ehGestor(papel),
    areaMaster: papel === 'master',
    portalCliente: papel === 'cliente',
  }
}

/** Pode alterar o conteúdo de um relatório neste status? */
export function podeEditarRelatorio(papel: Papel | null | undefined, status: StatusRelatorio): boolean {
  if (!ehEquipe(papel)) return false
  if (status === 'aprovado') return ehGestor(papel)
  return true
}

/** Transições de status oferecidas ao usuário (espelha mudar_status_relatorio). */
export function transicoesPermitidas(papel: Papel | null | undefined, atual: StatusRelatorio): StatusRelatorio[] {
  if (papel === 'colaborador') {
    if (atual === 'preenchendo') return ['revisar']
    if (atual === 'revisar') return ['preenchendo']
    return []
  }
  if (ehGestor(papel)) {
    const todos: StatusRelatorio[] = ['preenchendo', 'revisar', 'aprovado']
    return todos.filter((s) => s !== atual)
  }
  return []
}

/** Papéis que este usuário pode criar. */
export function papeisCriaveis(papel: Papel | null | undefined): Papel[] {
  if (papel === 'master' || papel === 'admin') return ['admin', 'colaborador', 'cliente']
  return []
}

/** Rota inicial de cada papel. */
export function rotaInicial(papel: Papel | null | undefined): string {
  if (papel === 'cliente') return '/portal'
  return '/painel'
}
