-- =============================================================
-- Tarea 7.7: caché compartida y tope diario de las evaluaciones del GM con IA.
-- Ejecutar una vez en Supabase > SQL Editor (volver a ejecutarlo no rompe nada ni cambia la clave).
--
-- En Vercel la caché de Next no se conserva entre visitas: el mismo traspaso llamaba a Gemini cada vez. Aquí se guarda
-- tres días y se cuentan las evaluaciones nuevas de cada día (hora de España) para poner un tope global.
--
-- Las tablas son PRIVADAS (RLS sin policy). La web solo llama a las dos funciones, y con una clave: la anon key es
-- pública y, sin ella, cualquiera podría guardar una evaluación falsa o gastar el tope del día. Nunca se guarda quién
-- pide la evaluación (ni IP ni nada parecido).
--
-- Después de ejecutarlo, copiar la clave a Vercel (Settings > Environment Variables > GM_DB_SECRET, marcada como
-- "Sensitive") y volver a publicar. Se ve con:
--   select decrypted_secret from vault.decrypted_secrets where name = 'gm_secret';
-- Sin esa variable la web funciona igual, pero cada instancia lleva su propia caché y su propia cuenta.
-- =============================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- La clave se crea una sola vez y vive en el Vault
do $$
begin
    if not exists (select 1 from vault.secrets where name = 'gm_secret') then
        perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'gm_secret');
    end if;
end;
$$;

create table if not exists public.gm_evaluations (
    id          text primary key,                    -- sha256 del traspaso en su forma canónica
    evaluation  jsonb not null,
    created_at  timestamptz not null default now()
);

create table if not exists public.gm_usage (
    day         date primary key,                    -- día de España
    evaluations integer not null default 0           -- evaluaciones nuevas (las que llaman a Gemini)
);

alter table public.gm_evaluations enable row level security;  -- sin policy: nadie las lee ni escribe directamente
alter table public.gm_usage enable row level security;

create or replace function private.gm_check_secret(p_secret text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_secret is null or not exists (
        select 1 from vault.decrypted_secrets where name = 'gm_secret' and decrypted_secret = p_secret
    ) then
        raise exception 'Clave no válida';
    end if;
end;
$$;
revoke all on function private.gm_check_secret(text) from public, anon, authenticated;

-- La evaluación guardada ({evaluation}) o, si no la hay, si queda cupo hoy ({allowed}): en ese caso ya cuenta una más
create or replace function public.gm_evaluation_start(p_secret text, p_id text, p_daily_limit integer) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_evaluation jsonb;
    v_count integer;
begin
    perform private.gm_check_secret(p_secret);

    select e.evaluation into v_evaluation
      from public.gm_evaluations e
     where e.id = p_id and e.created_at > now() - interval '3 days';
    if found then
        return jsonb_build_object('evaluation', v_evaluation);
    end if;

    if coalesce(p_daily_limit, 0) < 1 then
        return jsonb_build_object('allowed', false);
    end if;
    insert into public.gm_usage as u (day, evaluations)
    values ((now() at time zone 'Europe/Madrid')::date, 1)
    on conflict (day) do update set evaluations = u.evaluations + 1 where u.evaluations < p_daily_limit
    returning u.evaluations into v_count;
    return jsonb_build_object('allowed', v_count is not null);
end;
$$;

create or replace function public.gm_evaluation_save(p_secret text, p_id text, p_evaluation jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform private.gm_check_secret(p_secret);
    if p_id is null or p_id !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_evaluation -> 'teams') is distinct from 'array' or length(p_evaluation::text) > 20000 then
        raise exception 'Evaluación no válida';
    end if;

    delete from public.gm_evaluations where created_at < now() - interval '3 days';
    delete from public.gm_usage where day < current_date - 60;
    insert into public.gm_evaluations (id, evaluation)
    values (p_id, p_evaluation)
    on conflict (id) do update set evaluation = excluded.evaluation, created_at = now();
end;
$$;

revoke all on function public.gm_evaluation_start(text, text, integer) from public;
revoke all on function public.gm_evaluation_save(text, text, jsonb) from public;
grant execute on function public.gm_evaluation_start(text, text, integer) to anon, authenticated;
grant execute on function public.gm_evaluation_save(text, text, jsonb) to anon, authenticated;

-- Uso de los últimos días:
--   select * from public.gm_usage order by day desc limit 14;
