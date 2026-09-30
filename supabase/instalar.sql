-- Obtra — instalação completa do banco (gerado por ferramentas/gerar-instalar.sh).
-- Cole TUDO no SQL Editor do Supabase e clique Run. Pode rodar de novo sem problema.

-- ============================================================
-- 20260929000001_base.sql
-- ============================================================
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

-- ------------------------------------------ cadastros da empresa (Adendo 1) -
-- empresa_id: se vier nulo, o gatilho preenche com a empresa de quem insere.
create table if not exists public.funcoes (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome       text not null check (length(btrim(nome)) > 0),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  constraint funcoes_empresa_nome_key unique (empresa_id, nome)
);

create table if not exists public.colaboradores (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas (id) on delete cascade,
  nome             text not null check (length(btrim(nome)) > 0),
  funcao_id        uuid references public.funcoes (id) on delete set null,
  tipo             text not null default 'propria' check (tipo in ('propria', 'terceirizada')),
  empresa_terceira text,
  telefone         text,
  documento        text,
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now()
);
create index if not exists colaboradores_empresa_idx on public.colaboradores (empresa_id, nome);

create table if not exists public.materiais (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome       text not null check (length(btrim(nome)) > 0),
  unidade    text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  constraint materiais_empresa_nome_key unique (empresa_id, nome)
);

create table if not exists public.equipamentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  nome           text not null check (length(btrim(nome)) > 0),
  identificacao  text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  constraint equipamentos_empresa_nome_key unique (empresa_id, nome)
);

-- ---------------------------------------------------------- relatorios -----
create table if not exists public.relatorios (
  id              uuid primary key default gen_random_uuid(),
  obra_id         uuid not null references public.obras (id) on delete cascade,
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  numero          int not null,
  data            date not null,
  status          text not null default 'preenchendo'
                  check (status in ('preenchendo', 'revisar', 'aprovado')),
  responsavel     text,
  horario_inicio  time,
  horario_fim     time,
  intervalo_inicio time,
  intervalo_fim   time,
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
  colaborador_id   uuid references public.colaboradores (id) on delete set null,
  colaborador_nome text,
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
  ordem          int not null default 0,
  equipamento_id uuid references public.equipamentos (id) on delete set null,
  nome           text not null,
  quantidade     int not null default 1 check (quantidade > 0),
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
  material_id  uuid references public.materiais (id) on delete set null,
  descricao    text not null,
  quantidade   numeric(12, 2) check (quantidade is null or quantidade >= 0),
  unidade      text,
  tipo         text not null default 'recebido' check (tipo in ('recebido', 'utilizado')),
  criado_em    timestamptz not null default now()
);
create index if not exists relatorio_materiais_rel_idx on public.relatorio_materiais (relatorio_id);

create table if not exists public.relatorio_notas_compras (
  id           uuid primary key default gen_random_uuid(),
  relatorio_id uuid not null references public.relatorios (id) on delete cascade,
  ordem        int not null default 0,
  fornecedor   text,
  numero_nota  text,
  valor        numeric(12, 2),
  descricao    text,
  criado_em    timestamptz not null default now()
);
create index if not exists relatorio_notas_compras_rel_idx on public.relatorio_notas_compras (relatorio_id);

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

-- ------------------------------------------------------------ historico ----
-- Alimentada só por gatilhos. obra_id/usuario_id sem FK de propósito: o
-- registro de "excluiu a obra" tem de sobreviver à obra excluída.
create table if not exists public.historico (
  id           bigint generated always as identity primary key,
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  obra_id      uuid,
  usuario_id   uuid,
  usuario_nome text,
  acao         text not null,
  entidade     text not null,
  entidade_id  uuid,
  descricao    text,
  criado_em    timestamptz not null default now()
);
create index if not exists historico_empresa_idx on public.historico (empresa_id, criado_em desc);
create index if not exists historico_obra_idx on public.historico (obra_id, criado_em desc);

-- ------------------------------------------------- índices de apoio ------
-- Toda FK ganha índice: sem ele, excluir um perfil/cadastro (on delete set
-- null) varre a tabela filha inteira. E as colunas que as políticas filtram.
create index if not exists colaboradores_funcao_idx          on public.colaboradores (funcao_id);
create index if not exists relatorio_mao_obra_colab_idx      on public.relatorio_mao_obra (colaborador_id);
create index if not exists relatorio_equipamentos_equip_idx  on public.relatorio_equipamentos (equipamento_id);
create index if not exists relatorio_materiais_material_idx  on public.relatorio_materiais (material_id);
create index if not exists relatorio_comentarios_autor_idx   on public.relatorio_comentarios (autor_id);
create index if not exists relatorios_criado_por_idx         on public.relatorios (criado_por);
create index if not exists relatorios_aprovado_por_idx       on public.relatorios (aprovado_por);
create index if not exists relatorios_empresa_status_idx     on public.relatorios (empresa_id, status);
create index if not exists obras_criado_por_idx              on public.obras (criado_por);
create index if not exists fotos_criado_por_idx              on public.fotos (criado_por);
create index if not exists documentos_criado_por_idx         on public.documentos (criado_por);
create index if not exists perfis_papel_idx                  on public.perfis (papel);
-- As políticas do bucket procuram o arquivo pelo caminho.
create index if not exists fotos_path_idx                    on public.fotos (path);
create index if not exists fotos_thumb_path_idx              on public.fotos (thumb_path);
create index if not exists documentos_path_idx               on public.documentos (path);

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
alter table public.relatorio_notas_compras enable row level security;
alter table public.funcoes                enable row level security;
alter table public.colaboradores          enable row level security;
alter table public.materiais              enable row level security;
alter table public.equipamentos           enable row level security;
alter table public.historico              enable row level security;
alter table public.fotos                  enable row level security;
alter table public.documentos             enable row level security;

-- ============================================================
-- 20260929000002_funcoes_e_gatilhos.sql
-- ============================================================
-- ============================================================================
-- Obtra — 0002: funções auxiliares (usadas pela RLS) e gatilhos.
-- ----------------------------------------------------------------------------
-- Toda função que lê tabela protegida é SECURITY DEFINER com search_path fixo:
-- assim a política de `perfis` pode perguntar "quem é você" sem cair na própria
-- RLS de `perfis` (recursão infinita), e ninguém sequestra a função criando um
-- objeto homônimo num schema que venha antes no search_path. O `pg_temp` vai
-- explícito e POR ÚLTIMO: se ficar de fora, o Postgres procura tabelas no
-- schema temporário da sessão ANTES do `public` — um `create temp table
-- perfis(...)` faria `eh_master()` responder o que o usuário quisesse.
--
-- Bandeira interna `obtra.interno`: as RPCs deste sistema (security definer,
-- que já conferiram permissão) ligam essa configuração da transação para que os
-- gatilhos de proteção não barrem o que elas fazem. Ela não é alcançável pela
-- API: o PostgREST só publica `request.*`, e `set_config` não está exposto.
-- ============================================================================

-- ------------------------------------------------------------ utilidades ---
create or replace function public.uuid_seguro(p_texto text)
returns uuid
language plpgsql immutable
set search_path = public, pg_temp
as $$
begin
  return p_texto::uuid;
exception when others then
  return null;
end $$;

create or replace function public.obtra_interno()
returns boolean
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(current_setting('obtra.interno', true), '') = 'on'
$$;

-- ------------------------------------------------- quem é o usuário atual ---
create or replace function public.eh_master()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from perfis
     where id = auth.uid() and papel = 'master' and ativo
  )
$$;

create or replace function public.meu_papel()
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select papel from perfis where id = auth.uid() and ativo
$$;

create or replace function public.minha_empresa()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select empresa_id from perfis where id = auth.uid() and ativo
$$;

-- Equipe (admin/colaborador ativo) daquela empresa ATIVA — ou master.
create or replace function public.eh_equipe(empresa uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from perfis p
     where p.id = auth.uid() and p.ativo and p.papel = 'master'
  ) or exists (
    select 1
      from perfis p
      join empresas e on e.id = p.empresa_id
     where p.id = auth.uid()
       and p.ativo
       and p.papel in ('admin', 'colaborador')
       and p.empresa_id = empresa
       and e.ativa
  )
$$;

-- Admin ativo daquela empresa ativa — ou master.
create or replace function public.eh_admin(empresa uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from perfis p
     where p.id = auth.uid() and p.ativo and p.papel = 'master'
  ) or exists (
    select 1
      from perfis p
      join empresas e on e.id = p.empresa_id
     where p.id = auth.uid()
       and p.ativo
       and p.papel = 'admin'
       and p.empresa_id = empresa
       and e.ativa
  )
$$;

-- Cliente ativo, da mesma empresa (ativa) da obra, vinculado a ela.
create or replace function public.eh_cliente_da_obra(obra uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from perfis p
      join obra_clientes oc on oc.cliente_id = p.id
      join obras o          on o.id = oc.obra_id
      join empresas e       on e.id = o.empresa_id
     where p.id = auth.uid()
       and p.ativo
       and p.papel = 'cliente'
       and oc.obra_id = obra
       and p.empresa_id = o.empresa_id
       and e.ativa
  )
$$;

-- Versões "sem argumento" das de cima, para as políticas: numa política,
-- `empresa_id = (select public.empresa_da_equipe())` é calculado UMA vez por
-- consulta (initPlan) e deixa o planejador usar o índice de empresa_id; já
-- `public.eh_equipe(empresa_id)` roda uma subconsulta por linha.
-- Empresa (ativa) em que o usuário é admin/colaborador ativo; null se não for.
create or replace function public.empresa_da_equipe()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.empresa_id
    from perfis p
    join empresas e on e.id = p.empresa_id
   where p.id = auth.uid()
     and p.ativo
     and p.papel in ('admin', 'colaborador')
     and e.ativa
$$;

