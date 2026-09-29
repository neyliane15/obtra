-- ============================================================================
-- Obtra — ajustes da entrega (migração 0007):
--   1. notas de compras são internas: o cliente não as lê nem pelo banco;
--   2. a pasta de uma obra excluída pode ser limpa pelo admin (sem órfãos).
-- Usa os utilitários de 10_rls.sql (schema `teste`).
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

do $$
declare
  E   uuid := 'e5000000-0000-4000-8000-00000000000e';
  F   uuid := 'f5000000-0000-4000-8000-00000000000f';
  OE1 uuid := 'e5000000-0000-4000-8000-0000000000e1';
  OE2 uuid := 'e5000000-0000-4000-8000-0000000000e2';
  OF1 uuid := 'f5000000-0000-4000-8000-0000000000f1';
  RE1 uuid := 'e5000000-0000-4000-8000-000000000e01';
  RE2 uuid := 'e5000000-0000-4000-8000-000000000e02';
begin
  perform teste.sair();
  insert into empresas (id, nome) values (E, 'Entrega E'), (F, 'Entrega F');
  insert into obras (id, empresa_id, nome) values (OE1, E, 'E Um'), (OE2, E, 'E Dois'), (OF1, F, 'F Um');
  perform admin_criar_usuario('e.admin@entrega.obtra',   'segredo1', 'E Admin',   'admin',       E);
  perform admin_criar_usuario('e.colab@entrega.obtra',   'segredo1', 'E Colab',   'colaborador', E);
  perform admin_criar_usuario('e.cliente@entrega.obtra', 'segredo1', 'E Cliente', 'cliente',     E, array[OE1]);
  perform admin_criar_usuario('f.admin@entrega.obtra',   'segredo1', 'F Admin',   'admin',       F);
  perform admin_criar_usuario('e.master@entrega.obtra',  'segredo1', 'E Master',  'master',      null);

  insert into relatorios (id, obra_id, numero, data, status) values
    (RE1, OE1, 0, current_date - 1, 'aprovado'),
    (RE2, OE1, 0, current_date,     'revisar');
  insert into relatorio_mao_obra (relatorio_id, funcao, quantidade) values (RE1, 'Pedreiro', 2), (RE2, 'Servente', 1);
  insert into relatorio_notas_compras (relatorio_id, fornecedor, numero_nota, valor, descricao) values
    (RE1, 'Depósito Central', '000123', 1530.50, 'Cimento'),
    (RE1, 'Ferragens Silva',  '000124',  320.00, 'Arame'),
    (RE2, 'Depósito Central', '000130',   99.90, 'Areia');

  insert into storage.objects (bucket_id, name, metadata) values
    ('obtra', E::text || '/' || OE1::text || '/fotos/a.webp',   '{"size": 10, "mimetype": "image/webp"}'),
    ('obtra', E::text || '/' || OE2::text || '/fotos/b.webp',   '{"size": 10, "mimetype": "image/webp"}'),
    ('obtra', E::text || '/' || OE2::text || '/fotos/b_t.webp', '{"size": 1,  "mimetype": "image/webp"}'),
    ('obtra', E::text || '/' || OE2::text || '/docs/c.pdf',     '{"size": 50, "mimetype": "application/pdf"}'),
    ('obtra', F::text || '/' || OF1::text || '/fotos/f.webp',   '{"size": 10, "mimetype": "image/webp"}'),
    ('obtra', F::text || '/f5000000-0000-4000-8000-0000000000ff/fotos/orfa.webp', '{"size": 10, "mimetype": "image/webp"}');
end $$;

-- ------------------------------------------------ 1. notas de compras ------
do $$
declare
  RE1 text := 'e5000000-0000-4000-8000-000000000e01';
  RE2 text := 'e5000000-0000-4000-8000-000000000e02';
