-- =============================================================
-- Tarea 6.14: suscripciones del aviso matinal sin spoilers (web push y Android).
-- Ejecutar una vez en Supabase > SQL Editor (volver a ejecutarlo no rompe nada).
--
-- La tabla es PRIVADA (RLS sin policy): la web nunca la lee. Para darse de alta o de baja la web llama
-- a dos funciones que validan lo que reciben; solo notify_morning.py (service_role) lee y envía.
-- Solo se guardan ids de equipos favoritos y la preferencia del aviso; nunca el nivel de spoilers.
-- =============================================================

create table if not exists public.push_subscriptions (
    id            text primary key,                  -- web: endpoint del servicio de push · android: token de FCM
    platform      text not null check (platform in ('web', 'android')),
    keys          jsonb,                             -- web: {p256dh, auth} · android: null
    hour          smallint not null check (hour in (8, 9, 10)),  -- hora de España
    with_scores   boolean not null default false,    -- false = "sin notas" (por defecto)
    team_ids      integer[] not null default '{}',   -- favoritos: el aviso nombra su partido
    last_sent_day date,                              -- última jornada avisada (nunca dos avisos el mismo día)
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;  -- sin policy: solo el backend (service_role)

create or replace function public.push_subscribe(
    p_id text, p_platform text, p_keys jsonb, p_hour integer, p_with_scores boolean, p_team_ids integer[]
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_platform = 'web' then
        -- Solo servicios de push de navegadores conocidos (igual que WEB_PUSH_HOSTS en notify_morning.py)
        if length(p_id) not between 20 and 1000
           or p_id ~ '\s'
           or p_id !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)/'
           or jsonb_typeof(p_keys -> 'p256dh') is distinct from 'string'
           or jsonb_typeof(p_keys -> 'auth') is distinct from 'string'
           or length(p_keys ->> 'p256dh') > 200
           or length(p_keys ->> 'auth') > 100 then
            raise exception 'Suscripción web no válida';
        end if;
        p_keys := jsonb_build_object('p256dh', p_keys ->> 'p256dh', 'auth', p_keys ->> 'auth');
    elsif p_platform = 'android' then
        if length(p_id) not between 20 and 400 or p_id !~ '^[A-Za-z0-9_:-]+$' then
            raise exception 'Token de Android no válido';
        end if;
        p_keys := null;
    else
        raise exception 'Plataforma no válida';
    end if;

    if p_hour is null or p_hour not in (8, 9, 10) then
        raise exception 'Hora no válida';
    end if;
    if coalesce(cardinality(p_team_ids), 0) > 30 then
        raise exception 'Demasiados favoritos';
    end if;

    insert into public.push_subscriptions (id, platform, keys, hour, with_scores, team_ids)
    values (p_id, p_platform, p_keys, p_hour, coalesce(p_with_scores, false), coalesce(p_team_ids, '{}'))
    on conflict (id) do update
        set keys = excluded.keys,
            hour = excluded.hour,
            with_scores = excluded.with_scores,
            team_ids = excluded.team_ids,
            updated_at = now();  -- last_sent_day se mantiene: cambiar la hora no repite el aviso de hoy
end;
$$;

create or replace function public.push_unsubscribe(p_id text) returns void
language sql
security definer
set search_path = ''
as $$
    delete from public.push_subscriptions where id = p_id;
$$;

revoke all on function public.push_subscribe(text, text, jsonb, integer, boolean, integer[]) from public;
revoke all on function public.push_unsubscribe(text) from public;
grant execute on function public.push_subscribe(text, text, jsonb, integer, boolean, integer[]) to anon, authenticated;
grant execute on function public.push_unsubscribe(text) to anon, authenticated;
