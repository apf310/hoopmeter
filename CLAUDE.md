# CLAUDE.md — Contexto Operativo y Reglas del Agente

> **Propósito de este archivo:** Guía de alta densidad y bajo consumo de tokens leída automáticamente por Claude Code en cada sesión. Para detalles extensos de producto o fases, consulta puntualmente `README.md`.

---

## 1. Visión y Arquitectura (Monorepo)
Plataforma NBA Full-Stack en tiempo real y en español estilo **BeSoccer** con **Sistema Sin Spoilers en 3 Niveles**, **Crónicas con IA**, **Exportador de Tarjetas HD para Redes Sociales** y **GM Virtual** (Simulador de Traspasos CBA), distribuida como Web y App Móvil (PWA + Capacitor).

- `backend-data/`: Pipelines en Python 3.11+ (`nba_api`, `pandas`, `supabase`, `google-genai`, `beautifulsoup4`). Detecta partidos recién terminados (`status == 'Final'`), calcula al instante el `excitement_score` (1-10) + textos IA y hace `upsert` en Supabase.
- `web-app/`: Frontend en Next.js (App Router), TypeScript, Tailwind CSS, `shadcn/ui`, `Recharts`, `html-to-image` y `Capacitor.js`. Lee datos persistentes de Supabase y sirve marcadores en vivo mediante una única ruta interna con caché compartida (`/api/live/route.ts` con `revalidate: 30`).

---

## 2. Comandos Frecuentes (Ejecutar sin adivinar)

### Backend (`cd backend-data`)
- **Activar entorno (Windows):** `.\venv\Scripts\activate`
- **Instalar dependencias:** `pip install -r requirements.txt`
- **Verificar sintaxis rápida (sin gastar API):** `python -m py_compile <archivo.py>`
- **Ejecutar extractor/procesador:** `python -m extractors.<script>` o `python -m processors.<script>`
- **Vigilar partidos terminados y procesar nota + IA al instante:** `python watcher.py`

### Frontend (`cd web-app`)
- **Servidor de desarrollo:** `npm run dev`
- **Verificación de tipos (usar para validar cambios sin compilar todo):** `npx tsc --noEmit`
- **Linter:** `npm run lint`
- **Sincronizar con móvil (Capacitor):** `npx cap sync`

---

## 3. Protocolo de Trabajo y Ahorro de Tokens (Directrices Anthropic)
1. **Alcance Estricto (1 Tarea a la vez):** Trabaja únicamente en la `Tarea X.Y` solicitada por el usuario. No adelantes código de fases futuras ni modifiques archivos no relacionados.
2. **Planificación antes de Acción:** Si una tarea toca >2 archivos, responde primero con un plan de 3-5 puntos indicando qué archivos crearás/editarás antes de escribir código.
3. **Higiene de Contexto:**
   - **PROHIBIDO** leer o buscar dentro de `node_modules/`, `.next/`, `venv/`, `.venv/`, `__pycache__/`, `dist/` o `android/`.
   - No leas `README.md` entero si solo necesitas una sección; usa búsqueda por líneas o lee solo el bloque necesario.
4. **Verificación Autónoma:** Tras crear o editar código, verifica siempre que compila (`python -m py_compile` en Python o `npx tsc --noEmit` en TypeScript) y corrige cualquier error antes de dar la tarea por terminada.
5. **Respuestas Concisas:** No pegues bloques gigantes de código en el chat si ya los has escrito en el disco con tus herramientas de edición. Resume en 2-4 líneas qué hiciste y cómo probarlo.

---

## 4. Reglas Críticas de Dominio (NBA, Tiempo Real y Spoilers)

### A. Regla de Oro del Sistema "Sin Spoilers" en 3 Niveles (`SpoilerContext`)
- **Alcance:** Solo pantallas de partidos y resultados (Home/Jornada, `/games/[id]`). Clasificación, equipos, jugadores y GM se muestran siempre, **sin** confirmaciones de "mostrar/ocultar" (fricción innecesaria para el usuario).
- **Nivel 1 — Cero Spoilers Blindado (Por defecto cuando `spoilerMode === 'STRICT'`):**
  - **SOLO** se muestra el número de la nota del partido (`excitement_score` del `1.0` al `10.0`) y su color asociado.
  - **TERMINANTEMENTE PROHIBIDO mostrar en Nivel 1:** Marcadores, ganador, si hubo prórroga (OT), si un jugador anotó 50 puntos, o cualquier texto/etiqueta que destripe cómo se desarrolla el final del partido.
