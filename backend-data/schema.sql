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
    standings_extra  jsonb not null default '{}'::jsonb,  -- Rachas, L10, Home/Away
    dead_money       jsonb not null default '[]'::jsonb   -- Nómina no traspasable: [{name, salaries[4], waived}]
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
    contract_option  text,                           -- Próxima opción pendiente: Player Option / Team Option
    signed_on        date,                           -- Última firma
    signed_kind      text,                           -- free_agent / extension / rookie / rookie_extension
    acquired_on      date                            -- Último traspaso
);

-- Bases de datos creadas antes de la Tarea 4.2
alter table public.teams
    add column if not exists dead_money jsonb not null default '[]'::jsonb;
alter table public.player_contracts
    add column if not exists signed_on   date,
    add column if not exists signed_kind text,
    add column if not exists acquired_on date;

-- ---------- Tarea 4.4: contratos desde el registro oficial de movimientos ----------
-- status: confirmed = cifras conocidas · pending = firmado, sin cifra pública (salary_current NULL)
--         pending_future = esta temporada se conoce, los años de su renovación aún no
-- source: de dónde salen las cifras. NULL = carga inicial (Basketball-Reference, 4 nov 2026)
alter table public.player_contracts
    add column if not exists status     text not null default 'confirmed',
    add column if not exists source     jsonb,
    add column if not exists updated_at timestamptz not null default now();
alter table public.player_contracts drop constraint if exists player_contracts_status_check;
alter table public.player_contracts add constraint player_contracts_status_check
    check (status in ('confirmed', 'pending', 'pending_future'));

-- Registro oficial de movimientos de nba.com, tal como se aplicó a los contratos
create table if not exists public.transactions (
    id                text primary key,              -- "{GroupSort}:{PLAYER_ID}:{TEAM_ID}" del registro oficial
    transaction_date  date not null,
    type              text not null,                 -- Signing / Waive / Trade / AwardOnWaivers / ContractConverted
    contract_type     text,                          -- standard, two_way, ten_day, rest_of_season, rookie_scale, veteran_extension…
    player_id         integer not null,              -- sin FK: el jugador puede no estar aún en players
    team_id           integer not null,
    other_team_id     integer,                       -- en traspasos: el equipo que lo envía
    description       text not null,
    outcome           text,                          -- qué se hizo al aplicarlo (signed_pending, traded, waived_dead_money…)
    details           jsonb,
    applied_at        timestamptz,
    created_at        timestamptz not null default now()
);

-- Estado de los procesos automáticos: el GM muestra cuándo se actualizaron los contratos
create table if not exists public.sync_status (
    id               text primary key,               -- 'contracts', 'contract_news'
    last_run_at      timestamptz,
    last_success_at  timestamptz,
    last_error       text,
    details          jsonb
);

-- Noticias de los RSS (Hoops Rumors, RealGM) de las que se leen las cifras de los contratos.
-- Solo el principio del texto y solo 150 días. PRIVADA: sin política de lectura pública.
create table if not exists public.news_items (
    id            text primary key,                  -- "{fuente}:{guid}"
    source        text not null,                     -- hoopsrumors / realgm
    url           text not null,
    title         text not null,
    published_at  timestamptz not null,
    body          text not null,
    fetched_at    timestamptz not null default now()
);

-- ---------- Tarea 5.2b: datos sin stats.nba.com (bloquea las IPs de la nube) ----------
-- Partido en campo neutral (calendario de la CDN): cuenta en el balance, pero ni en casa ni fuera
alter table public.games add column if not exists is_neutral boolean not null default false;

-- Totales exactos de cada fila: la carrera se recalcula sumando, sin errores de redondeo.
-- En las filas "Career": {..., "history": totales antes de la temporada en curso, "history_through": "2025-26"}
alter table public.player_season_stats add column if not exists totals jsonb;

