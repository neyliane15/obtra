-- ============================================================================
-- Obtra — 0001: tabelas.
-- ----------------------------------------------------------------------------
-- Idempotente: pode rodar de novo por cima de um banco pronto (o `supabase db
-- push` e o SQL Editor reaplicam sem dó). Por isso tudo é `if not exists`.
-- ============================================================================

-- No Supabase o pgcrypto já existe no schema `extensions`; aqui só garantimos.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------ empresas -----
create table if not exists public.empresas (
  id                        uuid primary key default gen_random_uuid(),
  nome                      text not null,
  cnpj                      text,
  email                     text,
  telefone                  text,
  endereco                  text,
  cidade                    text,
  uf                        text check (uf is null or length(uf) = 2),
  logo_path                 text,
  limite_armazenamento_mb   int not null default 2048 check (limite_armazenamento_mb >= 0),
  armazenamento_usado_bytes bigint not null default 0,
  ativa                     boolean not null default true,
  criado_em                 timestamptz not null default now()
);

-- -------------------------------------------------------------- perfis -----
create table if not exists public.perfis (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text not null,
  email       text not null,
  papel       text not null check (papel in ('master', 'admin', 'colaborador', 'cliente')),
  empresa_id  uuid references public.empresas (id) on delete cascade,
  telefone    text,
  cargo       text,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  -- Master é da plataforma, não de uma empresa. Os outros papéis PODEM estar
  -- sem empresa (cadastro sem convite) — e aí não enxergam nada.
  constraint perfis_master_sem_empresa check (papel <> 'master' or empresa_id is null)
);
create index if not exists perfis_empresa_idx on public.perfis (empresa_id);
create index if not exists perfis_email_idx on public.perfis (lower(email));

-- -------------------------------------------------------- configuracao -----
create table if not exists public.configuracao (
  id           int primary key default 1 check (id = 1),
  master_email text
);
insert into public.configuracao (id) values (1) on conflict (id) do nothing;

