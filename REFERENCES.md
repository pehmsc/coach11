# References

## Examples of good work

These are the patterns worth imitating, drawn from PRs and artifacts that landed well:

- **Mockup-before-code (typeahead adversário, scouting diagram).** Producing an
  HTML mockup or flow diagram before the code prompt surfaced implicit requirements
  that prose never would have — hard delete with GDPR name-confirmation, the
  always-created profile from first addition. New features should start here.
- **The `useLiveGameState` refactor (PRs #191–#203, Z1–Z8c).** 1907 → 344 lines
  (~82% reduction), ~429 → 663 tests, zero rollbacks across 8 PRs. The strangler
  approach is the model: split into single-responsibility sub-hooks
  (`useLiveClock`, `useLiveEvents`, `useLiveLineup`, `useLiveEventModal`,
  `useLiveDerivedState` (pure), `useLivePhase`, `useLiveDataLoader`,
  `useLiveFinalize`), each receiving inputs via props with an identical return
  shape, orchestrator as pure composition. This is what a total refactor looks like.
- **The security sprint (#212–#215).** Member deletion as full account teardown
  (16 FKs SET NULL + `auth.admin.deleteUser`), views → `security_invoker`, audit →
  RLS, the bucket `public:true` nuance (URL serving vs `.list()`). Each change was
  grepped before applied and the SECURITY DEFINER warnings were knowingly kept
  because `user_can_access_*` must stay DEFINER or RLS recurses. Good = understanding
  _why_ a warning stays, not silencing it.
- **The `TacticalSystemPicker` 2-source-of-truth pattern (PR #174).** Declarative
  `useMemo` combining explicit user intent with the derived value, instead of
  `useState`+`useEffect`. This is the canonical answer to the `react-compiler`
  cascading-render lint.
- **A good Claude Code prompt** reads: context first ("after manual validation of
  PR X we found…"), explicit prior investigation (`grep`/`find`/SQL), before/after
  code blocks, NÃO ALTERAR sections, numbered manual test scenarios, and a
  structured ✅/❌ final report. Self-contained, because the executor has no memory.

## Relevant links

**Live / dashboards (real URLs):**

- App: https://coach11.app
- Supabase project: `hqlqgviiafqfefukodpe`
- Vercel: team `team_1Ay7Y5uE9tPjGgFDOcBuVurW`, coach11 project
  `prj_nNNe2AkOoBXBbj6QG745aiLf03dY`
- PostHog: EU Cloud, project 137851 (`eu.i.posthog.com`)
- Sentry: org `coach11`

**Project knowledge documents (internal references, not navigable URLs):**

- `COACH11_CLAUDE_GUIDELINE.md` — working style, role division, protected areas,
  MCP validation patterns
- `PLANO_EXECUTAVEL_SPRINTS_2_3_4.md` — executable sprint plans
- `COACH11_BACKLOG.md` — backlog
- `Coach11_Handoff_Next_Chat.md` — current-state handoff between sessions
- `Coach11_EMJOGO_Analise_Chrome_v1.md` — competitive research on EMJOGO
- `mockup-typeahead-adversario.html`, `diagrama-fluxo-scouting.html` — approved visuals
- `src/lib/games/score-helpers.ts` — `getOurScore`, `getOpponentScore`,
  `getGameResult` (canonical score logic)
- `src/types/database.ts` — hand-written types (source of truth, never regenerated)
- `src/lib/hooks/live/` — the 8 live sub-hooks

## Notes

- **Reference escalão for all examples and smoke tests:** EFB Sub-13 Infantis A
  (`age_group_id 10036f09-4bf7-4198-9ddf-2ae8f79f418f`,
  `club_id 6a01c7bb-90cb-4605-b737-ea45d581c485`). Real scale (47 athletes,
  22 games, 65 trainings) — never use test accounts. Note this club carries a
  `[technical]` wrapper suffix; the UI hides it and semantically the club is
  "Os Belenenses".
- **Score source of truth:** `score_home + score_away + is_home`, written by
  `rpc_finalize_game`. Always go through the score helpers — never re-derive
  club perspective inline.
- **Three note fields, never conflated:** `notes` (public, pre-game),
  `coach_notes` (private), `team_notes` (internal tactical).
- **Canonical location schema (post PR #145):** `location`, `formatted_address`,
  `latitude`, `longitude`, `osm_place_id`, `location_source`. The old
  `location_address` / `location_lat` / `location_lng` are gone.
- **Known live debt:** `/api/games/[id]/live/external-players` uses camelCase while
  the rest of the project uses snake_case — normalize when that endpoint is
  deprecated. The `/games/[id]` `useEffect` redirect to `/summary` breaks "Voltar
  ao jogo" — decision: won't fix, disappears in the club-first restructuring.
- **Naming convention reminder:** these IDs and project refs are fine in a private
  context file. If this `References.md` ever goes into a shared or public repo,
  pull the IDs out first.
- **When in doubt, verify via MCP** (Supabase / Sentry / Vercel / Chrome) before
  asserting state — especially when something is claimed to be "in production".
