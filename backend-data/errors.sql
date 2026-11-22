-- =============================================================
-- Tarea 6.27: errores en producción (web, watcher y jobs), agrupados en una sola tabla.
-- Ejecutar una vez en Supabase > SQL Editor (volver a ejecutarlo no rompe nada).
--
-- La tabla es PRIVADA (RLS sin policy): nadie la lee con la anon key. La web (anon) y el backend
-- (service_role) solo llaman a report_app_error, que recorta, agrupa por huella y pone un tope diario
-- (la anon key es pública). Nunca IP, cabeceras ni URL con parámetros. check_errors.py (job diario)
-- marca los nuevos como avisados y hace fallar el job para que GitHub mande el email.
-- Se borran solos a los 30 días sin repetirse.
-- =============================================================

create table if not exists public.app_errors (
    id          text primary key,              -- huella: md5(fuente | mensaje | ruta)
    source      text not null,                 -- web-client · web-server · watcher · boxscores · standings · ...
    message     text not null,                 -- ya normalizado (ids largos como "N")
    stack       text,                          -- la última pila vista
    path        text,                          -- ruta sin parámetros ("/games/:id") o contexto del backend
    digest      text,                          -- digest de Next (une el aviso del navegador con el del servidor)
    agent       text,                          -- "Chrome · Android", "App Android"... nunca el user agent entero
    count       integer not null default 1,
    first_seen  timestamptz not null default now(),
    last_seen   timestamptz not null default now(),
    notified_at timestamptz                    -- último aviso por email (NULL = nunca)
);

create index if not exists app_errors_last_seen on public.app_errors (last_seen);

alter table public.app_errors enable row level security;  -- sin policy: solo el backend (service_role) la lee

create or replace function public.report_app_error(
    p_source text, p_message text, p_stack text default null, p_path text default null,
    p_digest text default null, p_agent text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_id text;
begin
    if p_source is null or p_source !~ '^[a-z0-9_-]{2,40}$' or p_message is null or btrim(p_message) = '' then
        return;
    end if;
    -- Con la anon key (la web) solo se admiten las dos fuentes de la web
    if coalesce((select auth.role()), '') <> 'service_role' and p_source not in ('web-client', 'web-server') then
        return;
    end if;

    p_message := left(btrim(p_message), 500);
    p_stack := left(p_stack, 4000);
    p_path := left(p_path, 200);
    p_digest := left(p_digest, 64);
    p_agent := left(p_agent, 40);
    v_id := md5(p_source || '|' || p_message || '|' || coalesce(p_path, ''));

    update public.app_errors
       set count = count + 1,
           last_seen = now(),
           stack = coalesce(p_stack, stack),
           digest = coalesce(p_digest, digest),
           agent = coalesce(p_agent, agent)
     where id = v_id;
    if found then
        return;
    end if;

    -- Tope: como mucho 200 errores distintos nuevos al día (nadie puede llenar la tabla con la anon key)
    if (select count(*) from public.app_errors where first_seen > now() - interval '1 day') >= 200 then
        return;
    end if;
    delete from public.app_errors where last_seen < now() - interval '30 days';

    insert into public.app_errors (id, source, message, stack, path, digest, agent)
    values (v_id, p_source, p_message, p_stack, p_path, p_digest, p_agent)
    on conflict (id) do update set count = public.app_errors.count + 1, last_seen = now();
end;
$$;

revoke all on function public.report_app_error(text, text, text, text, text, text) from public;
grant execute on function public.report_app_error(text, text, text, text, text, text) to anon, authenticated, service_role;
