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
  preenchendo: { rotulo: 'Preenchendo', tom: 'neutro', acao: 'Voltar para preenchimento' },
  revisar: { rotulo: 'Em revisão', tom: 'ambar', acao: 'Enviar para revisão' },
  aprovado: { rotulo: 'Aprovado', tom: 'ok', acao: 'Aprovar relatório' },
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
