-- =============================================================
-- Tareas 8.2-8.5: partidas de ¿Más o menos?, Adivina el jugador y Carrera oculta comprobadas en el servidor.
-- Ejecutar una vez en Supabase > SQL Editor, DESPUÉS de gm.sql (usa su clave `gm_secret` y `private.gm_check_secret`).
-- Volver a ejecutarlo no rompe nada.
--
-- Cada partida guarda sus preguntas con la solución, las respuestas y la hora a la que empezó a correr el reloj de la
-- pregunta en curso (en Adivina y Carrera oculta, el jugador del día y los que se han dicho): el cliente solo recibe la
-- solución al responder (en Adivina y Carrera oculta, al acabar). `game_run_advance` solo avanza si la
-- partida sigue en esa pregunta (compare-and-swap): reenviar una respuesta, o mandar dos a la vez desde dos pestañas,
-- nunca cuenta dos veces ni deja cambiarla.
--
-- La tabla es PRIVADA (RLS sin policy) y las funciones piden la clave del servidor (GM_DB_SECRET en Vercel): con la anon
-- key, que es pública, nadie puede crear ni avanzar partidas. No se guarda quién juega (ni IP ni nada parecido): sin
-- cuentas (hasta la Tarea 8.5) una partida es anónima, y se borra a los dos días.
-- Sin la variable, o si Supabase falla, la web lleva las partidas en la memoria de cada instancia.
-- =============================================================

create table if not exists public.game_runs (
    id          uuid primary key,
    game        text not null,                       -- 'mas-o-menos', 'adivina' o 'carrera'
    day         date not null,                       -- día del reto (España, cambia a las 7:00)
    step        smallint not null default 0,         -- preguntas ya contestadas
    state       jsonb not null,                      -- preguntas con su solución, respuestas y reloj (nunca sale tal cual)
    score       smallint not null default 0,         -- puntos (2 por acierto; en Adivina y Carrera oculta, 20 a la primera)
    total_ms    integer not null default 0,          -- tiempo de respuesta medido en el servidor (desempate, Tarea 8.6)
    created_at  timestamptz not null default now(),
    finished_at timestamptz
);

create index if not exists game_runs_created_at on public.game_runs (created_at);

alter table public.game_runs enable row level security;  -- sin policy: nadie la lee ni escribe directamente

-- El par de cada reto y día cuando ya se han borrado sus partidas (Tarea 8.5): cuántas acabaron y su mediana de puntos.
-- Solo totales del día: nada de nadie. Lo escribe `game_run_create` antes de borrar.
create table if not exists public.game_pars (
    game   text not null,
    day    date not null,
    n      integer not null,
    median real not null,
    primary key (game, day)
);

alter table public.game_pars enable row level security;  -- sin policy: nadie la lee ni escribe directamente

-- Partidas acabadas y mediana de puntos de un reto en un día: de las partidas si aún están, si no de `game_pars`
create or replace function private.game_par_stats(p_game text, p_day date) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_stats jsonb;
begin
    select jsonb_build_object('n', count(*), 'median', percentile_cont(0.5) within group (order by r.score)) into v_stats
      from public.game_runs r
     where r.game = p_game and r.day = p_day and r.finished_at is not null
    having count(*) > 0;
    if v_stats is null then
        select jsonb_build_object('n', p.n, 'median', p.median) into v_stats from public.game_pars p where p.game = p_game and p.day = p_day;
    end if;
    return v_stats;
end;
$$;
revoke all on function private.game_par_stats(text, date) from public, anon, authenticated;

