-- Obtra — conferência depois da instalação. Deve mostrar tudo "ok".
select 'tabelas' as item,
       case when count(*) >= 19 then 'ok' else 'FALTANDO' end as situacao,
       count(*)::text as detalhe
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('empresas','perfis','configuracao','obras','obra_clientes','relatorios',
     'relatorio_mao_obra','relatorio_equipamentos','relatorio_atividades','relatorio_ocorrencias',
     'relatorio_materiais','relatorio_comentarios','relatorio_notas_compras','fotos','documentos',
     'funcoes','colaboradores','materiais','equipamentos','historico')
union all
select 'bucket obtra', case when count(*) = 1 then 'ok' else 'FALTANDO' end, coalesce(max(public::text), '-')
  from storage.buckets where id = 'obtra'
union all
select 'usuário master', case when count(*) >= 1 then 'ok' else 'crie com o arquivo 2' end, coalesce(max(email), '-')
  from perfis where papel = 'master';
