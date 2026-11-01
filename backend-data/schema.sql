-- =============================================================
-- NBA App — Esquema de base de datos (Supabase / PostgreSQL)
-- Tarea 0.3 · Ejecutar en Supabase > SQL Editor
-- Orden de creación respeta las claves foráneas.
-- =============================================================

-- ---------- teams ----------
create table if not exists public.teams (
    id               integer primary key,            -- ID oficial NBA (ej. 1610612747)
    name             text not null,
    abbreviation     text not null,
    conference       text,                           -- East / West
    division         text,
    primary_color    text,                           -- #RRGGBB
    secondary_color  text,
    wins             integer not null default 0,
    losses           integer not null default 0,
    conf_rank        integer,
    standings_extra  jsonb not null default '{}'::jsonb  -- Rachas, L10, Home/Away
);

-- ---------- players ----------
create table if not exists public.players (
    id                integer primary key,           -- ID oficial NBA (ej. 2544)
    team_id           integer references public.teams (id) on delete set null,
    full_name         text not null,
    position          text,
    height            text,
    weight            text,
    country           text,
    birth_date        date,
    draft_year        integer,
    draft_number      integer,
    is_active         boolean not null default true,
    radar_attributes  jsonb not null default '{}'::jsonb  -- Percentiles 0-99 en 6 categorías
);

-- ---------- games ----------
create table if not exists public.games (
    id                  text primary key,            -- Game ID oficial (ej. 0022500123)
    game_datetime_utc   timestamptz not null,
    home_team_id        integer not null references public.teams (id),
    away_team_id        integer not null references public.teams (id),
    home_score          integer,
    away_score          integer,
    status              text not null default 'Scheduled'
                        check (status in ('Scheduled', 'Live', 'Final')),
    live_period_text    text,                        -- Ej. "Q3 04:12" o "Halftime"
    excitement_score    double precision
                        check (excitement_score is null
                               or (excitement_score >= 1.0 and excitement_score <= 10.0)),
    ai_teaser_level2    text,                        -- Nivel 2: sin ganador ni prórrogas
    ai_summary_full     text,                        -- Nivel 3: crónica con spoilers
    quarters_score      jsonb,                       -- Puntos por cuarto
    is_processed        boolean not null default false,
    check (home_team_id <> away_team_id)
);

-- ---------- player_season_stats ----------
create table if not exists public.player_season_stats (
    id              text primary key,                -- "{player_id}_{season_id}_{season_type}"
    player_id       integer not null references public.players (id) on delete cascade,
    season_id       text not null,                   -- ej. "2025-26"
    team_id         integer references public.teams (id) on delete set null,
    season_type     text not null,                   -- Regular Season / Playoffs
    games_played    integer,
    pts             double precision,
    reb             double precision,
    ast             double precision,
    fg_pct          double precision,
    fg3_pct         double precision,
    advanced_stats  jsonb not null default '{}'::jsonb  -- TS%, USG%, PER, +/-
);

-- ---------- player_awards ----------
create table if not exists public.player_awards (
    id          serial primary key,
    player_id   integer not null references public.players (id) on delete cascade,
    award_name  text not null,                       -- NBA MVP / All-Star / Champion
    season      text                                 -- ej. "2023-24"
);

-- ---------- player_contracts ----------
create table if not exists public.player_contracts (
    player_id        integer primary key references public.players (id) on delete cascade,
    salary_current   bigint,
    salary_year_2    bigint,
    salary_year_3    bigint,
    salary_year_4    bigint,
    contract_option  text                            -- Player Option / Team Option / UFA
);

-- =============================================================
-- Índices para las consultas más habituales
-- =============================================================
create index if not exists idx_players_team_id            on public.players (team_id);
create index if not exists idx_games_datetime             on public.games (game_datetime_utc);
create index if not exists idx_games_status_processed     on public.games (status, is_processed);
create index if not exists idx_games_home_team            on public.games (home_team_id);
create index if not exists idx_games_away_team            on public.games (away_team_id);
create index if not exists idx_pss_player_id              on public.player_season_stats (player_id);
create index if not exists idx_pss_team_id                on public.player_season_stats (team_id);
create index if not exists idx_awards_player_id           on public.player_awards (player_id);

-- =============================================================
-- Seguridad (RLS): lectura pública con la anon key; escritura solo
-- desde el backend con la service_role key (que ignora RLS).
-- =============================================================
alter table public.teams               enable row level security;
alter table public.players             enable row level security;
alter table public.games               enable row level security;
alter table public.player_season_stats enable row level security;
alter table public.player_awards       enable row level security;
alter table public.player_contracts    enable row level security;

drop policy if exists "public read teams"               on public.teams;
drop policy if exists "public read players"             on public.players;
drop policy if exists "public read games"               on public.games;
drop policy if exists "public read player_season_stats" on public.player_season_stats;
drop policy if exists "public read player_awards"       on public.player_awards;
drop policy if exists "public read player_contracts"    on public.player_contracts;

create policy "public read teams"               on public.teams               for select using (true);
create policy "public read players"             on public.players             for select using (true);
create policy "public read games"               on public.games               for select using (true);
create policy "public read player_season_stats" on public.player_season_stats for select using (true);
create policy "public read player_awards"       on public.player_awards       for select using (true);
create policy "public read player_contracts"    on public.player_contracts    for select using (true);

-- =============================================================
-- Realtime: cambios de estado de partidos (Live -> Final)
-- =============================================================
do $$
begin
    alter publication supabase_realtime add table public.games;
exception when duplicate_object then null;
end $$;
