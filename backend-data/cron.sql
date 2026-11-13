-- =============================================================
-- Tarea 5.2: Supabase lanza los workflows de GitHub Actions a la hora exacta.
-- El programador de GitHub (schedule) retrasa o se salta ejecuciones en repos gratuitos (el watcher de
-- cada 5 min arrancó 3 veces en 15 h). Una ejecución pedida por API (workflow_dispatch) empieza en
-- segundos. Los `schedule` de los .yml se quedan como respaldo.
--
-- Antes, una sola vez:
--   1. Database > Extensions: activar pg_cron y pg_net (o lo hace este script).
--   2. Guardar el token de GitHub en el Vault (SQL Editor, en una consulta aparte, sin compartirlo):
--        select vault.create_secret('github_pat_...', 'github_dispatch_token');
--      Token "fine-grained": solo el repositorio apf310/hoopmeter, permiso Actions = Read and write.
--      Para cambiarlo cuando caduque:
--        select vault.update_secret((select id from vault.secrets where name = 'github_dispatch_token'), 'github_pat_nuevo');
-- =============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Esquema privado: PostgREST no lo expone, nadie puede llamar a la función desde la web
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.dispatch_workflow(workflow text) returns bigint
language sql
security definer
set search_path = ''
as $$
    select net.http_post(
        url := 'https://api.github.com/repos/apf310/hoopmeter/actions/workflows/' || workflow || '/dispatches',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_dispatch_token'),
            'Accept', 'application/vnd.github+json',
            'X-GitHub-Api-Version', '2022-11-28',
            'User-Agent', 'hoopmeter-cron'
        ),
        body := '{"ref": "main"}'::jsonb
    );
$$;
revoke all on function private.dispatch_workflow(text) from public, anon, authenticated;

-- Mismas horas que los `schedule` de los workflows (UTC). Volver a ejecutar este script los actualiza.
select cron.schedule('hoopmeter-watcher',   '*/5 * * * *', $$select private.dispatch_workflow('live_game_watcher.yml')$$);
select cron.schedule('hoopmeter-contracts', '17 * * * *',  $$select private.dispatch_workflow('contracts_sync.yml')$$);
select cron.schedule('hoopmeter-daily',     '30 10 * * *', $$select private.dispatch_workflow('daily_stats_sync.yml')$$);

-- Comprobar (debería salir 204 en cada petición reciente):
--   select id, status_code, created from net._http_response order by created desc limit 5;
--   select jobname, schedule, active from cron.job;
