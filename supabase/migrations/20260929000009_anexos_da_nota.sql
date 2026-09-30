-- ============================================================================
-- Anexos da nota de compra: o PDF e a foto da nota, vinculados à própria nota.
-- ----------------------------------------------------------------------------
-- Os arquivos são registros de `documentos` (visivel_cliente = false): entram na
-- cota da empresa, passam pelas mesmas políticas do Storage e o cliente nunca os
-- enxerga — como as notas, são internos da construtora. Excluir o documento
-- solta o vínculo (set null). Idempotente.
-- ============================================================================
alter table public.relatorio_notas_compras
  add column if not exists pdf_documento_id  uuid references public.documentos (id) on delete set null,
  add column if not exists foto_documento_id uuid references public.documentos (id) on delete set null;

create index if not exists relatorio_notas_compras_pdf_idx  on public.relatorio_notas_compras (pdf_documento_id);
create index if not exists relatorio_notas_compras_foto_idx on public.relatorio_notas_compras (foto_documento_id);