create or replace function public.game_run_create(p_secret text, p_id uuid, p_game text, p_day date, p_state jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform private.gm_check_secret(p_secret);
    if p_game is null or p_game not in ('mas-o-menos', 'adivina', 'carrera') or p_day is null
       or jsonb_typeof(p_state -> 'answers') is distinct from 'array' or jsonb_array_length(p_state -> 'answers') <> 0
       or (p_game = 'mas-o-menos' and jsonb_typeof(p_state -> 'questions') is distinct from 'array')
       or length(p_state::text) > 40000 then
        raise exception 'Partida no válida';
    end if;

    -- Antes de borrar las partidas, el par de sus días (Tarea 8.5: el ELO de las cuentas lo necesita después).
    -- Las de un día se crean entre sus 7:00 y las 7:00 del siguiente: a partir de su segundo día ya no llegan más.
    insert into public.game_pars (game, day, n, median)
        select r.game, r.day, count(*), percentile_cont(0.5) within group (order by r.score)
          from public.game_runs r
         where r.day <= p_day - 2 and r.finished_at is not null
         group by r.game, r.day
        on conflict (game, day) do nothing;
    delete from public.game_runs where created_at < now() - interval '2 days';
    insert into public.game_runs (id, game, day, state) values (p_id, p_game, p_day, p_state);
end;
$$;

-- La partida ({game, step, state}) o null si no existe o es de hace más de un día
create or replace function public.game_run_get(p_secret text, p_id uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_run jsonb;
begin
    perform private.gm_check_secret(p_secret);
    select jsonb_build_object('game', r.game, 'step', r.step, 'state', r.state) into v_run
      from public.game_runs r
     where r.id = p_id and r.created_at > now() - interval '1 day';
    return v_run;
end;
$$;

-- Guarda la respuesta a la pregunta p_step solo si la partida sigue en ella; false = ya estaba contestada
create or replace function public.game_run_advance(
    p_secret text, p_id uuid, p_step integer, p_state jsonb, p_score integer, p_total_ms integer, p_finished boolean
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform private.gm_check_secret(p_secret);
    if jsonb_typeof(p_state -> 'answers') is distinct from 'array' or jsonb_array_length(p_state -> 'answers') <> p_step + 1
       or length(p_state::text) > 40000 then
        raise exception 'Respuesta no válida';
    end if;

    update public.game_runs
       set step = p_step + 1,
           state = p_state,
           score = p_score,
           total_ms = p_total_ms,
           finished_at = case when p_finished then now() end
     where id = p_id and step = p_step and finished_at is null;
    return found;
end;
$$;

revoke all on function public.game_run_create(text, uuid, text, date, jsonb) from public;
revoke all on function public.game_run_get(text, uuid) from public;
revoke all on function public.game_run_advance(text, uuid, integer, jsonb, integer, integer, boolean) from public;
grant execute on function public.game_run_create(text, uuid, text, date, jsonb) to anon, authenticated;
grant execute on function public.game_run_get(text, uuid) to anon, authenticated;
grant execute on function public.game_run_advance(text, uuid, integer, jsonb, integer, integer, boolean) to anon, authenticated;

-- =============================================================
-- Tareas 8.3 y 8.4: la foto del día de Adivina el jugador y de Carrera oculta (iguales para todos).
-- La hace la web con el primer jugador del día: el jugador elegido, su radar o su carrera y las pistas de todos los que
-- se pueden decir, tal como estaban a esa hora (el job diario de las 11:30 no las cambia a media mañana). Si dos instancias la
-- hacen a la vez, vale la primera. A la semana se borra la foto y solo queda el jugador, para no repetirlo en dos meses.
-- =============================================================

create table if not exists public.game_days (
    game       text not null,                        -- 'adivina' o 'carrera'
    day        date not null,                        -- día del reto (España, cambia a las 7:00)
    target     integer not null,                     -- el jugador del día (nunca sale de aquí hasta acabar la partida)
    state      jsonb,                                -- la foto del día; null pasada una semana
    created_at timestamptz not null default now(),
    primary key (game, day)
);

alter table public.game_days enable row level security;  -- sin policy: nadie la lee ni escribe directamente

-- La foto de ese día o null
create or replace function public.game_day_get(p_secret text, p_game text, p_day date) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_state jsonb;
begin
    perform private.gm_check_secret(p_secret);
    select d.state into v_state from public.game_days d where d.game = p_game and d.day = p_day;
    return v_state;
end;
$$;

-- Guarda la foto si aún no había otra y devuelve la que vale (la primera)
create or replace function public.game_day_create(p_secret text, p_game text, p_day date, p_target integer, p_state jsonb) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_state jsonb;
begin
    perform private.gm_check_secret(p_secret);
    if p_game is null or p_game not in ('adivina', 'carrera') or p_day is null or p_target is null
       or jsonb_typeof(p_state -> 'target') is distinct from 'number' or (p_state ->> 'target')::integer is distinct from p_target
       or length(p_state::text) > 300000 then
        raise exception 'Reto no válido';
    end if;

    update public.game_days set state = null where game = p_game and day < p_day - 7 and state is not null;
    delete from public.game_days where game = p_game and day < p_day - 400;
    insert into public.game_days (game, day, target, state) values (p_game, p_day, p_target, p_state)
        on conflict (game, day) do nothing;
    select d.state into v_state from public.game_days d where d.game = p_game and d.day = p_day;
    return v_state;
end;
$$;

-- Los jugadores que han salido desde p_since (para no repetirlos)
create or replace function public.game_day_recent(p_secret text, p_game text, p_since date) returns integer[]
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_targets integer[];
begin
    perform private.gm_check_secret(p_secret);
    select coalesce(array_agg(d.target), '{}') into v_targets from public.game_days d where d.game = p_game and d.day >= p_since;
    return v_targets;
end;
$$;

revoke all on function public.game_day_get(text, text, date) from public;
revoke all on function public.game_day_create(text, text, date, integer, jsonb) from public;
revoke all on function public.game_day_recent(text, text, date) from public;
grant execute on function public.game_day_get(text, text, date) to anon, authenticated;
grant execute on function public.game_day_create(text, text, date, integer, jsonb) to anon, authenticated;
grant execute on function public.game_day_recent(text, text, date) to anon, authenticated;

-- =============================================================
-- ELO (Tarea 8.1, revisada el 28-nov): el "par" de cada reto en un día, lo que sacó la mitad de la gente.
-- La web lo pide al acabar un reto para calcular cuánto ELO da o quita (un día difícil para todos no castiga). Solo
-- totales del día (cuántas partidas acabadas y su mediana de puntos): nada de nadie.
-- =============================================================

create or replace function public.game_day_par(p_secret text, p_day date) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_par jsonb;
begin
    perform private.gm_check_secret(p_secret);
    select coalesce(jsonb_object_agg(g.game, s.stats), '{}'::jsonb) into v_par
      from (values ('mas-o-menos'), ('adivina'), ('carrera')) as g(game)
      cross join lateral (select private.game_par_stats(g.game, p_day) as stats) s
     where s.stats is not null;
    return v_par;
end;
$$;

revoke all on function public.game_day_par(text, date) from public;
grant execute on function public.game_day_par(text, date) to anon, authenticated;

-- Partidas de los últimos días:
--   select game, day, count(*) as partidas, count(finished_at) as acabadas, max(score) as mejor
--     from public.game_runs group by game, day order by day desc, game;
-- Jugadores de Adivina y Carrera oculta de los últimos días:
--   select d.game, d.day, p.full_name from public.game_days d join public.players p on p.id = d.target order by d.day desc, d.game;
