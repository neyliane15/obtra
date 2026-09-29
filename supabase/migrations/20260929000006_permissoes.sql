-- ============================================================================
-- Obtra — 0006: privilégios (GRANT/REVOKE).
-- ----------------------------------------------------------------------------
-- O Supabase dá, por privilégio padrão, SELECT/INSERT/... e EXECUTE ao `anon`
-- em tudo que nasce em `public`. A RLS barraria as linhas, mas as RPCs
-- SECURITY DEFINER não passam por RLS — então o anon perde EXECUTE em tudo e
-- só `authenticated` recebe o que a API usa.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- Nada de API para a configuração além da leitura (master, pela RLS).
revoke insert, update, delete on public.configuracao from authenticated;
-- Histórico: só os gatilhos (security definer) escrevem.
revoke insert, update, delete, truncate on public.historico from authenticated;

-- Funções: começa tirando de todo mundo (PUBLIC e anon), exceto as de extensão.
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
    execute format('revoke all on function %s from public, anon', f.assinatura);
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
  public.empresa_da_obra(uuid),
  public.pode_ver_obra(uuid),
  public.pode_ver_relatorio(uuid),
  public.pode_editar_relatorio(uuid),
  public.empresa_do_relatorio(uuid),
  public.storage_pode_ler(text),
  public.storage_pode_escrever(text),
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
