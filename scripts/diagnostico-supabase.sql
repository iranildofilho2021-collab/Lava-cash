-- SOMENTE LEITURA. Não altera dados, permissões, tabelas ou configuração.
-- Revisar resultados antes de elaborar qualquer migração.
BEGIN READ ONLY;
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('despesas','receitas','lavanderias','perfis','configuracoes')
ORDER BY table_name, ordinal_position;

SELECT c.relname AS tabela, c.relrowsecurity AS rls_ativa, c.relforcerowsecurity AS rls_forcada
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('despesas','receitas','lavanderias','perfis','configuracoes');

SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public'
  AND tablename IN ('despesas','receitas','lavanderias','perfis','configuracoes')
ORDER BY tablename, policyname;

SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('despesas','receitas')
ORDER BY tablename, indexname;

SELECT c.relname AS tabela, t.tgname AS gatilho, pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('despesas','receitas') AND NOT t.tgisinternal;

SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name IN ('despesas','receitas','lavanderias','perfis')
ORDER BY table_name, grantee, privilege_type;
COMMIT;