begin
  perform teste.vestir('e.cliente@entrega.obtra');
  perform teste.conferir('cliente vê o RDO aprovado da obra dele',
    teste.conta(format('select count(*) from relatorios where id = %L', RE1)) = 1);
  perform teste.conferir('... e os itens dele (mão de obra)',
    teste.conta(format('select count(*) from relatorio_mao_obra where relatorio_id = %L', RE1)) = 1);
  perform teste.conferir('... mas NÃO as notas de compras (valores internos)',
    teste.conta(format('select count(*) from relatorio_notas_compras where relatorio_id = %L', RE1)) = 0);
  perform teste.conferir('... nem somando valores de qualquer relatório',
    teste.conta('select count(*) from relatorio_notas_compras') = 0);
  perform teste.conferir('... e o select não dá erro (o embed do PostgREST vem vazio)',
    teste.erro(format('select * from relatorio_notas_compras where relatorio_id = %L', RE1)) is null);
  perform teste.conferir('cliente não grava nota',
    teste.erro(format($q$insert into relatorio_notas_compras (relatorio_id, fornecedor) values (%L, 'x')$q$, RE1)) is not null);
  perform teste.conferir('cliente não altera nota (0 linhas)',
    teste.linhas(format($q$update relatorio_notas_compras set valor = 0 where relatorio_id = %L$q$, RE1)) = 0);

  perform teste.vestir('e.colab@entrega.obtra');
  perform teste.conferir('colaborador vê as notas do aprovado e do pendente',
    teste.conta(format('select count(*) from relatorio_notas_compras where relatorio_id in (%L, %L)', RE1, RE2)) = 3);
  perform teste.conferir('colaborador não altera nota de RDO aprovado (0 linhas)',
    teste.linhas(format($q$update relatorio_notas_compras set valor = 0 where relatorio_id = %L$q$, RE1)) = 0);

  perform teste.vestir('e.admin@entrega.obtra');
  perform teste.conferir('admin vê e edita as notas do aprovado',
    teste.conta(format('select count(*) from relatorio_notas_compras where relatorio_id = %L', RE1)) = 2
    and teste.linhas(format($q$update relatorio_notas_compras set descricao = descricao where relatorio_id = %L$q$, RE1)) = 2);

  perform teste.vestir('f.admin@entrega.obtra');
  perform teste.conferir('admin de outra empresa não vê as notas',
    teste.conta(format('select count(*) from relatorio_notas_compras where relatorio_id in (%L, %L)', RE1, RE2)) = 0);

  perform teste.vestir('e.master@entrega.obtra');
  perform teste.conferir('master vê as notas',
    teste.conta(format('select count(*) from relatorio_notas_compras where relatorio_id in (%L, %L)', RE1, RE2)) = 3);

  -- cliente desativado / sem vínculo continuam sem ver
  perform teste.sair();
  update perfis set ativo = false where email = 'e.colab@entrega.obtra';
  perform teste.vestir('e.colab@entrega.obtra');
  perform teste.conferir('colaborador desativado não vê notas',
    teste.conta('select count(*) from relatorio_notas_compras') = 0);
  perform teste.sair();
  update perfis set ativo = true where email = 'e.colab@entrega.obtra';
end $$;

-- -------------------------------------- 2. pasta de obra excluída ---------
do $$
declare
  E    text := 'e5000000-0000-4000-8000-00000000000e';
  F    text := 'f5000000-0000-4000-8000-00000000000f';
  OE1  text := 'e5000000-0000-4000-8000-0000000000e1';
  OE2  text := 'e5000000-0000-4000-8000-0000000000e2';
  OF1  text := 'f5000000-0000-4000-8000-0000000000f1';
  pasta text := E || '/' || OE2 || '/';
begin
  perform teste.vestir('e.admin@entrega.obtra');
  perform teste.conferir('admin exclui a obra E Dois',
    teste.linhas(format('delete from obras where id = %L', OE2)) = 1);

  perform teste.vestir('e.colab@entrega.obtra');
  perform teste.conferir('colaborador não apaga a pasta da obra excluída (0 linhas)',
    teste.linhas(format($q$delete from storage.objects where bucket_id = 'obtra' and name like %L$q$, pasta || '%')) = 0);
  perform teste.conferir('... nem grava nela',
    teste.erro(format($q$insert into storage.objects (bucket_id, name) values ('obtra', %L)$q$, pasta || 'fotos/nova.webp')) is not null);

  perform teste.vestir('f.admin@entrega.obtra');
  perform teste.conferir('admin de outra empresa não apaga a pasta (0 linhas)',
    teste.linhas(format($q$delete from storage.objects where bucket_id = 'obtra' and name like %L$q$, pasta || '%')) = 0);

  perform teste.vestir('e.admin@entrega.obtra');
  perform teste.conferir('admin não grava na pasta da obra excluída',
    teste.erro(format($q$insert into storage.objects (bucket_id, name) values ('obtra', %L)$q$, pasta || 'fotos/nova.webp')) is not null);
  perform teste.conferir('admin apaga todos os arquivos da obra excluída (3 linhas)',
    teste.linhas(format($q$delete from storage.objects where bucket_id = 'obtra' and name like %L$q$, pasta || '%')) = 3);
  perform teste.conferir('... sem tocar na pasta da obra que existe',
    teste.conta(format($q$select count(*) from storage.objects where name like %L$q$, E || '/' || OE1 || '/%')) = 1);
  perform teste.conferir('admin não apaga a pasta órfã de OUTRA empresa (0 linhas)',
    teste.linhas(format($q$delete from storage.objects where bucket_id = 'obtra' and name like %L$q$, F || '/%')) = 0);

  perform teste.sair();
  perform teste.conferir('arquivos de F intactos',
    (select count(*) from storage.objects where name like F || '/%') = 2
    and (select count(*) from storage.objects where name like F || '/' || OF1 || '/%') = 1);

  perform teste.vestir('e.master@entrega.obtra');
  perform teste.conferir('master limpa a pasta órfã de qualquer empresa',
    teste.linhas(format($q$delete from storage.objects where bucket_id = 'obtra' and name like %L$q$,
                        F || '/f5000000-0000-4000-8000-0000000000ff/%')) = 1);
  perform teste.sair();
end $$;
