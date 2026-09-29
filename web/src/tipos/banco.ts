/**
 * Tipos das tabelas do Obtra, espelhando docs/CONTRATO.md.
 * Datas `date` chegam como 'YYYY-MM-DD'; `time` como 'HH:MM[:SS]';
 * `timestamptz` como ISO. `bigint` e `numeric` podem chegar como número
 * ou string, conforme o PostgREST — use `paraNumero()` ao exibir.
 */

export type Papel = 'master' | 'admin' | 'colaborador' | 'cliente'
export type StatusObra = 'nao_iniciada' | 'em_andamento' | 'paralisada' | 'concluida'
export type StatusRelatorio = 'preenchendo' | 'revisar' | 'aprovado'
export type Clima = 'claro' | 'nublado' | 'chuvoso'
export type Condicao = 'praticavel' | 'impraticavel'
export type TipoMaoObra = 'propria' | 'terceirizada'
export type StatusAtividade = 'iniciada' | 'em_andamento' | 'concluida' | 'paralisada'
export type TipoOcorrencia = 'geral' | 'acidente' | 'atraso' | 'clima' | 'material' | 'seguranca'
export type TipoMaterial = 'recebido' | 'utilizado'

type Grande = number | string

export interface Empresa {
  id: string
  nome: string
  cnpj: string | null
  email: string | null
  telefone: string | null
  endereco: string | null
  cidade: string | null
  uf: string | null
  logo_path: string | null
  limite_armazenamento_mb: number
  armazenamento_usado_bytes: Grande
  ativa: boolean
  criado_em: string
}

export interface Perfil {
  id: string
  nome: string
  email: string
  papel: Papel
  empresa_id: string | null
  telefone: string | null
  cargo: string | null
  ativo: boolean
  criado_em: string
}

export interface Obra {
  id: string
  empresa_id: string
  nome: string
  codigo: string | null
  endereco: string | null
  cidade: string | null
  uf: string | null
  contratante: string | null
  responsavel_tecnico: string | null
  data_inicio: string | null
  prazo_dias: number | null
  previsao_termino: string | null
  status: StatusObra
  capa_path: string | null
  capa_thumb_path: string | null
  observacoes: string | null
  criado_por: string | null
  criado_em: string
  atualizado_em: string
}

export interface ObraCliente {
  obra_id: string
  cliente_id: string
}

export interface Relatorio {
  id: string
  obra_id: string
  empresa_id: string
  numero: number
  data: string
  status: StatusRelatorio
  horario_inicio: string | null
  horario_fim: string | null
  clima_manha: Clima | null
  clima_tarde: Clima | null
  clima_noite: Clima | null
  condicao_manha: Condicao | null
  condicao_tarde: Condicao | null
  condicao_noite: Condicao | null
  pluviometria_mm: Grande | null
  observacoes: string | null
  criado_por: string | null
  aprovado_por: string | null
  aprovado_em: string | null
  criado_em: string
  atualizado_em: string
}

interface FilhoBase {
  id: string
  relatorio_id: string
  ordem: number
  criado_em?: string
}

export interface MaoObra extends FilhoBase {
  funcao: string
  quantidade: number
  tipo: TipoMaoObra
  empresa_terceira: string | null
}
export interface Equipamento extends FilhoBase {
  nome: string
  quantidade: number
}
export interface Atividade extends FilhoBase {
  descricao: string
  status: StatusAtividade
  progresso: number
}
export interface Ocorrencia extends FilhoBase {
  descricao: string
  tipo: TipoOcorrencia
}
export interface Material extends FilhoBase {
  descricao: string
  quantidade: string | null
  tipo: TipoMaterial
}

export interface Comentario {
  id: string
  relatorio_id: string
  autor_id: string | null
  texto: string
  criado_em: string
}

export interface Foto {
  id: string
  empresa_id: string
  obra_id: string
  relatorio_id: string | null
  path: string
  thumb_path: string
  legenda: string | null
  largura: number | null
  altura: number | null
  bytes: Grande
  criado_por: string | null
  criado_em: string
}

export interface Documento {
  id: string
  empresa_id: string
  obra_id: string
  nome: string
  path: string
  bytes: Grande
  mime: string | null
  visivel_cliente: boolean
  criado_por: string | null
  criado_em: string
}

export interface PainelResumo {
  obras_total: number
  obras_andamento: number
  relatorios_total: number
  relatorios_mes: number
  fotos_total: number
  armazenamento_usado_bytes: Grande
  armazenamento_limite_bytes: Grande
  empresas_total?: number | null
}

export const BUCKET = 'obtra'

export function paraNumero(v: Grande | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