- **Nivel 2 — Pista / Teaser (Solo al pulsar explícitamente *"Ver pista sin ganador"*):**
  - Muestra `ai_teaser_level2` (contexto del ritmo o duelo general generado por IA, teniendo prohibido por prompt mencionar prórrogas o el ganador).
- **Nivel 3 — Con Spoilers / En Directo (`spoilerMode === 'FULL'`):**
  - Muestra marcadores en tiempo real (`Live`) o finales, cuartos, *Boxscore* completo y `ai_summary_full`.

### B. Reglas de Tiempo Real y `nba_api`
- **Partidos en Vivo (`Live`):** Los componentes del cliente NUNCA llaman a `stats.nba.com` directamente; llaman a `/api/live` en Next.js (que cachea la respuesta de `live.nba.endpoints.scoreboard` durante 30 segundos para todos los usuarios).
- **Cálculo Inmediato Post-Partido:** No se espera a las 07:00 AM. En cuanto un partido pasa a `Final` y `is_processed == False`, `watcher.py` calcula `excitement_score` y las crónicas de IA inmediatamente (sea domingo por la tarde o de madrugada).
- **Rate Limiting en Python:** Añade siempre `time.sleep(0.6)` entre llamadas consecutivas a endpoints estadísticos de `nba_api` y usa `.upsert(..., on_conflict="id")` en Supabase.

### C. Multimedia, Tarjetas RRSS y Diseño UI
- **CDN Oficial NBA:** Fotos en `https://cdn.nba.com/headshots/nba/latest/1040x760/${playerId}.png` y logos en `https://cdn.nba.com/logos/nba/${teamId}/global/L/logo.svg`.
- **Modo Creador (`SocialCardExporter`):** Los perfiles, comparativas, notas sin spoiler y traspasos deben poder exportarse en 1 clic a imagen PNG (`16:9` y `9:16`) con marca de agua de la app.
- **Estilo Visual "Grafismo TV":** Dark Mode deportivo sobre `bg-slate-950`, `Sidebar` en escritorio y `BottomNav` en móvil. Referencia: `/standings` y `/teams/[id]`.
  - **NO** tarjetas flotantes con `rounded-xl` + borde: secciones a todo el ancho (márgenes negativos `-mx-4 -mt-4 md:-mx-8 md:-mt-8` dentro de `main`) separadas por líneas finas `border-slate-800`.
  - Tipografía: `font-display` (Barlow Condensed, `uppercase`, `font-extrabold`) para títulos, cifras y cabeceras de tabla; antetítulos con `tracking-[0.25em]`; texto corrido en Geist (`font-sans`).
  - Color de equipo: franjas finas con `teamAccent()` (`lib/team-colors.ts`, garantiza visibilidad sobre oscuro); cabeceras con degradado del color primario + logo como marca de agua.
  - Contraste alto: cabeceras `text-slate-300`, cifras `text-white`; acento de la app `orange-500`; victoria `emerald`, derrota `red`.

---

## 5. Referencia Rápida de Tablas en Supabase
- `teams`: `id` (PK int), `name`, `abbreviation`, `conference`, `division`, `primary_color`, `secondary_color`, `wins`, `losses`, `conf_rank`, `standings_extra` (jsonb).
- `players`: `id` (PK int), `team_id` (FK), `full_name`, `position`, `height`, `weight`, `country`, `birth_date`, `draft_year`, `draft_number`, `is_active`, `radar_attributes` (jsonb).
- `games`: `id` (PK text), `game_datetime_utc` (timestamptz), `home_team_id` (FK), `away_team_id` (FK), `home_score`, `away_score`, `status` (`Scheduled`/`Live`/`Final`), `live_period_text`, `excitement_score` (float), `ai_teaser_level2`, `ai_summary_full`, `quarters_score` (jsonb), `is_processed` (bool).
- `player_season_stats`: `id` (PK text `"{player_id}_{season_id}_{season_type}"`), `player_id` (FK), `season_id`, `team_id`, `season_type`, `games_played`, `pts`, `reb`, `ast`, `fg_pct`, `fg3_pct`, `advanced_stats` (jsonb).
- `player_awards`: `id` (PK serial), `player_id` (FK), `award_name`, `season`.
- `player_contracts`: `player_id` (PK/FK int), `salary_current`, `salary_year_2`, `salary_year_3`, `salary_year_4`, `contract_option`.
