-- ============================================================================
-- Arremedo do ambiente Supabase para testar as migrações num Postgres puro.
-- ----------------------------------------------------------------------------
-- Não vai para produção. Serve a `supabase/testes/executar.sh` e ao ambiente
-- local (`ferramentas/local/subir.sh`). Espelha o que as migrações e o portão
-- local tocam: papéis, auth.users/identities COM as colunas que o GoTrue lê,
-- auth.uid(), storage.buckets/objects e o schema `extensions` com pgcrypto.
-- ============================================================================

-- Papéis são do cluster, não do banco: sobrevivem ao drop database.
do $$
declare p text;
begin
  foreach p in array array['anon', 'authenticated'] loop
    if not exists (select 1 from pg_roles where rolname = p) then
      execute format('create role %I nologin noinherit', p);
    end if;
  end loop;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  -- Quem o PostgREST usa para entrar (como no Supabase): só troca de papel.
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
  -- Quem o GoTrue usa: serve para testar o cadastro "vindo de fora".
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin login noinherit;
  end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema if not exists auth;
create schema if not exists storage;

-- Colunas como no GoTrue. As de token NÃO têm default e aceitam NULL, como lá:
-- quem insere direto em auth.users tem de preenchê-las com '' ou o login
-- quebra ("converting NULL to string is unsupported") — o portão local
-- reproduz essa falha para que o defeito apareça aqui e não na produção.
create table auth.users (
  instance_id                 uuid,
  id                          uuid primary key,
  aud                         varchar(255),
  role                        varchar(255),
  email                       varchar(255),
  encrypted_password          varchar(255),
  email_confirmed_at          timestamptz,
  invited_at                  timestamptz,
  confirmation_token          varchar(255),
  confirmation_sent_at        timestamptz,
  recovery_token              varchar(255),
  recovery_sent_at            timestamptz,
  email_change_token_new      varchar(255),
  email_change                varchar(255),
  email_change_sent_at        timestamptz,
  last_sign_in_at             timestamptz,
  raw_app_meta_data           jsonb,
  raw_user_meta_data          jsonb,
  is_super_admin              boolean,
  created_at                  timestamptz,
  updated_at                  timestamptz,
  phone                       text unique default null,
  phone_confirmed_at          timestamptz,
  phone_change                text default '',
  phone_change_token          varchar(255) default '',
  phone_change_sent_at        timestamptz,
  confirmed_at                timestamptz generated always as (least(email_confirmed_at, phone_confirmed_at)) stored,
  email_change_token_current  varchar(255) default '',
  email_change_confirm_status smallint default 0,
  banned_until                timestamptz,
  reauthentication_token      varchar(255) default '',
  reauthentication_sent_at    timestamptz,
  is_sso_user                 boolean not null default false,
  deleted_at                  timestamptz,
  is_anonymous                boolean not null default false
);
create unique index users_email_partial_key on auth.users (email) where (is_sso_user = false);

create table auth.identities (
  provider_id     text not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  identity_data   jsonb not null,
  provider        text not null,
  last_sign_in_at timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz,
  email           text generated always as (lower(identity_data ->> 'email')) stored,
  id              uuid primary key default gen_random_uuid(),
  constraint identities_provider_id_provider_unique unique (provider_id, provider)
);

-- O Supabase resolve auth.uid() a partir do JWT. Lê as duas fontes:
--   request.jwt.claims  — o JSON inteiro, que o PostgREST publica;
--   request.jwt.claim.* — o campo avulso, que os testes SQL trocam.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  public             boolean default false,
  avif_autodetection boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  owner_id           text
);

create table storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text references storage.buckets (id),
  name             text,
  owner            uuid,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata         jsonb,
  path_tokens      text[] generated always as (string_to_array(name, '/')) stored,
  version          text,
  owner_id         text,
  user_metadata    jsonb
);
create unique index bucketid_objname on storage.objects (bucket_id, name);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
create policy buckets_ler on storage.buckets for select to authenticated, anon using (true);

-- 'empresa/obra/fotos/x.webp' -> {empresa,obra,fotos}
create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;

create or replace function storage.filename(name text) returns text
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end $$;

grant usage on schema auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

-- Privilégios padrão do Supabase em `public`: TODA tabela, função e sequência
-- nova nasce com ALL para anon, authenticated e service_role. As migrações
-- têm de desfazer isso (0006); sem este trecho a suíte não enxergaria, por
-- exemplo, uma função interna executável pelo `authenticated`.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
