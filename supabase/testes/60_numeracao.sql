-- ============================================================================
-- Obtra — numeração automática (migração 0008 e gatilho de relatorios):
--   obras: número sequencial por empresa + código OB-001 sem ninguém digitar;
--   RDOs: número sequencial por obra (RD-1, RD-2…), independente entre obras.
-- Usa os utilitários de 10_rls.sql (schema `teste`).
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

do $$
declare
  G uuid := '60000000-0000-4000-8000-00000000006a';
  H uuid := '60000000-0000-4000-8000-00000000006b';
  o1 uuid; o2 uuid; o3 uuid; oh uuid;
  r uuid;
begin
  perform teste.sair();
  insert into empresas (id, nome) values (G, 'Numera G'), (H, 'Numera H');
  perform admin_criar_usuario('g.admin@numera.obtra', 'segredo1', 'G Admin', 'admin', G);
  perform admin_criar_usuario('g.colab@numera.obtra', 'segredo1', 'G Colab', 'colaborador', G);

  -- obras criadas pelo admin, pela API, sem código
  perform teste.vestir('g.admin@numera.obtra');
  insert into obras (empresa_id, nome) values (G, 'G Primeira') returning id into o1;
  insert into obras (empresa_id, nome, codigo) values (G, 'G Segunda', '') returning id into o2;
  insert into obras (empresa_id, nome, codigo) values (G, 'G Terceira', 'CASA-7') returning id into o3;
  perform teste.sair();
  insert into obras (empresa_id, nome) values (H, 'H Primeira') returning id into oh;

  perform teste.conferir('1ª obra da empresa recebe número 1 e código OB-001',
    (select numero = 1 and codigo = 'OB-001' from obras where id = o1));
  perform teste.conferir('código vazio também vira automático (OB-002)',
    (select numero = 2 and codigo = 'OB-002' from obras where id = o2));
  perform teste.conferir('código digitado é respeitado, número segue a sequência',
    (select numero = 3 and codigo = 'CASA-7' from obras where id = o3));
  perform teste.conferir('outra empresa começa do 1',
    (select numero = 1 and codigo = 'OB-001' from obras where id = oh));

  perform teste.vestir('g.admin@numera.obtra');
  update obras set numero = 99, codigo = '' where id = o1;
  perform teste.sair();
  perform teste.conferir('número da obra não muda e código não fica vazio',
    (select numero = 1 and codigo = 'OB-001' from obras where id = o1));

  delete from obras where id = o3;
  insert into obras (empresa_id, nome) values (G, 'G Quarta') returning id into o3;
  perform teste.conferir('próxima obra continua do maior número (OB-003 reaproveitado só se era o último)',
    (select numero = 3 and codigo = 'OB-003' from obras where id = o3));

  -- RDOs: numeração por obra, feita pelo colaborador
  perform teste.vestir('g.colab@numera.obtra');
  perform criar_relatorio(o1, current_date - 2, false);
  perform criar_relatorio(o1, current_date - 1, true);
  perform criar_relatorio(o2, current_date, false);
  insert into relatorios (obra_id, numero, data) values (o1, 500, current_date) returning id into r;
  perform teste.sair();

  perform teste.conferir('RDOs da obra 1 numerados 1, 2, 3 (número enviado é ignorado)',
    (select array_agg(numero order by numero) = array[1,2,3] from relatorios where obra_id = o1));
  perform teste.conferir('RDO da obra 2 começa do 1',
    (select array_agg(numero) = array[1] from relatorios where obra_id = o2));
end $$;

select 'numeração: ok' as resultado;
