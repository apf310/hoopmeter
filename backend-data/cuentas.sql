-- =============================================================
-- Tarea 8.5: cuentas (Supabase Auth con Google): alias, favoritos y resultados de los juegos.
-- Ejecutar en Supabase > SQL Editor DESPUÉS de gm.sql y juegos.sql (usa `private.gm_check_secret` y
-- `private.game_par_stats`). Volver a ejecutarlo no rompe nada.
--
-- Quién es cada uno lo dice Supabase Auth (`auth.users`: el id y el email que da Google). Aquí solo va lo de la app: el
-- alias, los favoritos y los resultados. Las dos tablas son PRIVADAS (RLS sin policy) y las funciones piden la clave del
-- servidor (GM_DB_SECRET en Vercel): la web comprueba antes el token de la sesión y pasa el id del usuario. Con la anon
-- key, que es pública, nadie puede leer ni escribir una cuenta.
--
-- Los puntos nunca los dice el cliente: cada resultado llega con el recibo que firmó el servidor del reto al acabar la
-- partida (`lib/game-receipt.ts`), la web lo comprueba y solo entonces llama a `account_claim`. Cada partida vale una vez
-- en todo Hoopmeter (`run_id` único) y cada reto cuenta una vez al día por cuenta (el primero que llega).
--
-- Borrar la cuenta (`account_delete`) borra el usuario de Auth y, con él, todo lo suyo. Quien entra con Google y no llega
-- a elegir alias no tiene cuenta: lo que dio Google se borra a los 7 días.
-- El nivel de spoilers nunca se guarda aquí.
-- =============================================================

create table if not exists public.accounts (
    user_id          uuid primary key references auth.users (id) on delete cascade,
    alias            text not null,                  -- como lo escribió ("Triple_23")
    alias_key        text not null unique,           -- para que no haya dos iguales: minúsculas y sin ñ (`aliasKey`)
    alias_changed_at timestamptz,                    -- último cambio (el primero, al crearla, no cuenta)
    favorites        jsonb not null default '{"teams": [], "players": []}'::jsonb,
    favorites_at     bigint not null default 0,      -- ms del dispositivo que los cambió: gana el cambio más reciente
    created_at       timestamptz not null default now(),
    constraint accounts_alias_format check (alias ~ '^[A-Za-zÑñ0-9_]{3,16}$'),
    constraint accounts_alias_key_format check (alias_key ~ '^[a-z0-9_]{3,16}$')
);

create table if not exists public.account_results (
    seq        bigint generated always as identity,  -- orden en que llegaron (dentro de un día, el de juego)
    user_id    uuid not null references auth.users (id) on delete cascade,
    game       text not null check (game in ('mas-o-menos', 'adivina', 'carrera')),
    day        date not null,                        -- día del reto (España, cambia a las 7:00)
    points     smallint not null check (points between 0 and 60),
    total_ms   integer not null default 0 check (total_ms >= 0),   -- tiempo de respuesta (desempate, Tarea 8.6)
    rows       text[] not null default '{}',         -- cuadros para compartir ("oocx"), nunca la solución
    run_id     uuid not null unique,                 -- la partida del recibo: vale una sola vez
    par_n      integer,                              -- el par del día al apuntarlo: partidas acabadas…
    par_median real,                                 -- …y su mediana de puntos (`parOf` en lib/elo.ts)
    claimed_at timestamptz not null default now(),
    primary key (user_id, game, day)
);

alter table public.accounts enable row level security;         -- sin policy: nadie las lee ni escribe directamente
alter table public.account_results enable row level security;

