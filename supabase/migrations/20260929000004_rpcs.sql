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
