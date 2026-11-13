# CLAUDE.md — Contexto Operativo y Reglas del Agente

> **Propósito de este archivo:** Guía de alta densidad y bajo consumo de tokens leída automáticamente por Claude Code en cada sesión. Para detalles extensos de producto o fases, consulta puntualmente `README.md`.

---

## 1. Visión y Arquitectura (Monorepo)
Plataforma NBA Full-Stack en tiempo real y en español estilo **BeSoccer** con **Sistema Sin Spoilers en 3 Niveles** con **Nota de Espectáculo 1-10**, **Exportador de Tarjetas HD para Redes Sociales** y **GM Virtual** (Simulador de Traspasos CBA), distribuida como Web y App Móvil (PWA + Capacitor).

- `backend-data/`: Pipelines en Python 3.11+ (`nba_api`, `pandas`, `supabase`, `google-genai`, `beautifulsoup4`). Detecta partidos recién terminados (`status == 'Final'`), calcula al instante el `excitement_score` (1-10) y hace `upsert` en Supabase. Sin textos IA por ahora (aparcados en `processors/ai_chronicler.py`, fuera del pipeline).
- `web-app/`: Frontend en Next.js (App Router), TypeScript, Tailwind CSS, `shadcn/ui`, `Recharts`, `html-to-image` y `Capacitor.js`. Lee datos persistentes de Supabase y sirve marcadores en vivo mediante una única ruta interna con caché compartida (`/api/live/route.ts` con `revalidate: 30`).

---

## 2. Comandos Frecuentes (Ejecutar sin adivinar)

### Backend (`cd backend-data`)
- **Activar entorno (Windows):** `.\venv\Scripts\activate`
- **Instalar dependencias:** `pip install -r requirements.txt`
- **Verificar sintaxis rápida (sin gastar API):** `python -m py_compile <archivo.py>`
- **Ejecutar extractor/procesador:** `python -m extractors.<script>` o `python -m processors.<script>`
- **Vigilar partidos terminados, poner la nota al instante, guardar su boxscore y recalcular la clasificación:** `python watcher.py` (`--once`, `--backfill`, `--skip-schedule`, `--game-id X --dry-run`)
- **Calendario completo de la temporada (CDN) + directo de hoy:** `python -m extractors.fetch_live_and_final`
- **Boxscores (CDN + correcciones oficiales de nba.com):** `python -m extractors.fetch_boxscores` (`--all`, `--game-id X`, `--cdn-only`, `--dry-run`)
- **Clasificación calculada con desempates oficiales:** `python -m processors.standings_calc` (`--dry-run`)
- **Estadísticas de temporada, carrera y récords desde los boxscores:** `python -m processors.season_stats_calc` (`--dry-run`)
- **Radares (0-99) desde los boxscores:** `python -m processors.player_radar_calc` (`--dry-run`; `--official` = stats.nba.com, solo desde un PC)
- **Ficha (altura, peso, draft...) de jugadores nuevos desde nba.com:** `python -m extractors.fetch_player_bios` (`--dry-run`)
- **Aplicar el registro oficial de movimientos de la NBA a los contratos (fichajes, cortes, traspasos):** `python -m extractors.fetch_transactions` (`--dry-run`)
- **Cifras de los contratos desde las noticias (RSS de Hoops Rumors y RealGM), justo después del anterior:** `python -m extractors.fetch_contract_news` (`--dry-run`)
- **Tests (contratos, clasificación, estadísticas; sin red ni base de datos):** `python -m unittest discover -s tests -t .`
- **Solo desde un PC (stats.nba.com), de vez en cuando:** `python -m extractors.fetch_career_awards` (premios en febrero/mayo/junio; `--player-id X` para los "pending_history" de `sync_status.season_stats`; `--totals-only` = solo totales exactos)
- **Carga completa de contratos desde Basketball-Reference (solo carga inicial: NO programar):** `python -m extractors.scrape_salaries` (`--dry-run`)
- **Cargar leyendas retiradas (lista `LEGENDS`, ~8 min):** `python -m extractors.fetch_legends` (`--resume`, `--name "Michael Jordan"`)