-- Los resultados de una cuenta, por días y en el orden en que llegaron
create or replace function private.account_results_json(p_user uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(jsonb_agg(jsonb_build_object(
               'day', r.day, 'game', r.game, 'points', r.points, 'rows', to_jsonb(r.rows),
               'par_n', r.par_n, 'par_median', r.par_median
           ) order by r.day, r.seq), '[]'::jsonb)
      from public.account_results r
     where r.user_id = p_user;
$$;
revoke all on function private.account_results_json(uuid) from public, anon, authenticated;

-- La cuenta ({alias, alias_changed_at, created_at, favorites, favorites_at, results}) o null si aún no ha elegido alias
create or replace function public.account_get(p_secret text, p_user uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_account jsonb;
begin
    perform private.gm_check_secret(p_secret);
    select jsonb_build_object(
               'alias', a.alias, 'alias_changed_at', a.alias_changed_at, 'created_at', a.created_at,
               'favorites', a.favorites, 'favorites_at', a.favorites_at,
               'results', private.account_results_json(a.user_id)
           ) into v_account
      from public.accounts a
     where a.user_id = p_user;
    return v_account;
end;
$$;

-- Crea la cuenta con su alias (ya comprobado por la web: formato y palabras ofensivas). 'ok', 'taken' o 'exists'.
create or replace function public.account_create(p_secret text, p_user uuid, p_alias text, p_key text) returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform private.gm_check_secret(p_secret);
    if p_user is null or p_alias is null or p_alias !~ '^[A-Za-zÑñ0-9_]{3,16}$' or p_key is null or p_key !~ '^[a-z0-9_]{3,16}$' then
        raise exception 'Alias no válido';
    end if;

    -- Quien entró con Google y no eligió alias en una semana: fuera lo que dio Google
    delete from auth.users u
     where u.created_at < now() - interval '7 days'
       and u.id <> p_user
       and not exists (select 1 from public.accounts a where a.user_id = u.id);

    if exists (select 1 from public.accounts a where a.user_id = p_user) then
        return 'exists';
    end if;
    begin
        insert into public.accounts (user_id, alias, alias_key) values (p_user, p_alias, p_key);
    exception when unique_violation then
        if exists (select 1 from public.accounts a where a.user_id = p_user) then
            return 'exists';
        end if;
        return 'taken';
    end;
    return 'ok';
end;
$$;

-- Cambia el alias: una vez por semana (cambiar solo mayúsculas, siempre). {status: 'ok'|'same'|'taken'|'too-soon', next}
create or replace function public.account_rename(p_secret text, p_user uuid, p_alias text, p_key text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_account public.accounts;
begin
    perform private.gm_check_secret(p_secret);
    if p_alias is null or p_alias !~ '^[A-Za-zÑñ0-9_]{3,16}$' or p_key is null or p_key !~ '^[a-z0-9_]{3,16}$' then
        raise exception 'Alias no válido';
    end if;
    select * into v_account from public.accounts a where a.user_id = p_user for update;
    if not found then
        raise exception 'Sin cuenta';
    end if;
    if v_account.alias = p_alias then
        return jsonb_build_object('status', 'same');
    end if;
    if v_account.alias_key = p_key then
        update public.accounts set alias = p_alias where user_id = p_user;
        return jsonb_build_object('status', 'ok');
    end if;
    if v_account.alias_changed_at is not null and v_account.alias_changed_at > now() - interval '7 days' then
        return jsonb_build_object('status', 'too-soon', 'next', v_account.alias_changed_at + interval '7 days');
    end if;
    begin
        update public.accounts set alias = p_alias, alias_key = p_key, alias_changed_at = now() where user_id = p_user;
    exception when unique_violation then
        return jsonb_build_object('status', 'taken');
    end;
    return jsonb_build_object('status', 'ok');
end;
$$;

-- Apunta resultados con recibo ya comprobado por la web ([{game, day, points, total_ms, rows, run_id}], en el orden en que
-- se jugaron). Una partida ya apuntada (en esta cuenta o en otra) o un reto que ya tenía resultado ese día no cambian nada.
-- Cada uno se guarda con el par de su día en ese momento. Devuelve todos los resultados de la cuenta.
create or replace function public.account_claim(p_secret text, p_user uuid, p_results jsonb) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform private.gm_check_secret(p_secret);
    if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) > 500 or length(p_results::text) > 200000 then
        raise exception 'Resultados no válidos';
    end if;
    if not exists (select 1 from public.accounts a where a.user_id = p_user) then
        raise exception 'Sin cuenta';
    end if;

    insert into public.account_results (user_id, game, day, points, total_ms, rows, run_id, par_n, par_median)
        select p_user, x.game, x.day, x.points, x.total_ms, x.rows, x.run_id,
               (s.stats ->> 'n')::integer, (s.stats ->> 'median')::real
          from (
            select e.value ->> 'game' as game,
                   (e.value ->> 'day')::date as day,
                   (e.value ->> 'points')::smallint as points,
                   coalesce((e.value ->> 'total_ms')::integer, 0) as total_ms,
                   coalesce(array(select jsonb_array_elements_text(e.value -> 'rows')), '{}') as rows,
                   (e.value ->> 'run_id')::uuid as run_id,
                   e.ord
              from jsonb_array_elements(p_results) with ordinality as e(value, ord)
          ) x
          cross join lateral (select private.game_par_stats(x.game, x.day) as stats) s
         order by x.ord
        on conflict do nothing;

    return private.account_results_json(p_user);
end;
$$;

-- Guarda los favoritos si son más recientes que los de la cuenta. Devuelve los que valen: {favorites, favorites_at}.
create or replace function public.account_favorites(p_secret text, p_user uuid, p_favorites jsonb, p_at bigint) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_saved jsonb;
begin
    perform private.gm_check_secret(p_secret);
    if jsonb_typeof(p_favorites) is distinct from 'object' or length(p_favorites::text) > 20000 or p_at is null then
        raise exception 'Favoritos no válidos';
    end if;
    update public.accounts set favorites = p_favorites, favorites_at = p_at where user_id = p_user and favorites_at < p_at;
    select jsonb_build_object('favorites', a.favorites, 'favorites_at', a.favorites_at) into v_saved
      from public.accounts a
     where a.user_id = p_user;
    if v_saved is null then
        raise exception 'Sin cuenta';
    end if;
    return v_saved;
end;
$$;

-- Borra la cuenta: sus resultados, su alias, sus favoritos y el usuario de Auth (el id y el email de Google)
create or replace function public.account_delete(p_secret text, p_user uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform private.gm_check_secret(p_secret);
    delete from public.account_results where user_id = p_user;
    delete from public.accounts where user_id = p_user;
    delete from auth.users where id = p_user;
end;
$$;

revoke all on function public.account_get(text, uuid) from public;
revoke all on function public.account_create(text, uuid, text, text) from public;
revoke all on function public.account_rename(text, uuid, text, text) from public;
revoke all on function public.account_claim(text, uuid, jsonb) from public;
revoke all on function public.account_favorites(text, uuid, jsonb, bigint) from public;
revoke all on function public.account_delete(text, uuid) from public;
grant execute on function public.account_get(text, uuid) to anon, authenticated;
grant execute on function public.account_create(text, uuid, text, text) to anon, authenticated;
grant execute on function public.account_rename(text, uuid, text, text) to anon, authenticated;
grant execute on function public.account_claim(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.account_favorites(text, uuid, jsonb, bigint) to anon, authenticated;
grant execute on function public.account_delete(text, uuid) to anon, authenticated;

-- Cuentas y retos jugados:
--   select a.alias, a.created_at, count(r.*) as resultados, sum(r.points) as puntos
--     from public.accounts a left join public.account_results r on r.user_id = a.user_id
--    group by a.user_id order by a.created_at;
