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
set search_path = public
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
                  where f.obra_id = v_obra
                    and p_nome in (f.path, f.thumb_path)
                    and (f.relatorio_id is null or r.status = 'aprovado'))
      or exists (select 1 from documentos d
                  where d.obra_id = v_obra and d.path = p_nome and d.visivel_cliente);
end $$;

-- Escrita: equipe da empresa, dentro da pasta de uma obra DA empresa; logo só
-- admin/master. Master escreve em qualquer lugar.
create or replace function public.storage_pode_escrever(p_nome text)
returns boolean
language plpgsql stable security definer
set search_path = public
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

-- Empresa que já estourou a cota não sobe mais arquivo nenhum (nem órfão).
create or replace function public.storage_tem_espaco(p_nome text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select e.armazenamento_usado_bytes < e.limite_armazenamento_mb::bigint * 1024 * 1024
      from empresas e
     where e.id = public.uuid_seguro(split_part(p_nome, '/', 1))
  ), public.eh_master())
$$;

drop policy if exists obtra_ler on storage.objects;
create policy obtra_ler on storage.objects for select to authenticated
  using (bucket_id = 'obtra' and public.storage_pode_ler(name));

drop policy if exists obtra_inserir on storage.objects;
create policy obtra_inserir on storage.objects for insert to authenticated
  with check (bucket_id = 'obtra' and public.storage_pode_escrever(name)
              and public.storage_tem_espaco(name));

drop policy if exists obtra_atualizar on storage.objects;
create policy obtra_atualizar on storage.objects for update to authenticated
  using (bucket_id = 'obtra' and public.storage_pode_escrever(name))
  with check (bucket_id = 'obtra' and public.storage_pode_escrever(name));

drop policy if exists obtra_excluir on storage.objects;
create policy obtra_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'obtra' and public.storage_pode_escrever(name));
