# Domain Boundaries

O domínio funcional da app é `age_group`-first.

## Fonte de verdade

- `age_groups` é a raiz funcional.
- `age_groups.coordinator_id` define o coordenador do escalão.
- `age_group_staff` define a equipa técnica efetiva do escalão.
- `teams` são entidades filhas do escalão para contexto competitivo/calendário.
- O subtree operacional deve derivar de `age_group` ou `team`.

## Compatibilidade técnica

Estas estruturas continuam a existir, mas não são fronteira funcional de autorização:

- `clubs`
- `club_memberships`
- `team_staff`
- `user_default_club_id()`
- wrappers SQL de compatibilidade `user_can_access_club(...)`, `user_can_manage_club(...)`, `user_club_ids()`

## Usos permitidos de `club` / `club_id`

- FK técnica e compatibilidade histórica.
- tenancy técnica temporária.
- projeções legadas compatíveis.
- cleanup técnico explícito.
- sincronização interna necessária para manter tabelas legadas coerentes.

## Usos proibidos

- autorização de domínio em `src`.
- gating de acesso de coordenador/staff.
- regras de produto.
- boundary funcional de escalão/equipa.
- policies novas baseadas em `same club`.
- uso de `club_memberships` como fonte de permissões.

## team_staff

`team_staff` está congelada como projeção compatível de `age_group_staff`.

- não é fonte de verdade
- não deve receber writes diretos de novas funcionalidades
- não deve ser usada por código novo como fonte principal de leitura/autorização
- a responsabilidade funcional é de `age_group_staff`

## Guardrails

Executar:

```bash
pnpm run guard:architecture
```

O guardrail falha quando encontra:

- queries runtime a `club_memberships`
- uso de `user_can_access_club(...)` / `user_can_manage_club(...)` no domínio da app
- filtros runtime por `club_id` como boundary funcional
- novas migrations com helpers/policies centrados em `club`

## Exemplos rápidos

Passa:

- `public.user_can_access_age_group_v2(age_group_id)`
- query runtime por `team_id`, `age_group_id`, `game_id` ou `training_session_id`
- cleanup técnico explícito em [delete-age-group.ts](/Users/pedrocampos/Project_2026/coach11/src/lib/team/delete-age-group.ts)

Falha:

- `.from("club_memberships")` em código novo de runtime
- `.eq("club_id", ...)` como filtro funcional em `src`
- `user_can_access_club(...)` numa rota/helper novo
- migration nova com `create policy ... club_boundary ...`

Exceções técnicas têm de ser explícitas e estreitas no allowlist de:

- [scripts/guard-domain-boundaries.mjs](/Users/pedrocampos/Project_2026/coach11/scripts/guard-domain-boundaries.mjs)

Se uma exceção for realmente necessária, documenta a razão e limita-a ao ficheiro/regra mínimos.