### Frontend (`cd web-app`)
- **Servidor de desarrollo:** `npm run dev`
- **Verificación de tipos (usar para validar cambios sin compilar todo):** `npx tsc --noEmit`
- **Linter:** `npm run lint`
- **Tests del motor de reglas del GM y del comparador (`node --test`, sin dependencias):** `npm test`
- **Sincronizar con móvil (Capacitor):** `npm run cap:sync` (lee `CAPACITOR_SERVER_URL` de `.env.local`; compilar Android exige JDK 21 y SDK 36)
- **Regenerar iconos y splash desde `assets/logo.svg`:** `npm run icons`

---

## 3. Protocolo de Trabajo y Ahorro de Tokens (Directrices Anthropic)
1. **Alcance Estricto (1 Tarea a la vez):** Trabaja únicamente en la `Tarea X.Y` solicitada por el usuario. No adelantes código de fases futuras ni modifiques archivos no relacionados.
2. **Planificación antes de Acción:** Si una tarea toca >2 archivos, responde primero con un plan de 3-5 puntos indicando qué archivos crearás/editarás antes de escribir código.
3. **Higiene de Contexto:**
   - **PROHIBIDO** leer o buscar dentro de `node_modules/`, `.next/`, `venv/`, `.venv/`, `__pycache__/`, `dist/` o `android/` (Puedes editar el tema de Android).
   - No leas `README.md` entero si solo necesitas una sección; usa búsqueda por líneas o lee solo el bloque necesario.
4. **Verificación Autónoma:** Tras crear o editar código, verifica siempre que compila (`python -m py_compile` en Python o `npx tsc --noEmit` en TypeScript) y corrige cualquier error antes de dar la tarea por terminada.
5. **Respuestas Concisas:** No pegues bloques gigantes de código en el chat si ya los has escrito en el disco con tus herramientas de edición. Resume en 2-4 líneas qué hiciste y cómo probarlo.

---

## 4. Reglas Críticas de Dominio (NBA, Tiempo Real y Spoilers)

### A. Regla de Oro del Sistema "Sin Spoilers" en 3 Niveles (`SpoilerContext`)
- **Alcance:** Solo pantallas de partidos y resultados (Home/Jornada, `/games/[id]`). Clasificación, equipos, jugadores y GM se muestran siempre, **sin** confirmaciones de "mostrar/ocultar" (fricción innecesaria para el usuario).
- **Garantía innegociable:** la app **SIEMPRE arranca en Nivel 1**, aunque se cerrara en otro (también tras >15 min en segundo plano). Nunca persistir Nivel 2/3 entre aperturas. Ante la duda, fallar hacia el Nivel 1.
- **Cambio de nivel (`SpoilerModeSelector`):** a Nivel 1 o 2 con un toque; a Nivel 3 **solo manteniendo pulsado** 1 s (un toque o roce accidental nunca destripa nada).
- **Nivel 1 — Todo oculto (`spoilerLevel === 1`, por defecto):** solo emparejamientos y hora. **Ni nota**, ni marcador, ni estado/`live_period_text`.
- **Nivel 2 — Solo nota (`spoilerLevel === 2`):** lo anterior + el número `excitement_score` (`1.0`-`10.0`) y su color.
  - **TERMINANTEMENTE PROHIBIDO en Niveles 1 y 2:** marcadores, ganador, si hubo prórroga (OT), si un jugador anotó 50 puntos, o cualquier texto/etiqueta que destripe cómo se desarrolla el partido.
- **Nivel 3 — Resultados (`spoilerLevel === 3`):** marcadores en tiempo real (`Live`) o finales junto a la nota, cuartos y *Boxscore* completo. Solo en este nivel se llama a `/api/live`.
- Filtrar siempre con `redactGame(game, level)` (`lib/spoilers.ts`, lista blanca por nivel) antes de pasar datos a la UI.