-- Empresa (ativa) em que o usuário é admin ativo; null se não for.
create or replace function public.empresa_do_admin()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.empresa_id
    from perfis p
    join empresas e on e.id = p.empresa_id
   where p.id = auth.uid()
     and p.ativo
     and p.papel = 'admin'
     and e.ativa
$$;

-- Empresa (ativa) em que o usuário é cliente ativo; null se não for.
create or replace function public.empresa_do_cliente()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.empresa_id
    from perfis p
    join empresas e on e.id = p.empresa_id
   where p.id = auth.uid()
     and p.ativo
     and p.papel = 'cliente'
     and e.ativa
$$;

-- Obras que o cliente ativo enxerga (mesmas regras de eh_cliente_da_obra).
create or replace function public.obras_do_cliente()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select oc.obra_id
    from perfis p
    join obra_clientes oc on oc.cliente_id = p.id
    join obras o          on o.id = oc.obra_id
    join empresas e       on e.id = o.empresa_id
   where p.id = auth.uid()
     and p.ativo
     and p.papel = 'cliente'
     and p.empresa_id = o.empresa_id
     and e.ativa
$$;

create or replace function public.empresa_da_obra(obra uuid)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select empresa_id from obras where id = obra
$$;

create or replace function public.pode_ver_obra(obra uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.eh_master()
      or exists (select 1 from obras o where o.id = obra and public.eh_equipe(o.empresa_id))
      or public.eh_cliente_da_obra(obra)
$$;

-- Equipe vê qualquer relatório da empresa; cliente só os aprovados das obras dele.
create or replace function public.pode_ver_relatorio(relatorio uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from relatorios r
     where r.id = relatorio
       and (public.eh_equipe(r.empresa_id)
            or (r.status = 'aprovado' and public.eh_cliente_da_obra(r.obra_id)))
  )
$$;

-- Equipe edita; relatório aprovado só admin/master.
create or replace function public.pode_editar_relatorio(relatorio uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from relatorios r
     where r.id = relatorio
       and public.eh_equipe(r.empresa_id)
       and (r.status <> 'aprovado' or public.eh_admin(r.empresa_id))
  )
$$;

create or replace function public.empresa_do_relatorio(relatorio uuid)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select empresa_id from relatorios where id = relatorio
$$;

-- ============================================================= gatilhos ====

-- ------------------------------------------- perfil a partir de auth.users -
-- Papel e empresa vêm de raw_user_meta_data SOMENTE quando quem insere é a
-- RPC admin_criar_usuario (bandeira obtra.interno). Num cadastro aberto pelo
-- GoTrue, os metadados são escolhidos por quem se cadastra — confiar neles
-- deixaria qualquer um virar admin de qualquer empresa. Sem bandeira, nasce
-- 'cliente' sem empresa (não vê nada), exceto o e-mail de
-- configuracao.master_email enquanto ainda não houver master.
create or replace function public.ao_criar_usuario()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_meta    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_nome    text  := coalesce(nullif(btrim(v_meta ->> 'nome'), ''),
                              nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
                              'Usuário');
  v_papel   text  := 'cliente';
  v_empresa uuid;
  v_master  text;
begin
  if public.obtra_interno() then
    v_papel   := coalesce(v_meta ->> 'papel', 'cliente');
    v_empresa := public.uuid_seguro(v_meta ->> 'empresa_id');
    if v_papel not in ('master', 'admin', 'colaborador', 'cliente') then
      v_papel := 'cliente';
    end if;
    if v_papel = 'master' then
      v_empresa := null;
    elsif v_empresa is not null and not exists (select 1 from empresas where id = v_empresa) then
      v_empresa := null;
    end if;
  else
    select master_email into v_master from configuracao where id = 1;
    if v_master is not null
       and lower(btrim(v_master)) = lower(coalesce(new.email, ''))
       and not exists (select 1 from perfis where papel = 'master') then
      v_papel := 'master';
    end if;
  end if;

  insert into perfis (id, nome, email, papel, empresa_id)
  values (new.id, v_nome, lower(coalesce(new.email, '')), v_papel, v_empresa)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists obtra_ao_criar_usuario on auth.users;
create trigger obtra_ao_criar_usuario
  after insert on auth.users
  for each row execute function public.ao_criar_usuario();

-- E-mail do perfil acompanha o da conta.
create or replace function public.ao_mudar_email_usuario()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    perform set_config('obtra.interno', 'on', true);
    update perfis set email = lower(coalesce(new.email, '')) where id = new.id;
    perform set_config('obtra.interno', 'off', true);
  end if;
  return new;
end $$;

drop trigger if exists obtra_ao_mudar_email_usuario on auth.users;
create trigger obtra_ao_mudar_email_usuario
  after update of email on auth.users
  for each row execute function public.ao_mudar_email_usuario();

-- --------------------------------------------------- proteção de perfis ----
create or replace function public.perfis_proteger()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- SQL Editor / service_role (sem JWT) e as RPCs do sistema passam.
  if auth.uid() is null or public.obtra_interno() then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'O identificador do perfil não muda' using errcode = '42501';
  end if;
  if new.email is distinct from old.email then
    raise exception 'O e-mail é o da conta de acesso e não se altera pelo perfil' using errcode = '42501';
  end if;
  if old.id = auth.uid() and (new.papel is distinct from old.papel
                              or new.empresa_id is distinct from old.empresa_id
                              or new.ativo is distinct from old.ativo) then
    raise exception 'Você não pode alterar o próprio papel, empresa ou situação' using errcode = '42501';
  end if;
  if not public.eh_master() then
    if new.papel = 'master' or old.papel = 'master' then
      raise exception 'Somente o master mexe no papel master' using errcode = '42501';
    end if;
    if new.empresa_id is distinct from old.empresa_id then
      raise exception 'Somente o master muda um usuário de empresa' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists obtra_perfis_proteger on public.perfis;
create trigger obtra_perfis_proteger
  before update on public.perfis
  for each row execute function public.perfis_proteger();

-- -------------------------------------------------- proteção de empresas ---
create or replace function public.empresas_proteger()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.obtra_interno() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- O uso é do sistema, não de quem cadastra.
    new.armazenamento_usado_bytes := 0;
    return new;
  end if;
  -- O gatilho de cota (fotos/documentos) atualiza o uso de dentro de outro
  -- gatilho: profundidade > 1. Só essa coluna passa por esse caminho.
  if pg_trigger_depth() > 1
     and new.limite_armazenamento_mb = old.limite_armazenamento_mb
     and new.ativa = old.ativa
     and new.id = old.id then
    return new;
  end if;
  if new.id is distinct from old.id then
    raise exception 'O identificador da empresa não muda' using errcode = '42501';
  end if;
  if new.armazenamento_usado_bytes is distinct from old.armazenamento_usado_bytes then
    raise exception 'O uso de armazenamento é calculado pelo sistema' using errcode = '42501';
  end if;
  if not public.eh_master()
     and (new.limite_armazenamento_mb is distinct from old.limite_armazenamento_mb
          or new.ativa is distinct from old.ativa) then
    raise exception 'Somente o master altera o limite de armazenamento e a situação da empresa'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists obtra_empresas_proteger on public.empresas;
create trigger obtra_empresas_proteger
  before insert or update on public.empresas
  for each row execute function public.empresas_proteger();

-- ---------------------------------------------------------------- obras ----
create or replace function public.obras_antes()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.criado_por := auth.uid();
    end if;
  else
    if auth.uid() is not null and not public.obtra_interno() then
      if new.empresa_id is distinct from old.empresa_id then
        raise exception 'A obra não muda de empresa' using errcode = '42501';
      end if;
      -- Nulo é permitido: é o que o `on delete set null` grava ao excluir a conta.
      if new.criado_por is not null then
        new.criado_por := old.criado_por;
      end if;
      new.criado_em := old.criado_em;
    end if;
  end if;
  -- A capa fica na pasta da própria obra: o cliente da obra pode ler a capa
  -- (storage_pode_ler), então apontar a capa para outro arquivo da empresa
  -- (foto de RDO não aprovado, documento interno) vazaria esse arquivo.
  if auth.uid() is not null and not public.obtra_interno()
     and (tg_op = 'INSERT'
          or new.capa_path is distinct from old.capa_path
          or new.capa_thumb_path is distinct from old.capa_thumb_path)
     and exists (select 1 from unnest(array[new.capa_path, new.capa_thumb_path]) c
                  where c is not null
                    and c not like new.empresa_id::text || '/' || new.id::text || '/capa/%') then
    raise exception 'A capa tem de estar na pasta da obra' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists obtra_obras_antes on public.obras;
create trigger obtra_obras_antes
  before insert or update on public.obras
  for each row execute function public.obras_antes();

-- -------------------------------------------------------- obra_clientes ----
create or replace function public.obra_clientes_validar()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa_obra    uuid;
  v_empresa_cliente uuid;
  v_papel           text;
begin
  select empresa_id into v_empresa_obra from obras where id = new.obra_id;
  select empresa_id, papel into v_empresa_cliente, v_papel from perfis where id = new.cliente_id;
  if v_papel is distinct from 'cliente' then
    raise exception 'Só usuários com papel cliente são vinculados a obras' using errcode = '23514';
  end if;
  if v_empresa_obra is null or v_empresa_cliente is distinct from v_empresa_obra then
    raise exception 'O cliente e a obra têm de ser da mesma empresa' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists obtra_obra_clientes_validar on public.obra_clientes;
create trigger obtra_obra_clientes_validar
  before insert or update on public.obra_clientes
  for each row execute function public.obra_clientes_validar();

-- ----------------------------------------------------------- relatorios ----
create or replace function public.relatorios_antes()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa uuid;
begin
  if tg_op = 'INSERT' then
    -- Trava a linha da obra: dois relatórios criados ao mesmo tempo esperam um
    -- pelo outro em vez de disputarem o mesmo número.
    select empresa_id into v_empresa from obras where id = new.obra_id for update;
    if not found then
      raise exception 'Obra não encontrada' using errcode = '23503';
    end if;
    new.empresa_id := v_empresa;
    select coalesce(max(numero), 0) + 1 into new.numero
      from relatorios where obra_id = new.obra_id;
    if auth.uid() is not null then
      new.criado_por := auth.uid();
    end if;
    -- Responsável: o informado, senão o nome de quem cria.
    new.responsavel := coalesce(nullif(btrim(new.responsavel), ''),
                                (select nome from perfis where id = coalesce(auth.uid(), new.criado_por)));
    if new.status = 'aprovado' then
      new.aprovado_por := coalesce(auth.uid(), new.aprovado_por);
      new.aprovado_em  := coalesce(new.aprovado_em, now());
    else
      new.aprovado_por := null;
      new.aprovado_em  := null;
    end if;
    new.atualizado_em := now();
    return new;
  end if;

  -- UPDATE
  if auth.uid() is not null and not public.obtra_interno() then
    if new.obra_id is distinct from old.obra_id
       or new.empresa_id is distinct from old.empresa_id
       or new.numero is distinct from old.numero then
      raise exception 'Obra, empresa e número do relatório não mudam' using errcode = '42501';
    end if;
    if new.criado_por is not null then
      new.criado_por := old.criado_por;
    end if;
    new.criado_em := old.criado_em;
  end if;
  if new.status = 'aprovado' and old.status <> 'aprovado' then
    new.aprovado_por := coalesce(auth.uid(), new.aprovado_por);
    new.aprovado_em  := now();
  elsif new.status <> 'aprovado' then
    new.aprovado_por := null;
    new.aprovado_em  := null;
  elsif auth.uid() is not null then
    if new.aprovado_por is not null then
      new.aprovado_por := old.aprovado_por;
    end if;
    new.aprovado_em := old.aprovado_em;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists obtra_relatorios_antes on public.relatorios;
create trigger obtra_relatorios_antes
  before insert or update on public.relatorios
  for each row execute function public.relatorios_antes();

-- Mexer num filho "toca" o relatório (atualizado_em), útil para a lista.
-- Os filhos não mudam de relatório: mover item entre RDOs abriria caminho
-- para enfiar linha em relatório aprovado.
create or replace function public.relatorio_filho_antes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.relatorio_id is distinct from old.relatorio_id then
    raise exception 'O item não muda de relatório' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.criado_em := old.criado_em;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['relatorio_mao_obra', 'relatorio_equipamentos', 'relatorio_atividades',
                           'relatorio_ocorrencias', 'relatorio_materiais', 'relatorio_notas_compras'] loop
    execute format('drop trigger if exists obtra_filho_antes on public.%I', t);
    execute format('create trigger obtra_filho_antes before update on public.%I
                    for each row execute function public.relatorio_filho_antes()', t);
  end loop;
end $$;

-- --------------------------------------------------------- comentários -----
create or replace function public.comentarios_antes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.autor_id := auth.uid();
    end if;
  elsif auth.uid() is not null then
    if new.autor_id is not null then
      new.autor_id := old.autor_id;
    end if;
    new.relatorio_id := old.relatorio_id;
    new.criado_em    := old.criado_em;
  end if;
  return new;
end $$;

drop trigger if exists obtra_comentarios_antes on public.relatorio_comentarios;
create trigger obtra_comentarios_antes
  before insert or update on public.relatorio_comentarios
  for each row execute function public.comentarios_antes();

-- ------------------------------------------------- fotos e documentos ------
-- Tamanho real dos arquivos segundo o Storage (metadata.size). Quando o
-- arquivo existe, o número vem de lá — e não do que o navegador declarou.
create or replace function public.bytes_no_storage(p_caminhos text[])
returns bigint
language sql stable security definer
set search_path = public, pg_temp
as $$
  select sum((o.metadata ->> 'size')::bigint)
    from storage.objects o
   where o.bucket_id = 'obtra'
     and o.name = any (p_caminhos)
     and (o.metadata ->> 'size') ~ '^[0-9]+$'
$$;

create or replace function public.arquivos_antes()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa  uuid;
  v_pasta    text;
  v_caminhos text[];
  v_real     bigint;
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.obtra_interno() then
    if new.obra_id is distinct from old.obra_id or new.empresa_id is distinct from old.empresa_id then
      raise exception 'O arquivo não muda de obra' using errcode = '42501';
    end if;
    if new.path is distinct from old.path or new.bytes is distinct from old.bytes
       or (tg_table_name = 'fotos' and new.thumb_path is distinct from old.thumb_path) then
      raise exception 'Para trocar o arquivo, exclua e envie de novo' using errcode = '42501';
    end if;
    if new.criado_por is not null then
      new.criado_por := old.criado_por;
    end if;
    new.criado_em := old.criado_em;
  end if;

  select empresa_id into v_empresa from obras where id = new.obra_id;
  if not found then
    raise exception 'Obra não encontrada' using errcode = '23503';
  end if;
  new.empresa_id := v_empresa;

  if tg_table_name = 'fotos' then
    if new.relatorio_id is not null
       and not exists (select 1 from relatorios where id = new.relatorio_id and obra_id = new.obra_id) then
      raise exception 'O relatório não é desta obra' using errcode = '23514';
    end if;
    v_caminhos := array[new.path, new.thumb_path];
  else
    v_caminhos := array[new.path];
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.criado_por := auth.uid();
      -- O arquivo tem de estar na pasta da própria obra: {empresa}/{obra}/...
      v_pasta := v_empresa::text || '/' || new.obra_id::text || '/';
      if exists (select 1 from unnest(v_caminhos) c where c not like v_pasta || '%') then
        raise exception 'Caminho do arquivo fora da pasta da obra' using errcode = '42501';
      end if;
    end if;
    -- Com JWT (API), os arquivos TÊM de estar no Storage antes da linha:
    -- senão bastaria registrar `bytes = 0` e subir o arquivo depois para
    -- furar a cota. Sem JWT (SQL Editor/carga) vale o número informado.
    if auth.uid() is not null
       and (select count(*) from storage.objects o
             where o.bucket_id = 'obtra' and o.name = any (v_caminhos))
           < cardinality(array(select distinct c from unnest(v_caminhos) c)) then
      raise exception 'Arquivo não encontrado no Storage: envie o arquivo antes de registrá-lo'
        using errcode = '23503';
    end if;
    v_real := public.bytes_no_storage(v_caminhos);
    if v_real is not null then
      new.bytes := v_real;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists obtra_fotos_antes on public.fotos;
create trigger obtra_fotos_antes
  before insert or update on public.fotos
  for each row execute function public.arquivos_antes();

drop trigger if exists obtra_documentos_antes on public.documentos;
create trigger obtra_documentos_antes
  before insert or update on public.documentos
  for each row execute function public.arquivos_antes();

-- ------------------------------------------------ cota de armazenamento ----
-- AFTER: o insert que estouraria o limite é desfeito pela exceção. O UPDATE
-- em empresas trava a linha da empresa, então envios simultâneos entram em
-- fila em vez de passarem juntos pelo limite.
create or replace function public.arquivos_cota()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_usado  bigint;
  v_limite bigint;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update empresas
       set armazenamento_usado_bytes = greatest(armazenamento_usado_bytes - old.bytes, 0)
     where id = old.empresa_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update empresas
       set armazenamento_usado_bytes = armazenamento_usado_bytes + new.bytes
     where id = new.empresa_id
    returning armazenamento_usado_bytes, limite_armazenamento_mb::bigint * 1024 * 1024
         into v_usado, v_limite;
    if new.bytes > 0
       and (tg_op = 'INSERT' or new.bytes > old.bytes or new.empresa_id is distinct from old.empresa_id)
       and v_usado > v_limite then
      raise exception 'Limite de armazenamento da empresa atingido' using errcode = '53100';
    end if;
    return new;
  end if;
  return old;
end $$;

drop trigger if exists obtra_fotos_cota on public.fotos;
create trigger obtra_fotos_cota
  after insert or delete or update of bytes, empresa_id on public.fotos
  for each row execute function public.arquivos_cota();

drop trigger if exists obtra_documentos_cota on public.documentos;
create trigger obtra_documentos_cota
  after insert or delete or update of bytes, empresa_id on public.documentos
  for each row execute function public.arquivos_cota();

-- ====================================================== Adendo 1 ==========

-- ------------------------------------------------- cadastros da empresa ----
create or replace function public.cadastros_antes()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.empresa_id is null then
      new.empresa_id := public.minha_empresa();
    end if;
    if new.empresa_id is null then
      raise exception 'Informe a empresa do cadastro' using errcode = '23502';
    end if;
  elsif auth.uid() is not null and not public.obtra_interno()
        and new.empresa_id is distinct from old.empresa_id then
    raise exception 'O cadastro não muda de empresa' using errcode = '42501';
  end if;
  if tg_table_name = 'colaboradores' then
    if new.funcao_id is not null
       and not exists (select 1 from funcoes where id = new.funcao_id and empresa_id = new.empresa_id) then
      raise exception 'A função é de outra empresa' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['funcoes', 'colaboradores', 'materiais', 'equipamentos'] loop
    execute format('drop trigger if exists obtra_cadastros_antes on public.%I', t);
    execute format('create trigger obtra_cadastros_antes before insert or update on public.%I
                    for each row execute function public.cadastros_antes()', t);
  end loop;
end $$;

-- Itens do RDO que apontam para o cadastro: o cadastro tem de ser da mesma
-- empresa do relatório, e os campos de texto vazios são preenchidos a partir
-- dele (o texto fica gravado no RDO — o cliente, que não vê os cadastros,
-- continua lendo o nome da função/equipamento/material).
create or replace function public.relatorio_filho_cadastro()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa uuid;
  v_nome    text;
  v_aux     text;
  v_tipo    text;
  v_terc    text;
  v_dono    uuid;
begin
  select empresa_id into v_empresa from relatorios where id = new.relatorio_id;

  -- Campos de tabelas diferentes: cada ramo só toca os da própria tabela
  -- (o PL/pgSQL resolve new.<campo> mesmo dentro de um AND já falso).
  if tg_table_name = 'relatorio_mao_obra' then
    if new.colaborador_id is not null then
      select c.empresa_id, c.nome, f.nome, c.tipo, c.empresa_terceira
        into v_dono, v_nome, v_aux, v_tipo, v_terc
        from colaboradores c left join funcoes f on f.id = c.funcao_id
       where c.id = new.colaborador_id;
      if v_dono is distinct from v_empresa then
        raise exception 'Colaborador de outra empresa' using errcode = '23514';
      end if;
      new.colaborador_nome := coalesce(nullif(btrim(new.colaborador_nome), ''), v_nome);
      new.funcao := coalesce(nullif(btrim(new.funcao), ''), v_aux, 'Colaborador');
      if tg_op = 'INSERT' and new.empresa_terceira is null and v_tipo = 'terceirizada' then
        new.tipo := 'terceirizada';
        new.empresa_terceira := v_terc;
      end if;
    end if;
  elsif tg_table_name = 'relatorio_equipamentos' then
    if new.equipamento_id is not null then
      select empresa_id, nome into v_dono, v_nome from equipamentos where id = new.equipamento_id;
      if v_dono is distinct from v_empresa then
        raise exception 'Equipamento de outra empresa' using errcode = '23514';
      end if;
      new.nome := coalesce(nullif(btrim(new.nome), ''), v_nome);
    end if;
  elsif tg_table_name = 'relatorio_materiais' then
    if new.material_id is not null then
      select empresa_id, nome, unidade into v_dono, v_nome, v_aux from materiais where id = new.material_id;
      if v_dono is distinct from v_empresa then
        raise exception 'Material de outra empresa' using errcode = '23514';
      end if;
      new.descricao := coalesce(nullif(btrim(new.descricao), ''), v_nome);
      new.unidade := coalesce(nullif(btrim(new.unidade), ''), v_aux);
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['relatorio_mao_obra', 'relatorio_equipamentos', 'relatorio_materiais'] loop
    execute format('drop trigger if exists obtra_filho_cadastro on public.%I', t);
    execute format('create trigger obtra_filho_cadastro before insert or update on public.%I
                    for each row execute function public.relatorio_filho_cadastro()', t);
  end loop;
end $$;

-- ------------------------------------------------------------ histórico ----
create or replace function public.registrar_historico(
  p_empresa uuid, p_obra uuid, p_acao text, p_entidade text, p_entidade_id uuid, p_descricao text
)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_nome text;
begin
  -- Exclusão em cascata da empresa: nada a registrar (e o histórico dela vai junto).
  if p_empresa is null or not exists (select 1 from empresas where id = p_empresa) then
    return;
  end if;
  if v_uid is not null then
    select nome into v_nome from perfis where id = v_uid;
  end if;
  insert into historico (empresa_id, obra_id, usuario_id, usuario_nome, acao, entidade, entidade_id, descricao)
  values (p_empresa, p_obra, v_uid, coalesce(v_nome, 'Sistema'), p_acao, p_entidade, p_entidade_id, p_descricao);
end $$;

create or replace function public.historico_gatilho()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_obra_nome text;
  v_rotulo    text;
  v_acao      text;
  v_obra      uuid;
begin
  if tg_table_name = 'obras' then
    if tg_op = 'INSERT' then
      perform registrar_historico(new.empresa_id, new.id, 'criou', 'obra', new.id,
                                  format('Obra "%s" cadastrada', new.nome));
    elsif tg_op = 'DELETE' then
      perform registrar_historico(old.empresa_id, old.id, 'excluiu', 'obra', old.id,
                                  format('Obra "%s" excluída', old.nome));
    elsif (to_jsonb(new) - 'atualizado_em') <> (to_jsonb(old) - 'atualizado_em') then
      perform registrar_historico(new.empresa_id, new.id, 'editou', 'obra', new.id,
        case when new.status <> old.status
             then format('Obra "%s": status %s → %s', new.nome, old.status, new.status)
             else format('Obra "%s" editada', new.nome) end);
    end if;

  elsif tg_table_name = 'relatorios' then
    v_obra := coalesce(new.obra_id, old.obra_id);
    select nome into v_obra_nome from obras where id = v_obra;
    if v_obra_nome is null then
      return null;                       -- obra excluída em cascata
    end if;
    v_rotulo := format('RD-%s · %s', coalesce(new.numero, old.numero), v_obra_nome);
    if tg_op = 'INSERT' then
      perform registrar_historico(new.empresa_id, v_obra, 'criou', 'relatorio', new.id,
                                  format('%s criado (%s)', v_rotulo, to_char(new.data, 'DD/MM/YYYY')));
    elsif tg_op = 'DELETE' then
      perform registrar_historico(old.empresa_id, v_obra, 'excluiu', 'relatorio', old.id,
                                  format('%s excluído', v_rotulo));
    elsif new.status is distinct from old.status then
      v_acao := case
                  when new.status = 'aprovado' then 'aprovou'
                  when old.status = 'aprovado' then 'reabriu'
                  when new.status = 'revisar'  then 'enviou_aprovacao'
                  else 'devolveu'
                end;
      perform registrar_historico(new.empresa_id, v_obra, v_acao, 'relatorio', new.id,
        format('%s %s', v_rotulo, case v_acao
                                    when 'aprovou' then 'aprovado'
                                    when 'reabriu' then 'reaberto'
                                    when 'enviou_aprovacao' then 'enviado para aprovação'
                                    else 'devolvido para rascunho' end));
    end if;

  elsif tg_table_name in ('fotos', 'documentos') then
    v_obra := coalesce(new.obra_id, old.obra_id);
    select nome into v_obra_nome from obras where id = v_obra;
    if v_obra_nome is null then
      return null;
    end if;
    if tg_table_name = 'fotos' then
      if tg_op = 'INSERT' then
        perform registrar_historico(new.empresa_id, v_obra, 'enviou_foto', 'foto', new.id,
          format('Foto enviada · %s%s', v_obra_nome, coalesce(' — ' || nullif(new.legenda, ''), '')));
      else
        perform registrar_historico(old.empresa_id, v_obra, 'excluiu', 'foto', old.id,
          format('Foto excluída · %s', v_obra_nome));
      end if;
    else
      if tg_op = 'INSERT' then
        perform registrar_historico(new.empresa_id, v_obra, 'enviou_documento', 'documento', new.id,
          format('Documento "%s" enviado · %s', new.nome, v_obra_nome));
      else
        perform registrar_historico(old.empresa_id, v_obra, 'excluiu', 'documento', old.id,
          format('Documento "%s" excluído · %s', old.nome, v_obra_nome));
      end if;
    end if;

  elsif tg_table_name = 'perfis' then
    if tg_op = 'INSERT' and new.empresa_id is not null then
      perform registrar_historico(new.empresa_id, null, 'criou', 'usuario', new.id,
                                  format('Usuário "%s" (%s) cadastrado', new.nome, new.papel));
    elsif tg_op = 'DELETE' and old.empresa_id is not null then
      perform registrar_historico(old.empresa_id, null, 'excluiu', 'usuario', old.id,
                                  format('Usuário "%s" excluído', old.nome));
    end if;

  else  -- cadastros: funcoes, colaboradores, materiais, equipamentos
    v_rotulo := case tg_table_name
                  when 'funcoes' then 'Função'
                  when 'colaboradores' then 'Colaborador'
                  when 'materiais' then 'Material'
                  else 'Equipamento' end;
    if tg_op = 'INSERT' then
      perform registrar_historico(new.empresa_id, null, 'criou', 'cadastro', new.id,
                                  format('%s "%s" cadastrado', v_rotulo, new.nome));
    elsif tg_op = 'DELETE' then
      perform registrar_historico(old.empresa_id, null, 'excluiu', 'cadastro', old.id,
                                  format('%s "%s" excluído', v_rotulo, old.nome));
    end if;
  end if;
  return null;
end $$;

drop trigger if exists obtra_historico on public.obras;
create trigger obtra_historico after insert or update or delete on public.obras
  for each row execute function public.historico_gatilho();
drop trigger if exists obtra_historico on public.relatorios;
create trigger obtra_historico after insert or delete or update of status on public.relatorios
  for each row execute function public.historico_gatilho();
drop trigger if exists obtra_historico on public.fotos;
create trigger obtra_historico after insert or delete on public.fotos
  for each row execute function public.historico_gatilho();
drop trigger if exists obtra_historico on public.documentos;
create trigger obtra_historico after insert or delete on public.documentos
  for each row execute function public.historico_gatilho();
drop trigger if exists obtra_historico on public.perfis;
create trigger obtra_historico after insert or delete on public.perfis
  for each row execute function public.historico_gatilho();
do $$
declare t text;
begin
  foreach t in array array['funcoes', 'colaboradores', 'materiais', 'equipamentos'] loop
    execute format('drop trigger if exists obtra_historico on public.%I', t);
    execute format('create trigger obtra_historico after insert or delete on public.%I
                    for each row execute function public.historico_gatilho()', t);
  end loop;
end $$;

-- ============================================================
-- 20260929000003_rls.sql
-- ============================================================
-- ============================================================================
-- Obtra — 0003: políticas de RLS por papel.
-- ----------------------------------------------------------------------------
-- Todas as políticas são `to authenticated`: o anônimo não tem política
-- nenhuma (e nem privilégio de tabela — ver 0006), então não vê nada.
-- Regras de empresa inativa / perfil inativo moram nas funções auxiliares
-- (empresa_da_equipe, empresa_do_admin, obras_do_cliente...), não repetidas aqui.
--
-- Desempenho: tudo que não depende da linha vai dentro de `(select ...)` —
-- o Postgres calcula uma vez por consulta (initPlan) em vez de uma vez por
-- linha, e `empresa_id = (select ...)` usa o índice de empresa_id. Por isso
-- `(select auth.uid())`, `(select public.eh_master())` etc.
-- ============================================================================

-- ------------------------------------------------------------- empresas ----
drop policy if exists empresas_ler on public.empresas;
create policy empresas_ler on public.empresas for select to authenticated
  using ((select public.eh_master()) or (id = (select public.minha_empresa()) and ativa));

drop policy if exists empresas_inserir on public.empresas;
create policy empresas_inserir on public.empresas for insert to authenticated
  with check ((select public.eh_master()));

-- Admin edita os dados da própria empresa; limite e `ativa` são barrados
-- pelo gatilho empresas_proteger.
drop policy if exists empresas_atualizar on public.empresas;
create policy empresas_atualizar on public.empresas for update to authenticated
  using (((select public.eh_master()) or id = (select public.empresa_do_admin())))
  with check (((select public.eh_master()) or id = (select public.empresa_do_admin())));

drop policy if exists empresas_excluir on public.empresas;
create policy empresas_excluir on public.empresas for delete to authenticated
  using ((select public.eh_master()));

-- --------------------------------------------------------------- perfis ----
-- O próprio perfil é sempre legível (mesmo inativo): é assim que a tela sabe
-- dizer "sua conta está desativada" em vez de simplesmente vazia.
-- Cliente vê a equipe da empresa dele (nomes nos relatórios/comentários),
-- nunca os outros clientes.
drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.eh_master())
    or empresa_id = (select public.empresa_da_equipe())
    or (papel in ('admin', 'colaborador') and empresa_id = (select public.empresa_do_cliente()))
  );

-- Sem insert/delete: perfis nascem do gatilho em auth.users e morrem com ele
-- (RPCs admin_criar_usuario / admin_excluir_usuario).
drop policy if exists perfis_atualizar on public.perfis;
create policy perfis_atualizar on public.perfis for update to authenticated
  using (
    id = (select auth.uid())
    or (select public.eh_master())
    or (papel <> 'master' and empresa_id = (select public.empresa_do_admin()))
  )
  with check (
    id = (select auth.uid())
    or (select public.eh_master())
    or (papel <> 'master' and empresa_id = (select public.empresa_do_admin()))
  );

-- --------------------------------------------------------- configuracao ----
drop policy if exists configuracao_ler on public.configuracao;
create policy configuracao_ler on public.configuracao for select to authenticated
  using ((select public.eh_master()));

-- ---------------------------------------------------------------- obras ----
drop policy if exists obras_ler on public.obras;
create policy obras_ler on public.obras for select to authenticated
  using (((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe()))
         or id in (select public.obras_do_cliente()));

drop policy if exists obras_inserir on public.obras;
create policy obras_inserir on public.obras for insert to authenticated
  with check (((select public.eh_master()) or empresa_id = (select public.empresa_do_admin())));

-- Colaborador atualiza (status, capa, observações), não cria nem exclui.
drop policy if exists obras_atualizar on public.obras;
create policy obras_atualizar on public.obras for update to authenticated
  using (((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe())))
  with check (((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe())));

drop policy if exists obras_excluir on public.obras;
create policy obras_excluir on public.obras for delete to authenticated
  using (((select public.eh_master()) or empresa_id = (select public.empresa_do_admin())));

-- -------------------------------------------------------- obra_clientes ----
drop policy if exists obra_clientes_ler on public.obra_clientes;
create policy obra_clientes_ler on public.obra_clientes for select to authenticated
  using (
    ((select public.eh_master()) or public.empresa_da_obra(obra_id) = (select public.empresa_da_equipe()))
    or (cliente_id = (select auth.uid()) and obra_id in (select public.obras_do_cliente()))
  );

drop policy if exists obra_clientes_inserir on public.obra_clientes;
create policy obra_clientes_inserir on public.obra_clientes for insert to authenticated
  with check (((select public.eh_master()) or public.empresa_da_obra(obra_id) = (select public.empresa_do_admin())));

drop policy if exists obra_clientes_excluir on public.obra_clientes;
create policy obra_clientes_excluir on public.obra_clientes for delete to authenticated
  using (((select public.eh_master()) or public.empresa_da_obra(obra_id) = (select public.empresa_do_admin())));

-- ----------------------------------------------------------- relatorios ----
drop policy if exists relatorios_ler on public.relatorios;
create policy relatorios_ler on public.relatorios for select to authenticated
  using (
    ((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe()))
    or (status = 'aprovado' and obra_id in (select public.obras_do_cliente()))
  );

-- Colaborador cria e edita, mas não grava `aprovado` nem mexe em aprovado.
drop policy if exists relatorios_inserir on public.relatorios;
create policy relatorios_inserir on public.relatorios for insert to authenticated
  with check (
    ((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe()))
    and (status <> 'aprovado' or ((select public.eh_master()) or empresa_id = (select public.empresa_do_admin())))
  );

drop policy if exists relatorios_atualizar on public.relatorios;
create policy relatorios_atualizar on public.relatorios for update to authenticated
  using (
    ((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe()))
    and (status <> 'aprovado' or ((select public.eh_master()) or empresa_id = (select public.empresa_do_admin())))
  )
  with check (
    ((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe()))
    and (status <> 'aprovado' or ((select public.eh_master()) or empresa_id = (select public.empresa_do_admin())))
  );

drop policy if exists relatorios_excluir on public.relatorios;
create policy relatorios_excluir on public.relatorios for delete to authenticated
  using (((select public.eh_master()) or empresa_id = (select public.empresa_do_admin())));

-- ------------------------------------------------ filhos do relatório ------
do $$
declare t text;
begin
  foreach t in array array['relatorio_mao_obra', 'relatorio_equipamentos', 'relatorio_atividades',
                           'relatorio_ocorrencias', 'relatorio_materiais', 'relatorio_notas_compras'] loop
    execute format('drop policy if exists %I on public.%I', t || '_ler', t);
    execute format('create policy %I on public.%I for select to authenticated
                      using (public.pode_ver_relatorio(relatorio_id))', t || '_ler', t);

    execute format('drop policy if exists %I on public.%I', t || '_inserir', t);
    execute format('create policy %I on public.%I for insert to authenticated
                      with check (public.pode_editar_relatorio(relatorio_id))', t || '_inserir', t);

    execute format('drop policy if exists %I on public.%I', t || '_atualizar', t);
    execute format('create policy %I on public.%I for update to authenticated
                      using (public.pode_editar_relatorio(relatorio_id))
                      with check (public.pode_editar_relatorio(relatorio_id))', t || '_atualizar', t);

    execute format('drop policy if exists %I on public.%I', t || '_excluir', t);
    execute format('create policy %I on public.%I for delete to authenticated
                      using (public.pode_editar_relatorio(relatorio_id))', t || '_excluir', t);
  end loop;
end $$;

-- ---------------------------------------------------------- comentários ----
-- Quem vê o relatório comenta nele (cliente: só nos aprovados, que são os
-- únicos que ele vê). Autor edita/exclui o seu; admin/master excluem qualquer.
drop policy if exists relatorio_comentarios_ler on public.relatorio_comentarios;
create policy relatorio_comentarios_ler on public.relatorio_comentarios for select to authenticated
  using (public.pode_ver_relatorio(relatorio_id));

drop policy if exists relatorio_comentarios_inserir on public.relatorio_comentarios;
create policy relatorio_comentarios_inserir on public.relatorio_comentarios for insert to authenticated
  with check (autor_id = (select auth.uid()) and public.pode_ver_relatorio(relatorio_id));

drop policy if exists relatorio_comentarios_atualizar on public.relatorio_comentarios;
create policy relatorio_comentarios_atualizar on public.relatorio_comentarios for update to authenticated
  using (autor_id = (select auth.uid()) and public.pode_ver_relatorio(relatorio_id))
  with check (autor_id = (select auth.uid()) and public.pode_ver_relatorio(relatorio_id));

drop policy if exists relatorio_comentarios_excluir on public.relatorio_comentarios;
create policy relatorio_comentarios_excluir on public.relatorio_comentarios for delete to authenticated
  using (
    (autor_id = (select auth.uid()) and public.pode_ver_relatorio(relatorio_id))
    or public.eh_admin(public.empresa_do_relatorio(relatorio_id))
  );

-- ---------------------------------------------------------------- fotos ----
-- Cliente: fotos da obra dele sem relatório, ou de relatório aprovado.
drop policy if exists fotos_ler on public.fotos;
create policy fotos_ler on public.fotos for select to authenticated
  using (
    ((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe()))
    or (obra_id in (select public.obras_do_cliente())
        and (relatorio_id is null or public.pode_ver_relatorio(relatorio_id)))
  );

drop policy if exists fotos_inserir on public.fotos;
create policy fotos_inserir on public.fotos for insert to authenticated
  with check (
    ((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe()))
    and (relatorio_id is null or public.pode_editar_relatorio(relatorio_id))
  );

drop policy if exists fotos_atualizar on public.fotos;
create policy fotos_atualizar on public.fotos for update to authenticated
  using (
    ((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe()))
    and (relatorio_id is null or public.pode_editar_relatorio(relatorio_id))
  )
  with check (
    ((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe()))
    and (relatorio_id is null or public.pode_editar_relatorio(relatorio_id))
  );

drop policy if exists fotos_excluir on public.fotos;
create policy fotos_excluir on public.fotos for delete to authenticated
  using (
    ((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe()))
    and (relatorio_id is null or public.pode_editar_relatorio(relatorio_id))
  );

-- ----------------------------------------------------------- documentos ----
drop policy if exists documentos_ler on public.documentos;
create policy documentos_ler on public.documentos for select to authenticated
  using (
    ((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe()))
    or (visivel_cliente and obra_id in (select public.obras_do_cliente()))
  );

drop policy if exists documentos_inserir on public.documentos;
create policy documentos_inserir on public.documentos for insert to authenticated
  with check (((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe())));

drop policy if exists documentos_atualizar on public.documentos;
create policy documentos_atualizar on public.documentos for update to authenticated
  using (((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe())))
  with check (((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe())));

drop policy if exists documentos_excluir on public.documentos;
create policy documentos_excluir on public.documentos for delete to authenticated
  using (((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe())));

-- ------------------------------------------ cadastros da empresa (Adendo 1) -
-- Equipe lê, cria e edita; admin/master excluem; cliente não vê.
do $$
declare t text;
begin
  foreach t in array array['funcoes', 'colaboradores', 'materiais', 'equipamentos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_ler', t);
    execute format('create policy %I on public.%I for select to authenticated
                      using (((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe())))', t || '_ler', t);

    execute format('drop policy if exists %I on public.%I', t || '_inserir', t);
    execute format('create policy %I on public.%I for insert to authenticated
                      with check (((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe())))', t || '_inserir', t);

    execute format('drop policy if exists %I on public.%I', t || '_atualizar', t);
    execute format('create policy %I on public.%I for update to authenticated
                      using (((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe())))
                      with check (((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe())))', t || '_atualizar', t);

    execute format('drop policy if exists %I on public.%I', t || '_excluir', t);
    execute format('create policy %I on public.%I for delete to authenticated
                      using (((select public.eh_master()) or empresa_id = (select public.empresa_do_admin())))', t || '_excluir', t);
  end loop;
end $$;

-- ------------------------------------------------------------ histórico ----
-- Só leitura (equipe da empresa e master). Escrita: apenas os gatilhos.
drop policy if exists historico_ler on public.historico;
create policy historico_ler on public.historico for select to authenticated
  using (((select public.eh_master()) or empresa_id = (select public.empresa_da_equipe())));

-- ============================================================
-- 20260929000004_rpcs.sql
-- ============================================================
-- ============================================================================
-- Obtra — 0004: RPCs (supabase.rpc(nome, args)).
-- ----------------------------------------------------------------------------
-- Sem Edge Functions: o que precisa de privilégio (criar conta em auth.users,
-- trocar senha de outro, excluir conta) é SECURITY DEFINER aqui, e a PRIMEIRA
-- coisa que cada função faz é conferir quem chama.
--
-- Quem chama sem JWT (auth.uid() nulo) é o SQL Editor / service_role — o anon
-- não chega aqui porque o EXECUTE dele é revogado em 0006. Esse caminho é o do
-- instalador (criar o master, carga de demonstração).
-- ============================================================================

-- ---------------------------------------------------- admin_criar_usuario --
create or replace function public.admin_criar_usuario(
  p_email      text,
  p_senha      text,
  p_nome       text,
  p_papel      text,
  p_empresa_id uuid,
  p_obras      uuid[] default '{}',
  p_telefone   text default null,
  p_cargo      text default null
)
returns uuid
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_eu      perfis%rowtype;
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_nome    text := btrim(coalesce(p_nome, ''));
  v_empresa uuid := p_empresa_id;
  v_obras   uuid[] := coalesce(p_obras, '{}');
  v_id      uuid := gen_random_uuid();
  v_agora   timestamptz := now();
begin
  if v_uid is not null then
    select * into v_eu from perfis where id = v_uid and ativo;
    if not found or v_eu.papel not in ('master', 'admin') then
      raise exception 'Sem permissão para criar usuários' using errcode = '42501';
    end if;
  end if;

  if p_papel is null or p_papel not in ('master', 'admin', 'colaborador', 'cliente') then
    raise exception 'Papel inválido' using errcode = '22023';
  end if;
  if p_papel = 'master' then
    if v_uid is not null then
      raise exception 'Não é possível criar outro master pelo sistema' using errcode = '42501';
    end if;
    v_empresa := null;
  else
    if v_empresa is null then
      raise exception 'Informe a empresa do usuário' using errcode = '22023';
    end if;
    if not exists (select 1 from empresas where id = v_empresa) then
      raise exception 'Empresa não encontrada' using errcode = '22023';
    end if;
  end if;

  if v_uid is not null and v_eu.papel = 'admin' then
    if v_empresa is distinct from v_eu.empresa_id then
      raise exception 'Administrador só cria usuários na própria empresa' using errcode = '42501';
    end if;
    if not exists (select 1 from empresas where id = v_eu.empresa_id and ativa) then
      raise exception 'Empresa inativa' using errcode = '42501';
    end if;
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido' using errcode = '22023';
  end if;
  if length(coalesce(p_senha, '')) < 6 then
    raise exception 'A senha deve ter pelo menos 6 caracteres' using errcode = '22023';
  end if;
  if v_nome = '' then
    raise exception 'Informe o nome' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'E-mail já cadastrado' using errcode = '23505';
  end if;
  if cardinality(v_obras) > 0 then
    if p_papel <> 'cliente' then
      raise exception 'Somente clientes são vinculados a obras' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(v_obras) o(id)
                where not exists (select 1 from obras where obras.id = o.id and obras.empresa_id = v_empresa)) then
      raise exception 'Obra não encontrada nesta empresa' using errcode = '22023';
    end if;
  end if;

  perform set_config('obtra.interno', 'on', true);

  -- Todas as colunas que o GoTrue lê como string precisam ser '' e não NULL,
  -- senão o login quebra com "converting NULL to string is unsupported".
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token, phone_change, phone_change_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_senha, gen_salt('bf', 10)), v_agora,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', v_nome, 'papel', p_papel, 'empresa_id', v_empresa),
    v_agora, v_agora,
    '', '', '', '', '', '', '', ''
  );

  -- `email` em auth.identities é coluna gerada no Supabase: não se insere.
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text, 'email',
    jsonb_build_object('sub', v_id::text, 'email', v_email,
                       'email_verified', true, 'phone_verified', false),
    v_agora, v_agora, v_agora
  );

  -- O gatilho já criou o perfil a partir dos metadados; aqui completamos.
  insert into perfis (id, nome, email, papel, empresa_id, telefone, cargo)
  values (v_id, v_nome, v_email, p_papel, v_empresa, nullif(btrim(p_telefone), ''), nullif(btrim(p_cargo), ''))
  on conflict (id) do update
     set nome = excluded.nome, papel = excluded.papel, empresa_id = excluded.empresa_id,
         telefone = excluded.telefone, cargo = excluded.cargo, ativo = true;

  if cardinality(v_obras) > 0 then
    insert into obra_clientes (obra_id, cliente_id)
    select distinct o, v_id from unnest(v_obras) o
    on conflict do nothing;
  end if;

  perform set_config('obtra.interno', 'off', true);
  return v_id;
end $$;

-- ------------------------------------------- pode_administrar_usuario ------
-- Master: qualquer um. Admin: usuários (não master) da própria empresa ativa.
create or replace function public.pode_administrar_usuario(p_usuario uuid)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_alvo perfis%rowtype;
begin
  if auth.uid() is null then
    return true;
  end if;
  if public.eh_master() then
    return true;
  end if;
  select * into v_alvo from perfis where id = p_usuario;
  if not found then
    return false;
  end if;
  return v_alvo.papel <> 'master'
     and v_alvo.empresa_id is not null
     and public.eh_admin(v_alvo.empresa_id)
     and public.meu_papel() = 'admin';
end $$;

-- -------------------------------------------------- admin_redefinir_senha --
create or replace function public.admin_redefinir_senha(p_usuario uuid, p_senha text)
returns void
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.pode_administrar_usuario(p_usuario) then
    raise exception 'Sem permissão para alterar a senha deste usuário' using errcode = '42501';
  end if;
  if length(coalesce(p_senha, '')) < 6 then
    raise exception 'A senha deve ter pelo menos 6 caracteres' using errcode = '22023';
  end if;
  update auth.users
     set encrypted_password = crypt(p_senha, gen_salt('bf', 10)),
         updated_at = now()
   where id = p_usuario;
  if not found then
    raise exception 'Usuário não encontrado' using errcode = 'P0002';
  end if;
end $$;

-- -------------------------------------------------- admin_excluir_usuario --
create or replace function public.admin_excluir_usuario(p_usuario uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_papel text;
begin
  if p_usuario = auth.uid() then
    raise exception 'Você não pode excluir a si mesmo' using errcode = '42501';
  end if;
  select papel into v_papel from perfis where id = p_usuario;
  if v_papel = 'master' and auth.uid() is not null then
    raise exception 'O master não pode ser excluído pelo sistema' using errcode = '42501';
  end if;
  if not public.pode_administrar_usuario(p_usuario) then
    raise exception 'Sem permissão para excluir este usuário' using errcode = '42501';
  end if;
  delete from auth.users where id = p_usuario;
  if not found then
    raise exception 'Usuário não encontrado' using errcode = 'P0002';
  end if;
end $$;

-- -------------------------------------------------- definir_obras_cliente --
create or replace function public.definir_obras_cliente(p_cliente uuid, p_obras uuid[])
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_alvo  perfis%rowtype;
  v_obras uuid[] := coalesce(p_obras, '{}');
begin
  select * into v_alvo from perfis where id = p_cliente;
  if not found or not public.pode_administrar_usuario(p_cliente) then
    raise exception 'Sem permissão para alterar este cliente' using errcode = '42501';
  end if;
  if v_alvo.papel <> 'cliente' then
    raise exception 'Somente clientes são vinculados a obras' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_obras) o(id)
              where not exists (select 1 from obras
                                 where obras.id = o.id and obras.empresa_id = v_alvo.empresa_id)) then
    raise exception 'Obra não encontrada na empresa do cliente' using errcode = '22023';
  end if;

  delete from obra_clientes where cliente_id = p_cliente and obra_id <> all (v_obras);
  insert into obra_clientes (obra_id, cliente_id)
  select distinct o, p_cliente from unnest(v_obras) o
  on conflict do nothing;
end $$;

-- --------------------------------------------------------- criar_relatorio -
create or replace function public.criar_relatorio(
  p_obra uuid,
  p_data date,
  p_copiar_anterior boolean default true
)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa  uuid;
  v_anterior relatorios%rowtype;
  v_copiar   boolean := coalesce(p_copiar_anterior, true);
  v_id       uuid;
begin
  select empresa_id into v_empresa from obras where id = p_obra;
  if not found or not public.eh_equipe(v_empresa) then
    raise exception 'Obra não encontrada ou sem permissão' using errcode = '42501';
  end if;
  if p_data is null then
    raise exception 'Informe a data do relatório' using errcode = '22023';
  end if;

  select * into v_anterior
    from relatorios
   where obra_id = p_obra
   order by data desc, numero desc
   limit 1;
  if not found then
    v_copiar := false;
  end if;

  -- empresa e número: gatilho. Responsável nulo → gatilho usa o nome de quem cria.
  insert into relatorios (obra_id, empresa_id, numero, data, responsavel,
                          horario_inicio, horario_fim, intervalo_inicio, intervalo_fim)
  values (p_obra, v_empresa, 0, p_data,
          case when v_copiar then v_anterior.responsavel end,
          case when v_copiar then v_anterior.horario_inicio end,
          case when v_copiar then v_anterior.horario_fim end,
          case when v_copiar then v_anterior.intervalo_inicio end,
          case when v_copiar then v_anterior.intervalo_fim end)
  returning id into v_id;

  if v_copiar then
    insert into relatorio_mao_obra (relatorio_id, ordem, colaborador_id, colaborador_nome, funcao,
                                    quantidade, tipo, empresa_terceira)
    select v_id, ordem, colaborador_id, colaborador_nome, funcao, quantidade, tipo, empresa_terceira
      from relatorio_mao_obra where relatorio_id = v_anterior.id;
    insert into relatorio_equipamentos (relatorio_id, ordem, equipamento_id, nome, quantidade)
    select v_id, ordem, equipamento_id, nome, quantidade
      from relatorio_equipamentos where relatorio_id = v_anterior.id;
  end if;
  return v_id;
end $$;

-- -------------------------------------------------- mudar_status_relatorio -
create or replace function public.mudar_status_relatorio(p_relatorio uuid, p_status text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_rel relatorios%rowtype;
begin
  select * into v_rel from relatorios where id = p_relatorio for update;
  if not found or not public.eh_equipe(v_rel.empresa_id) then
    raise exception 'Relatório não encontrado ou sem permissão' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('preenchendo', 'revisar', 'aprovado') then
    raise exception 'Status inválido' using errcode = '22023';
  end if;
  if (p_status = 'aprovado' or v_rel.status = 'aprovado') and not public.eh_admin(v_rel.empresa_id) then
    raise exception 'Somente o administrador aprova ou reabre um relatório aprovado' using errcode = '42501';
  end if;
  if p_status = v_rel.status then
    return;
  end if;
  update relatorios set status = p_status where id = p_relatorio;
end $$;

-- ---------------------------------------------------------- painel_resumo --
-- SECURITY INVOKER de propósito: as contagens passam pela RLS, então cada um
-- vê o próprio escopo sem que esta função precise repetir as regras.
create or replace function public.painel_resumo()
returns jsonb
language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare
  v_master boolean := public.eh_master();
  v_papel  text    := public.meu_papel();
  v_usado  bigint;
  v_limite bigint;
begin
  if v_master then
    select coalesce(sum(armazenamento_usado_bytes), 0),
           coalesce(sum(limite_armazenamento_mb::bigint * 1024 * 1024), 0)
      into v_usado, v_limite
      from empresas;
  elsif v_papel = 'admin' then
    select armazenamento_usado_bytes, limite_armazenamento_mb::bigint * 1024 * 1024
      into v_usado, v_limite
      from empresas where id = public.minha_empresa();
  end if;

  return jsonb_build_object(
    'obras_total',      (select count(*) from obras),
    'obras_andamento',  (select count(*) from obras where status = 'em_andamento'),
    'relatorios_total', (select count(*) from relatorios),
    'relatorios_pendentes', (select count(*) from relatorios where status = 'revisar'),
    'relatorios_mes',   (select count(*) from relatorios
                          where data >= date_trunc('month', current_date)::date
                            and data <  (date_trunc('month', current_date) + interval '1 month')::date),
    'fotos_total',      (select count(*) from fotos),
    'armazenamento_usado_bytes',  v_usado,
    'armazenamento_limite_bytes', v_limite,
    'empresas_total',   case when v_master then (select count(*) from empresas) end
  );
end $$;

-- ----------------------------------------------------------- tornar_master -
-- Só pelo SQL Editor (postgres). EXECUTE revogado de todos os papéis da API.
create or replace function public.tornar_master(p_email text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_email text;
begin
  select id, email into v_id, v_email from auth.users where lower(email) = lower(btrim(p_email));
  if not found then
    raise exception 'Nenhuma conta com o e-mail %', p_email using errcode = 'P0002';
  end if;
  perform set_config('obtra.interno', 'on', true);
  insert into perfis (id, nome, email, papel, empresa_id)
  values (v_id, split_part(v_email, '@', 1), lower(v_email), 'master', null)
  on conflict (id) do update set papel = 'master', empresa_id = null, ativo = true;
  perform set_config('obtra.interno', 'off', true);
end $$;

-- ============================================================
-- 20260929000005_storage.sql
-- ============================================================
-- ============================================================================
-- Obtra — 0005: bucket `obtra` e políticas de storage.objects.
-- ----------------------------------------------------------------------------
-- Caminhos (o 1º segmento é SEMPRE a empresa):
--   {empresa}/logo/{uuid}.webp
--   {empresa}/{obra}/capa/{uuid}.webp  e  {uuid}_t.webp
--   {empresa}/{obra}/fotos/{uuid}.webp e  {uuid}_t.webp
--   {empresa}/{obra}/docs/{uuid}.pdf
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('obtra', 'obtra', false, 15 * 1024 * 1024,
        array['image/webp', 'image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
   set public             = false,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- Leitura. Equipe: tudo da empresa. Cliente: o logo da empresa dele e só os
-- arquivos que ele já enxerga pelas tabelas — capa das obras dele, fotos sem
-- relatório ou de relatório aprovado, documentos `visivel_cliente`. Sem isto,
-- um `list` na pasta da obra entregaria fotos de RDO não aprovado e documentos
-- internos a quem conhece o caminho da pasta (que aparece na própria URL).
create or replace function public.storage_pode_ler(p_nome text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_partes  text[] := string_to_array(p_nome, '/');
  v_empresa uuid   := public.uuid_seguro(v_partes[1]);
  v_obra    uuid;
begin
  if v_empresa is null then
    return public.eh_master();
  end if;
  if public.eh_equipe(v_empresa) then
    return true;
  end if;
  if public.meu_papel() is distinct from 'cliente'
     or public.minha_empresa() is distinct from v_empresa
     or not exists (select 1 from empresas where id = v_empresa and ativa) then
    return false;
  end if;
  if v_partes[2] = 'logo' then
    return true;
  end if;
  v_obra := public.uuid_seguro(v_partes[2]);
  if v_obra is null or not public.eh_cliente_da_obra(v_obra) then
    return false;
  end if;
  return exists (select 1 from obras o
                  where o.id = v_obra and p_nome in (o.capa_path, o.capa_thumb_path))
      or exists (select 1 from fotos f
                   left join relatorios r on r.id = f.relatorio_id
                  where (f.path = p_nome or f.thumb_path = p_nome)
                    and f.obra_id = v_obra
                    and (f.relatorio_id is null or r.status = 'aprovado'))
      or exists (select 1 from documentos d
                  where d.obra_id = v_obra and d.path = p_nome and d.visivel_cliente);
end $$;

-- Escrita: equipe da empresa, dentro da pasta de uma obra DA empresa; logo só
-- admin/master. Master escreve em qualquer lugar.
create or replace function public.storage_pode_escrever(p_nome text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_partes  text[] := string_to_array(p_nome, '/');
  v_empresa uuid   := public.uuid_seguro(v_partes[1]);
begin
  if public.eh_master() then
    return true;
  end if;
  if v_empresa is null or coalesce(array_length(v_partes, 1), 0) < 3 then
    return false;
  end if;
  if v_partes[2] = 'logo' then
    return public.eh_admin(v_empresa);
  end if;
  return public.eh_equipe(v_empresa)
     and exists (select 1 from obras
                  where id = public.uuid_seguro(v_partes[2]) and empresa_id = v_empresa);
end $$;

-- Trocar/apagar arquivo: além de poder escrever na pasta, o arquivo não pode
-- ser foto de RDO aprovado — a não ser para admin/master. Sem isso o
-- colaborador, que não mexe na linha da foto aprovada, apagaria o arquivo dela.
create or replace function public.storage_pode_alterar(p_nome text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.storage_pode_escrever(p_nome) then
    return false;
  end if;
  if public.eh_admin(public.uuid_seguro(split_part(p_nome, '/', 1))) then
    return true;
  end if;
  return not exists (select 1 from fotos f
                       join relatorios r on r.id = f.relatorio_id
                      where (f.path = p_nome or f.thumb_path = p_nome)
                        and r.status = 'aprovado');
end $$;

-- Empresa que já estourou a cota não sobe mais arquivo nenhum. O uso é o
-- MAIOR entre o contabilizado (fotos/documentos) e o que de fato está no
-- bucket sob a pasta da empresa: sem isso, arquivos enviados e nunca
-- registrados (órfãos) ocupariam espaço sem contar na cota.
create or replace function public.storage_tem_espaco(p_nome text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa uuid := public.uuid_seguro(split_part(p_nome, '/', 1));
  v_usado   bigint;
  v_limite  bigint;
  v_bucket  bigint;
begin
  select e.armazenamento_usado_bytes, e.limite_armazenamento_mb::bigint * 1024 * 1024
    into v_usado, v_limite
    from empresas e
   where e.id = v_empresa;
  if not found then
    return public.eh_master();
  end if;
  select coalesce(sum(case when (o.metadata ->> 'size') ~ '^[0-9]+$'
                           then (o.metadata ->> 'size')::bigint else 0 end), 0)
    into v_bucket
    from storage.objects o
   where o.bucket_id = 'obtra'
     and o.name like v_empresa::text || '/%';
  return greatest(v_usado, v_bucket) < v_limite;
end $$;

drop policy if exists obtra_ler on storage.objects;
create policy obtra_ler on storage.objects for select to authenticated
  using (bucket_id = 'obtra' and public.storage_pode_ler(name));

drop policy if exists obtra_inserir on storage.objects;
create policy obtra_inserir on storage.objects for insert to authenticated
  with check (bucket_id = 'obtra' and public.storage_pode_escrever(name)
              and public.storage_tem_espaco(name));

drop policy if exists obtra_atualizar on storage.objects;
-- (upsert de arquivo existente é UPDATE: também passa pela cota)
create policy obtra_atualizar on storage.objects for update to authenticated
  using (bucket_id = 'obtra' and public.storage_pode_alterar(name))
  with check (bucket_id = 'obtra' and public.storage_pode_alterar(name)
              and public.storage_tem_espaco(name));

drop policy if exists obtra_excluir on storage.objects;
create policy obtra_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'obtra' and public.storage_pode_alterar(name));

-- ============================================================
-- 20260929000006_permissoes.sql
-- ============================================================
-- ============================================================================
-- Obtra — 0006: privilégios (GRANT/REVOKE).
-- ----------------------------------------------------------------------------
-- O Supabase dá, por privilégio padrão, SELECT/INSERT/... e EXECUTE ao `anon`
-- em tudo que nasce em `public`. A RLS barraria as linhas, mas as RPCs
-- SECURITY DEFINER não passam por RLS — então o anon perde EXECUTE em tudo e
-- só `authenticated` recebe o que a API usa.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- `authenticated` também perde tudo antes de receber só o CRUD: o padrão do
-- Supabase inclui TRUNCATE (que ignora a RLS), REFERENCES e TRIGGER.
revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
-- Sequências (a identidade de `historico`): só os gatilhos usam.
revoke all on all sequences in schema public from anon, authenticated;
grant usage, select on all sequences in schema public to service_role;

-- Nada de API para a configuração além da leitura (master, pela RLS).
revoke insert, update, delete on public.configuracao from authenticated;
-- Histórico: só os gatilhos (security definer) escrevem.
revoke insert, update, delete, truncate on public.historico from authenticated;

-- Funções: começa tirando de todo mundo (PUBLIC, anon E authenticated), exceto
-- as de extensão, e depois devolve só o que a API usa. O Supabase dá EXECUTE
-- ao `authenticated` por privilégio padrão em toda função nova de `public`:
-- sem tirar, qualquer logado chamaria `registrar_historico` (security definer)
-- e gravaria histórico falso em qualquer empresa.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);
    execute format('grant execute on function %s to service_role', f.assinatura);
  end loop;
end $$;

-- Auxiliares chamadas pelas políticas (rodam como o usuário da requisição).
grant execute on function
  public.uuid_seguro(text),
  public.obtra_interno(),
  public.eh_master(),
  public.meu_papel(),
  public.minha_empresa(),
  public.eh_equipe(uuid),
  public.eh_admin(uuid),
  public.eh_cliente_da_obra(uuid),
  public.empresa_da_equipe(),
  public.empresa_do_admin(),
  public.empresa_do_cliente(),
  public.obras_do_cliente(),
  public.empresa_da_obra(uuid),
  public.pode_ver_obra(uuid),
  public.pode_ver_relatorio(uuid),
  public.pode_editar_relatorio(uuid),
  public.empresa_do_relatorio(uuid),
  public.storage_pode_ler(text),
  public.storage_pode_escrever(text),
  public.storage_pode_alterar(text),
  public.storage_tem_espaco(text)
to authenticated;

-- RPCs da aplicação.
grant execute on function
  public.admin_criar_usuario(text, text, text, text, uuid, uuid[], text, text),
  public.admin_redefinir_senha(uuid, text),
  public.admin_excluir_usuario(uuid),
  public.definir_obras_cliente(uuid, uuid[]),
  public.criar_relatorio(uuid, date, boolean),
  public.mudar_status_relatorio(uuid, text),
  public.painel_resumo()
to authenticated;

-- tornar_master: só o dono do banco (SQL Editor).
revoke all on function public.tornar_master(text) from public, anon, authenticated, service_role;

-- ============================================================
-- 20260929000007_notas_internas_e_arquivos_orfaos.sql
-- ============================================================
-- ============================================================================
-- Obtra — 0007: ajustes da entrega.
-- ----------------------------------------------------------------------------
-- 1. Notas de compras são internas da construtora (fornecedor, nº da nota,
--    valor). O front já não as mostra ao cliente; agora o BANCO também não
--    entrega: só a equipe da empresa (e o master) lê `relatorio_notas_compras`.
--    O cliente continua vendo o resto do RDO aprovado. Um select do cliente
--    volta vazio (e o embed `relatorio_notas_compras(*)` vem `[]`), sem erro.
--
-- 2. Arquivos órfãos: ao excluir uma obra, o front apaga a linha (cascata no
--    banco) e depois a pasta `{empresa}/{obra}/` no Storage. Só que, sem a
--    obra, `storage_pode_escrever` (exige obra da empresa) negava o DELETE —
--    os arquivos ficavam no bucket para sempre, ocupando a cota. O admin da
--    empresa (e o master) agora pode apagar arquivos da pasta de uma obra que
--    já não existe. Criar/sobrescrever continua exigindo obra existente.
--
-- Idempotente: pode rodar de novo (e depois das anteriores, em qualquer
-- reaplicação do instalar.sql).
-- ============================================================================

-- ------------------------------------------------ 1. notas de compras ------
drop policy if exists relatorio_notas_compras_ler on public.relatorio_notas_compras;
create policy relatorio_notas_compras_ler on public.relatorio_notas_compras for select to authenticated
  using (public.eh_equipe(public.empresa_do_relatorio(relatorio_id)));

-- --------------------------------------- 2. limpeza de pasta sem obra ------
drop policy if exists obtra_excluir on storage.objects;
create policy obtra_excluir on storage.objects for delete to authenticated
  using (
    bucket_id = 'obtra'
    and (
      public.storage_pode_alterar(name)
      or (public.eh_admin(public.uuid_seguro(split_part(name, '/', 1)))
          and public.uuid_seguro(split_part(name, '/', 2)) is not null
          and public.empresa_da_obra(public.uuid_seguro(split_part(name, '/', 2))) is null)
    )
  );

-- ============================================================
-- 20260929000008_numero_da_obra.sql
-- ============================================================
-- ============================================================================
-- Número automático da obra.
-- ----------------------------------------------------------------------------
-- Cada empresa numera as próprias obras em sequência (1, 2, 3…), e o código
-- exibido nasce disso: OB-001, OB-002… Ninguém precisa preencher. Obras que já
-- tinham código digitado o mantêm; as que não tinham recebem o automático.
-- Idempotente: pode rodar de novo por cima.
-- ============================================================================

alter table public.obras add column if not exists numero int;

-- Numera as obras antigas, continuando depois do maior número da empresa, na
-- ordem em que foram criadas.
with maiores as (
  select empresa_id, coalesce(max(numero), 0) as base
    from public.obras group by empresa_id
), faltando as (
  select o.id,
         m.base + row_number() over (partition by o.empresa_id order by o.criado_em, o.id) as n
    from public.obras o join maiores m using (empresa_id)
   where o.numero is null
)
update public.obras o set numero = f.n from faltando f where o.id = f.id;

update public.obras
   set codigo = 'OB-' || lpad(numero::text, 3, '0')
 where coalesce(btrim(codigo), '') = '' and numero is not null;

create unique index if not exists obras_empresa_numero_uk on public.obras (empresa_id, numero);

create or replace function public.obras_numerar()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- Trava a empresa: duas obras criadas ao mesmo tempo esperam uma pela outra
    -- em vez de disputarem o mesmo número.
    perform 1 from empresas where id = new.empresa_id for update;
    select coalesce(max(numero), 0) + 1 into new.numero
      from obras where empresa_id = new.empresa_id;
  else
    new.numero := old.numero;  -- o número nunca muda
    if coalesce(btrim(new.codigo), '') = '' then
      new.codigo := old.codigo;
    end if;
  end if;
  if coalesce(btrim(new.codigo), '') = '' then
    new.codigo := 'OB-' || lpad(new.numero::text, 3, '0');
  end if;
  return new;
end $$;

-- "numerar" vem depois de "antes" na ordem alfabética: quando roda, a empresa
-- da obra já foi resolvida pelo gatilho obras_antes.
drop trigger if exists obtra_obras_numerar on public.obras;
create trigger obtra_obras_numerar
  before insert or update on public.obras
  for each row execute function public.obras_numerar();

revoke all on function public.obras_numerar() from public, anon, authenticated;