-- --------------------------------------------------------------- obras -----
create table if not exists public.obras (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas (id) on delete cascade,
  nome                text not null,
  codigo              text,
  endereco            text,
  cidade              text,
  uf                  text,
  contratante         text,
  responsavel_tecnico text,
  data_inicio         date,
  prazo_dias          int check (prazo_dias is null or prazo_dias >= 0),
  previsao_termino    date,
  status              text not null default 'em_andamento'
                      check (status in ('nao_iniciada', 'em_andamento', 'paralisada', 'concluida')),
  capa_path           text,
  capa_thumb_path     text,
  observacoes         text,
  criado_por          uuid references public.perfis (id) on delete set null,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create index if not exists obras_empresa_idx on public.obras (empresa_id);

-- ------------------------------------------------------- obra_clientes -----
create table if not exists public.obra_clientes (
  obra_id    uuid not null references public.obras (id) on delete cascade,
  cliente_id uuid not null references public.perfis (id) on delete cascade,
  primary key (obra_id, cliente_id)
);
create index if not exists obra_clientes_cliente_idx on public.obra_clientes (cliente_id);

-- ---------------------------------------------------------- relatorios -----
create table if not exists public.relatorios (
  id              uuid primary key default gen_random_uuid(),
  obra_id         uuid not null references public.obras (id) on delete cascade,
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  numero          int not null,
  data            date not null,
  status          text not null default 'preenchendo'
                  check (status in ('preenchendo', 'revisar', 'aprovado')),
  horario_inicio  time,
  horario_fim     time,
  clima_manha     text check (clima_manha in ('claro', 'nublado', 'chuvoso')),
  clima_tarde     text check (clima_tarde in ('claro', 'nublado', 'chuvoso')),
  clima_noite     text check (clima_noite in ('claro', 'nublado', 'chuvoso')),
  condicao_manha  text check (condicao_manha in ('praticavel', 'impraticavel')),
  condicao_tarde  text check (condicao_tarde in ('praticavel', 'impraticavel')),
  condicao_noite  text check (condicao_noite in ('praticavel', 'impraticavel')),
  pluviometria_mm numeric(6, 1),
  observacoes     text,
  criado_por      uuid default auth.uid() references public.perfis (id) on delete set null,
  aprovado_por    uuid references public.perfis (id) on delete set null,
  aprovado_em     timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint relatorios_obra_numero_key unique (obra_id, numero)
);
create index if not exists relatorios_empresa_idx on public.relatorios (empresa_id);
create index if not exists relatorios_obra_data_idx on public.relatorios (obra_id, data desc);

-- ------------------------------------------------ filhos do relatório ------
create table if not exists public.relatorio_mao_obra (
  id               uuid primary key default gen_random_uuid(),
  relatorio_id     uuid not null references public.relatorios (id) on delete cascade,
  ordem            int not null default 0,
  funcao           text not null,
  quantidade       int not null default 1 check (quantidade > 0),
  tipo             text not null default 'propria' check (tipo in ('propria', 'terceirizada')),
  empresa_terceira text,
  criado_em        timestamptz not null default now()
);
create index if not exists relatorio_mao_obra_rel_idx on public.relatorio_mao_obra (relatorio_id);

create table if not exists public.relatorio_equipamentos (
  id           uuid primary key default gen_random_uuid(),
  relatorio_id uuid not null references public.relatorios (id) on delete cascade,
  ordem        int not null default 0,
  nome         text not null,
  quantidade   int not null default 1 check (quantidade > 0),
  criado_em    timestamptz not null default now()
);
create index if not exists relatorio_equipamentos_rel_idx on public.relatorio_equipamentos (relatorio_id);

create table if not exists public.relatorio_atividades (
  id           uuid primary key default gen_random_uuid(),
  relatorio_id uuid not null references public.relatorios (id) on delete cascade,
  ordem        int not null default 0,
  descricao    text not null,
  status       text not null default 'em_andamento'
               check (status in ('iniciada', 'em_andamento', 'concluida', 'paralisada')),
  progresso    int not null default 0 check (progresso between 0 and 100),
  criado_em    timestamptz not null default now()
);
create index if not exists relatorio_atividades_rel_idx on public.relatorio_atividades (relatorio_id);

create table if not exists public.relatorio_ocorrencias (
  id           uuid primary key default gen_random_uuid(),
  relatorio_id uuid not null references public.relatorios (id) on delete cascade,
  ordem        int not null default 0,
  descricao    text not null,
  tipo         text not null default 'geral'
               check (tipo in ('geral', 'acidente', 'atraso', 'clima', 'material', 'seguranca')),
  criado_em    timestamptz not null default now()
);
create index if not exists relatorio_ocorrencias_rel_idx on public.relatorio_ocorrencias (relatorio_id);

create table if not exists public.relatorio_materiais (
  id           uuid primary key default gen_random_uuid(),
  relatorio_id uuid not null references public.relatorios (id) on delete cascade,
  ordem        int not null default 0,
  descricao    text not null,
  quantidade   text,
  tipo         text not null default 'recebido' check (tipo in ('recebido', 'utilizado')),
  criado_em    timestamptz not null default now()
);
create index if not exists relatorio_materiais_rel_idx on public.relatorio_materiais (relatorio_id);

create table if not exists public.relatorio_comentarios (
  id           uuid primary key default gen_random_uuid(),
  relatorio_id uuid not null references public.relatorios (id) on delete cascade,
  autor_id     uuid default auth.uid() references public.perfis (id) on delete set null,
  texto        text not null check (length(btrim(texto)) > 0),
  criado_em    timestamptz not null default now()
);
create index if not exists relatorio_comentarios_rel_idx on public.relatorio_comentarios (relatorio_id);

-- --------------------------------------------------------------- fotos -----
create table if not exists public.fotos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  obra_id      uuid not null references public.obras (id) on delete cascade,
  relatorio_id uuid references public.relatorios (id) on delete set null,
  path         text not null,
  thumb_path   text not null,
  legenda      text,
  largura      int,
  altura       int,
  bytes        bigint not null default 0 check (bytes >= 0),
  criado_por   uuid default auth.uid() references public.perfis (id) on delete set null,
  criado_em    timestamptz not null default now()
);
create index if not exists fotos_obra_idx on public.fotos (obra_id, criado_em desc);
create index if not exists fotos_relatorio_idx on public.fotos (relatorio_id);
create index if not exists fotos_empresa_idx on public.fotos (empresa_id);

-- ---------------------------------------------------------- documentos -----
create table if not exists public.documentos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  obra_id         uuid not null references public.obras (id) on delete cascade,
  nome            text not null,
  path            text not null,
  bytes           bigint not null default 0 check (bytes >= 0),
  mime            text,
  visivel_cliente boolean not null default false,
  criado_por      uuid default auth.uid() references public.perfis (id) on delete set null,
  criado_em       timestamptz not null default now()
);
create index if not exists documentos_obra_idx on public.documentos (obra_id, criado_em desc);
create index if not exists documentos_empresa_idx on public.documentos (empresa_id);

-- RLS em tudo. Sem política = ninguém (a não ser o dono/bypassrls) enxerga.
alter table public.empresas               enable row level security;
alter table public.perfis                 enable row level security;
alter table public.configuracao           enable row level security;
alter table public.obras                  enable row level security;
alter table public.obra_clientes          enable row level security;
alter table public.relatorios             enable row level security;
alter table public.relatorio_mao_obra     enable row level security;
alter table public.relatorio_equipamentos enable row level security;
alter table public.relatorio_atividades   enable row level security;
alter table public.relatorio_ocorrencias  enable row level security;
alter table public.relatorio_materiais    enable row level security;
alter table public.relatorio_comentarios  enable row level security;
alter table public.fotos                  enable row level security;
alter table public.documentos             enable row level security;