### B. Reglas de Tiempo Real y `nba_api`
- **Partidos en Vivo (`Live`):** Los componentes del cliente NUNCA llaman a `stats.nba.com` directamente; llaman a `/api/live` en Next.js (que cachea la respuesta de `live.nba.endpoints.scoreboard` durante 30 segundos para todos los usuarios).
- **Ficha del partido (`/games/[id]`):** boxscore, tiros y jugada a jugada salen de `/api/games/[id]` (`lib/game-detail.ts`: CDN `liveData` de la NBA reducida en el servidor y con métricas avanzadas; caché compartida de 30 s en directo y de horas si es `Final`). Es Nivel 3: el cliente solo la pide en ese nivel (`useGameDetail`).
- **Cálculo Inmediato Post-Partido:** No se espera a las 07:00 AM. En cuanto un partido pasa a `Final` y `is_processed == False`, `watcher.py` calcula `excitement_score` inmediatamente (sea domingo por la tarde o de madrugada).
- **Rate Limiting en Python:** Añade siempre `time.sleep(0.6)` entre llamadas consecutivas a endpoints estadísticos de `nba_api` y usa `.upsert(..., on_conflict="id")` en Supabase.
- **La web (Vercel) lee los JSON en directo del origen S3** (`nba-prod-us-east-1-mediaops-stats.s3.amazonaws.com/NBA/liveData`, `fetchLiveData` en `lib/live.ts`): `cdn.nba.com` responde 403 a las IPs de Vercel (AWS) aunque funcione en local. Fotos y logos de `cdn.nba.com` sí funcionan desde Vercel.
- **`stats.nba.com/stats/*` bloquea las IPs de la nube (GitHub, Vercel):** nada automático puede usarlo. Desde GitHub Actions solo funcionan `cdn.nba.com` (`extractors/nba_cdn.py`), las páginas de nba.com (`extractors/nba_web.py`) y los estáticos de `stats.nba.com/js/data`. Lo que solo exista en `stats.nba.com/stats` (premios, historial de veteranos nuevos) se carga a mano desde un PC.
- **Cifras oficiales (Tarea 5.2b):** la CDN no recoge las correcciones que la NBA hace días después; la página del partido de nba.com sí. `fetch_boxscores` combina las dos (`box_stats.apply_official`) y vuelve a comprobar cada partido una vez por semana. Validado con 2025-26 completa frente a stats.nba.com.
- **Programación de los workflows:** los lanza Supabase (`pg_cron` + `pg_net` -> `workflow_dispatch`, `backend-data/cron.sql`, token en el Vault como `github_dispatch_token`, caduca al año). El `schedule` de GitHub es solo respaldo: en repos gratuitos se retrasa horas o se salta.
- **Promedios de jugadores, una vez al día:** la ficha de un partido enseña promedios en el Nivel 1; si cambiaran minutos después de acabar, delatarían el partido. `season_stats_calc` y el radar van solo en el job diario. La clasificación sí se recalcula al acabar cada partido (no está en pantallas sin spoilers).

### C. Multimedia, Tarjetas RRSS y Diseño UI
- **CDN Oficial NBA:** Fotos en `https://cdn.nba.com/headshots/nba/latest/1040x760/${playerId}.png` y logos en `https://cdn.nba.com/logos/nba/${teamId}/global/L/logo.svg`.
- **Modo Creador (`SocialCardExporter`):** Los perfiles, comparativas, notas sin spoiler y traspasos deben poder exportarse en 1 clic a imagen PNG (`16:9` y `9:16`) con marca de agua de la app.
- **Estilo Visual "Grafismo TV":** Dark Mode deportivo sobre `bg-slate-950`, `Sidebar` en escritorio y `BottomNav` en móvil. Referencia: `/standings` y `/teams/[id]`.
  - **NO** tarjetas flotantes con `rounded-xl` + borde: secciones a todo el ancho (márgenes negativos `-mx-4 -mt-4 md:-mx-8 md:-mt-8` dentro de `main`) separadas por líneas finas `border-slate-800`.
  - Tipografía: `font-display` (Barlow Condensed, `uppercase`, `font-extrabold`) para títulos, cifras y cabeceras de tabla; antetítulos con `tracking-[0.25em]`; texto corrido en Geist (`font-sans`).
  - Color de equipo: franjas finas con `teamAccent()` (`lib/team-colors.ts`, garantiza visibilidad sobre oscuro); cabeceras con degradado del color primario + logo como marca de agua.
  - Contraste alto: cabeceras `text-slate-300`, cifras `text-white`; acento de la app `orange-500`; victoria `emerald`, derrota `red`.

