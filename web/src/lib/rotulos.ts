import type {
  Clima, Condicao, Papel, StatusAtividade, StatusObra, StatusRelatorio, TipoMaoObra, TipoMaterial, TipoOcorrencia,
} from '@/tipos/banco'

export type Tom = 'marinho' | 'ambar' | 'ok' | 'perigo' | 'neutro' | 'aviso'

export const PAPEL: Record<Papel, string> = {
  master: 'Master',
  admin: 'Administrador',
  colaborador: 'Colaborador',
  cliente: 'Cliente',
}

export const STATUS_OBRA: Record<StatusObra, { rotulo: string; tom: Tom }> = {
  nao_iniciada: { rotulo: 'Não iniciada', tom: 'neutro' },
  em_andamento: { rotulo: 'Em andamento', tom: 'marinho' },
  paralisada: { rotulo: 'Paralisada', tom: 'ambar' },
  concluida: { rotulo: 'Concluída', tom: 'ok' },
}

export const STATUS_RELATORIO: Record<StatusRelatorio, { rotulo: string; tom: Tom; acao: string }> = {
  preenchendo: { rotulo: 'Rascunho', tom: 'neutro', acao: 'Voltar para rascunho' },
  revisar: { rotulo: 'Pendente Aprovação', tom: 'marinho', acao: 'Enviar para Aprovação' },
  aprovado: { rotulo: 'Aprovado', tom: 'ok', acao: 'Aprovar' },
}

export const CLIMA: Record<Clima, string> = { claro: 'Claro', nublado: 'Nublado', chuvoso: 'Chuvoso' }
export const CONDICAO: Record<Condicao, string> = { praticavel: 'Praticável', impraticavel: 'Impraticável' }
export const TIPO_MAO_OBRA: Record<TipoMaoObra, string> = { propria: 'Própria', terceirizada: 'Terceirizada' }
export const STATUS_ATIVIDADE: Record<StatusAtividade, { rotulo: string; tom: Tom }> = {
  iniciada: { rotulo: 'Iniciada', tom: 'neutro' },
  em_andamento: { rotulo: 'Em andamento', tom: 'marinho' },
  concluida: { rotulo: 'Concluída', tom: 'ok' },
  paralisada: { rotulo: 'Paralisada', tom: 'ambar' },
}
export const TIPO_OCORRENCIA: Record<TipoOcorrencia, string> = {
  geral: 'Geral',
  acidente: 'Acidente',
  atraso: 'Atraso',
  clima: 'Clima',
  material: 'Material',
  seguranca: 'Segurança',
}
export const TIPO_MATERIAL: Record<TipoMaterial, string> = { recebido: 'Recebido', utilizado: 'Utilizado' }

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

export const ACAO_HISTORICO: Record<string, string> = {
  criou: 'criou',
  editou: 'editou',
  excluiu: 'excluiu',
  enviou_aprovacao: 'enviou para aprovação',
  aprovou: 'aprovou',
  reabriu: 'reabriu',
  devolveu: 'devolveu para rascunho',
  enviou_foto: 'enviou foto',
  excluiu_foto: 'excluiu foto',
  enviou_documento: 'anexou documento',
  excluiu_documento: 'excluiu documento',
}

export const ENTIDADE_HISTORICO: Record<string, string> = {
  obra: 'Obra',
  relatorio: 'Relatório',
  foto: 'Foto',
  documento: 'Documento',
  usuario: 'Usuário',
  cadastro: 'Cadastro',
}

export const UNIDADES = ['un', 'm', 'm²', 'm³', 'kg', 't', 'sc', 'l', 'cx', 'pç', 'rolo', 'barra', 'milheiro']
