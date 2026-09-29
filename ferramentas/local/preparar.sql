-- ============================================================================
-- Ajustes do ambiente LOCAL, aplicados depois das migrações e da carga demo.
-- Não vai para produção.
-- ============================================================================

-- O master da demonstração, pelo mesmo caminho do instalador (SQL sem JWT).
update public.configuracao set master_email = 'master@obtra.app';
do $$
begin
  if not exists (select 1 from auth.users where email = 'master@obtra.app') then
    perform public.admin_criar_usuario('master@obtra.app', 'obtra123', 'Master do Obtra', 'master', null);
  end if;
end $$;

alter role anon set statement_timeout = '10s';
alter role authenticated set statement_timeout = '30s';

do $$
declare n int;
begin
  select count(*) into n from public.perfis
   where email in ('master@obtra.app', 'admin@construtoraaurora.com.br', 'engenheiro@construtoraaurora.com.br',
                   'cliente@exemplo.com', 'admin@betaengenharia.com.br');
  if n <> 5 then
    raise exception 'esperava os 5 usuários de demonstração, encontrei %', n;
  end if;
  raise notice 'usuarios locais prontos (senha obtra123)';
end $$;