### D. GM Virtual (`/gm-simulator`)
- **Motor de reglas:** `lib/trade-rules.ts`, puro y sin dependencias: el cliente lo usa para el veredicto instantáneo y el servidor para revalidar. El cliente solo envía ids, nunca salarios (única excepción: la estimación de un contrato `pending`, que `applyEstimates` acota entre `MIN_SALARY` y `MAX_SALARY`), y un traspaso ilegal no llega a la IA.
- **Contratos (Tarea 4.4):** los movimientos salen del registro oficial de la NBA (`fetch_transactions.py` + `processors/contract_engine.py`). La NBA no publica cifras: un contrato firmado sin cifra pública es `status = 'pending'` con salario NULL, y el GM pide la estimación al usuario y la marca como tal (veredicto, IA e imagen).
- **Cifras: nunca inventadas.** Solo las publicadas por medios fiables en los RSS (`processors/contract_news.py`) o calculadas con el convenio (`processors/cba.py`), decididas por `processors/contract_resolver.py`. Las no exactas llevan `source.precision = 'approx'` y se muestran con "≈". Ante cualquier contradicción, el contrato sigue sin cifra. Un mínimo de un año de un veterano (3+ años) cuenta como el de 2 años salvo si renueva con su equipo (no se puede saber: sin cifra).
- **Cada verano, además de `trade-rules.ts`:** revisar `processors/cba.py` (un test comprueba que coinciden). Desde el 1 de julio los dos procesos de contratos se paran y avisan hasta que se actualice y se aplique el cambio de temporada.
- **Gemini con búsqueda de Google (grounding) NO sirve para rellenar datos:** sus condiciones prohíben guardar, analizar o crear bases de datos con esos resultados.
- **Cada verano:** revisar el bloque de cifras de `trade-rules.ts` (tope, aprons, tramos, fecha límite, rondas, `HARD_CAPS`, `FROZEN_FIRSTS`) y pasar `npm test`.
- **Nómina de un equipo = contratos + `teams.dead_money`.** Sin el dinero muerto, varios equipos caen en la zona salarial equivocada.
- **Evaluación IA:** `lib/trade-evaluation.ts` (Gemini, solo servidor, `GEMINI_API_KEY` en `web-app/.env.local`). El modelo solo usa datos de la app; hay caché por traspaso y límite por IP.

### E. Comparador (`/compare?a=ID&b=ID`) y leyendas
- **Leyendas:** `players` con `is_active = false` y `team_id` NULL. Filtrar por `is_active` en cualquier lista de jugadores actuales.
- **Dos radares distintos:** el de `players.radar_attributes` es la temporada frente a la liga de ese año (solo activos). El del comparador (`lib/compare.ts`) es histórico: cada temporada frente a todas las guardadas y cada carrera frente a todas las carreras. No mezclarlos.
- **Datos por época:** la NBA no registró robos y tapones hasta 1973-74 ni triples hasta 1979-80: esos valores son NULL y esa fila no puntúa.

