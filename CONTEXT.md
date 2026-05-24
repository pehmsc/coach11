# Current Project

## What we are building

**Coach11** (coach11.app) — a mobile-first PWA for youth football club management
in Portugal. The strategic bet is **"field-first that auto-populates admin"**:
coaches register data in the field (trainings, games, attendance, live events) and
the admin backoffice fills itself automatically — the opposite of EMJOGO, the
incumbent, where every record is entered manually and twice. Stack: Next.js App
Router, Supabase (Auth + PostgreSQL + RLS + Storage), TypeScript strict, Tailwind
v4, shadcn/ui, deployed on Vercel Pro.

## What good looks like

- **Architecturally correct, not just functional.** Refactors are total, not
  partial; correctness beats speed when they conflict.
- **State derived, never duplicated.** Live-game state comes from `game_events` +
  `initial_lineup_status`; club-perspective scores come from
  `src/lib/games/score-helpers.ts` — never re-derived inline.
- **RLS proportional to risk** and verified: broad for operational data, tight for
  strategic data with external minors (scouting). GRANT and RLS both audited on any
  permission error.
- **Self-contained Claude Code prompts:** explicit prior investigation (`grep`,
  `find`, SQL), before/after code blocks, NÃO ALTERAR sections for protected areas,
  manual test scenarios, and a structured ✅/❌ final report.
- **Green gate before every push:** `npx tsc --noEmit`, `pnpm lint`,
  `npx vitest run` all pass. Migrations via `npx supabase db push`.
- **Commits:** Portuguese messages, `Authored-By: Pedro Campos
<pedro.campos@befirstrs.com>`, no Claude co-authorship.
- **New features start with a visual** (HTML mockup or flow diagram) that surfaces
  implicit requirements before any code is written.
- **State is verified via MCP** (Supabase / Sentry / Vercel / Chrome) before being
  asserted.

## What to avoid

- **`createAdminClient` in data endpoints** — forbidden. Only `createServerClient`
  (exceptions: Auth Admin API, Storage). Never bypass RLS via service role.
- **`supabase gen types`** — types are hand-written in `src/types/database.ts`.
  Never regenerate without Pedro's explicit confirmation.
- **Touching protected areas' logic:** Calendar events service/repository,
  DuplicateWeekDialog / weekly-duplication, public share token / encryption,
  `enforce_initial_lineup_immutability` trigger. Mechanical substitution only.
- **`CREATE OR REPLACE FUNCTION` on a changed signature** without an explicit
  `DROP FUNCTION IF EXISTS` first (it silently creates an overload).
- **PostgREST `.order(col, { foreignTable })`** for many-to-one embeds — silent
  no-op. Use `.order('table(col)', { ascending })`.
- **`setState` inside `useEffect`** for derived state — blocked by the
  `react-compiler` lint (cascading renders). Use declarative `useMemo` /
  `useState(() => init())` lazy init instead.
- **Conflating the three note fields:** `notes` (public, pre-game), `coach_notes`
  (private), `team_notes` (internal tactical). Never merge them.
- **Pasting SQL into the Supabase dashboard** — migrations always via CLI so
  history stays versioned.
- **Jumping to a code prompt on new features** without a mockup/diagram first.
- **Asserting production state from memory** instead of confirming via Vercel/MCP.
- **Preamble, filler, and decision-by-default.** Be direct; present trade-offs and
  let Pedro decide.
