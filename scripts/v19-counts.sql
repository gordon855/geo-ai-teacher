\set ON_ERROR_STOP on
SELECT format('SELECT %L || ''|'' || count(*)::text FROM %I.%I;', tablename, schemaname, tablename)
FROM pg_tables WHERE schemaname='public'
AND tablename NOT IN ('v19_limits','v19_challenges')
AND tablename NOT LIKE '%session%' AND tablename NOT LIKE '%lease%' AND tablename NOT LIKE '%rate_limit%'
ORDER BY tablename
\gexec
