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