-- Boxscore de cada jugador en cada partido (CDN de la NBA). De aquí salen las estadísticas de la
-- temporada, la carrera, los récords y el radar. Solo jugadores que llegaron a jugar.
create table if not exists public.player_game_stats (
    id                text primary key,              -- "{game_id}_{player_id}"
    game_id           text not null references public.games (id) on delete cascade,
    player_id         integer not null,              -- sin FK: se crea en players justo antes, pero no debe bloquear
    team_id           integer not null references public.teams (id),
    opponent_id       integer not null references public.teams (id),
    season_id         text not null,                 -- "2026-27"
    game_type         text not null,                 -- prefijo del gameId: 002 regular, 004 playoffs, 005 play-in, 006 final de la Copa
    game_date         date not null,                 -- fecha del partido en la costa Este (la que usa la NBA)
    starter           boolean not null,
    seconds           double precision not null,
    pts integer not null, fgm integer not null, fga integer not null, fg3m integer not null, fg3a integer not null,
    ftm integer not null, fta integer not null, oreb integer not null, dreb integer not null, reb integer not null,
    ast integer not null, stl integer not null, blk integer not null, tov integer not null, pf integer not null,
    plus_minus        integer not null,
    on_court_pts      integer not null,              -- puntos del equipo con él en pista
    on_court_opp_pts  integer not null,              -- puntos del rival con él en pista
    fetched_at        timestamptz not null default now()
);

-- Totales de cada equipo en cada partido (posesiones, rebotes y pérdidas de equipo incluidas)
create table if not exists public.team_game_stats (
    id           text primary key,                   -- "{game_id}_{team_id}"
    game_id      text not null references public.games (id) on delete cascade,
    team_id      integer not null references public.teams (id),
    opponent_id  integer not null references public.teams (id),
    is_home      boolean not null,
    season_id    text not null,
    game_type    text not null,
    game_date    date not null,
    seconds      double precision not null,          -- minutos de todos sus jugadores (240 sin prórroga)
    pts integer not null, fgm integer not null, fga integer not null, fg3m integer not null, fg3a integer not null,
    ftm integer not null, fta integer not null, oreb integer not null, dreb integer not null, reb integer not null,
    ast integer not null, stl integer not null, blk integer not null, tov integer not null, pf integer not null,
    team_tov     integer not null,                   -- pérdidas de equipo (24 s, campo atrás...): cuentan para las posesiones
    fetched_at   timestamptz not null default now()
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
create index if not exists idx_transactions_player_id     on public.transactions (player_id);
create index if not exists idx_transactions_date          on public.transactions (transaction_date);
create index if not exists idx_news_items_published       on public.news_items (published_at);
create index if not exists idx_pgs_player_id              on public.player_game_stats (player_id);
create index if not exists idx_pgs_season                 on public.player_game_stats (season_id, game_type);
create index if not exists idx_pgs_game_id                on public.player_game_stats (game_id);
create index if not exists idx_tgs_season                 on public.team_game_stats (season_id, game_type);
create index if not exists idx_tgs_game_id                on public.team_game_stats (game_id);

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
alter table public.transactions        enable row level security;
alter table public.sync_status         enable row level security;
alter table public.news_items          enable row level security;  -- sin policy: solo el backend (service_role)
alter table public.player_game_stats   enable row level security;  -- sin policy: solo el backend (service_role)
alter table public.team_game_stats     enable row level security;  -- sin policy: solo el backend (service_role)

drop policy if exists "public read teams"               on public.teams;
drop policy if exists "public read players"             on public.players;
drop policy if exists "public read games"               on public.games;
drop policy if exists "public read player_season_stats" on public.player_season_stats;
drop policy if exists "public read player_awards"       on public.player_awards;
drop policy if exists "public read player_contracts"    on public.player_contracts;
drop policy if exists "public read transactions"        on public.transactions;
drop policy if exists "public read sync_status"         on public.sync_status;

create policy "public read teams"               on public.teams               for select using (true);
create policy "public read players"             on public.players             for select using (true);
create policy "public read games"               on public.games               for select using (true);
create policy "public read player_season_stats" on public.player_season_stats for select using (true);
create policy "public read player_awards"       on public.player_awards       for select using (true);
create policy "public read player_contracts"    on public.player_contracts    for select using (true);
create policy "public read transactions"        on public.transactions        for select using (true);
create policy "public read sync_status"         on public.sync_status         for select using (true);

-- =============================================================
-- Realtime: cambios de estado de partidos (Live -> Final)
-- =============================================================
do $$
begin
    alter publication supabase_realtime add table public.games;
exception when duplicate_object then null;
end $$;