### F. PWA y app nativa
- **La app nativa carga la web desplegada** (`server.url` = `CAPACITOR_SERVER_URL`): la web necesita servidor y no admite exportación estática. Los cambios web llegan sin publicar en las tiendas.
- **Service worker (`public/sw.js`):** solo navegaciones y página sin conexión. **Nunca** cachear `/api/*` ni HTML de partidos. No se registra en la app nativa.
- **Código solo nativo:** siempre en `lib/native.ts`, con los plugins importados bajo demanda. En Android no funcionan `<a download>` ni `navigator.share` con archivos.
- **Garantía de spoilers en nativo:** `SpoilerContext` escucha `appStateChange` además de `visibilitychange`; no quitar ninguno de los dos.

---

## 5. Referencia Rápida de Tablas en Supabase
- `teams`: `id` (PK int), `name`, `abbreviation`, `conference`, `division`, `primary_color`, `secondary_color`, `wins`, `losses`, `conf_rank`, `standings_extra` (jsonb), `dead_money` (jsonb `[{name, salaries[4], waived, pending?, player_id?, waived_on?, txn?, contract?}]`; `pending` = cifra no segura).
- `players`: `id` (PK int), `team_id` (FK), `full_name`, `position`, `height`, `weight`, `country`, `birth_date`, `draft_year`, `draft_number`, `is_active`, `radar_attributes` (jsonb).
- `games`: `id` (PK text), `game_datetime_utc` (timestamptz), `home_team_id` (FK), `away_team_id` (FK), `home_score`, `away_score`, `status` (`Scheduled`/`Live`/`Final`), `live_period_text`, `excitement_score` (float), `ai_teaser_level2`/`ai_summary_full` (sin uso por ahora), `quarters_score` (jsonb `{"home": [...], "away": [...]}`, un valor por periodo), `is_processed` (bool).
- `player_season_stats`: `id` (PK text `"{player_id}_{season_id}_{season_type}"`), `player_id` (FK), `season_id`, `team_id`, `season_type`, `games_played`, `pts`, `reb`, `ast`, `fg_pct`, `fg3_pct`, `advanced_stats` (jsonb), `totals` (jsonb, totales exactos; en "Career" además `history` = antes de la temporada en curso y `history_through`).
- `player_game_stats` (PRIVADA): `id` (PK `"{game_id}_{player_id}"`), `game_id` (FK), `player_id`, `team_id`, `opponent_id`, `season_id`, `game_type` (prefijo del gameId: `002` regular, `004` playoffs, `005` play-in, `006` final de la Copa), `game_date` (ET), `starter`, `seconds`, totales (`pts`...`pf`), `plus_minus`, `on_court_pts`, `on_court_opp_pts`, `fetched_at`.
- `team_game_stats` (PRIVADA): `id` (PK `"{game_id}_{team_id}"`), mismos totales que la anterior + `is_home`, `team_tov`.
- `player_awards`: `id` (PK serial), `player_id` (FK), `award_name`, `season`.
- `player_contracts`: `player_id` (PK/FK int), `salary_current` (NULL si `pending`), `salary_year_2`, `salary_year_3`, `salary_year_4`, `contract_option` (próxima opción pendiente o NULL), `signed_on`, `signed_kind`, `acquired_on`, `status` (`confirmed`/`pending`/`pending_future`), `source` (jsonb; NULL = carga inicial de BR), `updated_at`.
- `transactions`: `id` (PK text `"{GroupSort}:{PLAYER_ID}:{TEAM_ID}"`), `transaction_date`, `type`, `contract_type`, `player_id`, `team_id`, `other_team_id`, `description`, `outcome`, `details` (jsonb), `applied_at`. Registro oficial tal como se aplicó.
- `sync_status` (lectura pública: nunca resultados en `details`): `id` (PK text: `contracts`, `contract_news`, `boxscores`, `standings`, `season_stats`), `last_run_at`, `last_success_at`, `last_error`, `details` (jsonb; `boxscores.uncorrected` = partidos aún sin cifras oficiales, `season_stats.pending_history` = jugadores sin carrera).
- `news_items` (PRIVADA, sin lectura pública): `id` (PK text `"{fuente}:{guid}"`), `source`, `url`, `title`, `published_at`, `body` (solo el principio), `fetched_at`. Se borran a los 150 días.
