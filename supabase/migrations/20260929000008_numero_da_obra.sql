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
