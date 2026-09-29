-- ============================================================================
-- Obtra — 0002: funções auxiliares (usadas pela RLS) e gatilhos.
-- ----------------------------------------------------------------------------
-- Toda função que lê tabela protegida é SECURITY DEFINER com search_path fixo:
-- assim a política de `perfis` pode perguntar "quem é você" sem cair na própria
-- RLS de `perfis` (recursão infinita), e ninguém sequestra a função criando um
-- objeto homônimo num schema que venha antes no search_path.
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
set search_path = public
as $$
begin
  return p_texto::uuid;
exception when others then
  return null;
end $$;

create or replace function public.obtra_interno()
returns boolean
language sql stable
set search_path = public
as $$
  select coalesce(current_setting('obtra.interno', true), '') = 'on'
$$;

-- ------------------------------------------------- quem é o usuário atual ---
create or replace function public.eh_master()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from perfis
     where id = auth.uid() and papel = 'master' and ativo
  )
$$;

create or replace function public.meu_papel()
returns text
language sql stable security definer
set search_path = public
as $$
  select papel from perfis where id = auth.uid() and ativo
$$;

create or replace function public.minha_empresa()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select empresa_id from perfis where id = auth.uid() and ativo
$$;

-- Equipe (admin/colaborador ativo) daquela empresa ATIVA — ou master.
create or replace function public.eh_equipe(empresa uuid)
returns boolean
language sql stable security definer
set search_path = public
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
set search_path = public
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
set search_path = public
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

create or replace function public.empresa_da_obra(obra uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select empresa_id from obras where id = obra
$$;

create or replace function public.pode_ver_obra(obra uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.eh_master()
      or exists (select 1 from obras o where o.id = obra and public.eh_equipe(o.empresa_id))
      or public.eh_cliente_da_obra(obra)
$$;

-- Equipe vê qualquer relatório da empresa; cliente só os aprovados das obras dele.
create or replace function public.pode_ver_relatorio(relatorio uuid)
returns boolean
language sql stable security definer
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
