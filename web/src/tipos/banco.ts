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
  numero: number | null
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
  intervalo_inicio: string | null
  intervalo_fim: string | null
  responsavel: string | null
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
  colaborador_id: string | null
  colaborador_nome?: string | null
  funcao: string
  quantidade: number
  tipo: TipoMaoObra
  empresa_terceira: string | null
}
export interface Equipamento extends FilhoBase {
  equipamento_id: string | null
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
  material_id: string | null
  descricao: string
  /** numeric(12,2) ou text, conforme o back — tratar os dois */
  quantidade: number | string | null
  unidade: string | null
  tipo: TipoMaterial
}
export interface NotaCompra extends FilhoBase {
  fornecedor: string | null
  numero_nota: string | null
  valor: Grande | null
  descricao: string | null
  /** PDF da nota (registro em `documentos`, interno). */
  pdf_documento_id?: string | null
  /** Foto da nota (registro em `documentos`, interno). */
  foto_documento_id?: string | null
}

/* ------------------------------------------------ cadastros da empresa -- */
interface CadastroBase {
  id: string
  empresa_id: string
  ativo: boolean
  criado_em: string
}
export interface Funcao extends CadastroBase {
  nome: string
}
export interface Colaborador extends CadastroBase {
  nome: string
  funcao_id: string | null
  tipo: TipoMaoObra
  empresa_terceira: string | null
  telefone: string | null
  documento: string | null
}
export interface MaterialCadastro extends CadastroBase {
  nome: string
  unidade: string | null
}
export interface EquipamentoCadastro extends CadastroBase {
  nome: string
  identificacao: string | null
}

export interface Historico {
  id: string | number
  empresa_id: string | null
  obra_id: string | null
  usuario_id: string | null
  usuario_nome: string | null
  acao: string
  entidade: string
  entidade_id: string | null
  descricao: string | null
  criado_em: string
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
  relatorios_pendentes?: number | null
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
