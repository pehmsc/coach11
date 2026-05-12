# Candidatos a merge de Adversários — pós PR 2.1

Gerado automaticamente após back-fill da Sprint 2 / PR 2.1. Pares onde os nomes normalizados são iguais ou prefixos um do outro, no mesmo clube + escalão.

**Como usar:** para cada par confirmado manualmente, executar:

```sql
SELECT public.rpc_merge_opponents('<keep_id>', '<delete_id>');
```

A RPC valida que ambos pertencem ao mesmo clube + escalão e migra todos os jogos do `delete_id` para o `keep_id` antes de apagar o duplicado.

---

## Heurística aplicada

Normalização: lowercase + strip diacríticos + remoção de prefixos genéricos (`CF `, `SC `, `GD `, `AD `, `CD `, `UF `, `SP `, `Grupo Desportivo `, `Clube `, `Associação `) + remoção de aspas. Match positivo quando: (a) nomes normalizados iguais, (b) um é prefixo do outro. Só pares no mesmo `club_id` + `age_group_id`.

> Nota: a query do prompt tinha bug — `TRANSLATE` com source/dest desalinhado (dest tinha 6 `o`s contra 5 acentos `o`-variantes), fazendo `ç` mapear para `u`. Corrigido para 1:1 (23 chars cada metade).

## Candidatos a NÃO fazer merge (verificado manualmente)

- **Casa Pia "A"** (age_group `10036f09…`) vs **Casa Pia AC** (age_group `24a4b273…`) — **escalões diferentes** no diagnóstico, ambos opponents legítimos. A query não os apanha (JOIN por age_group). Nada a fazer.
- **Lourel** vs **Lourinhanense** — mesmo escalão mas **clubes distintos** apesar do short `SCL` coincidir. A query não os apanha (não há match de nome normalizado).

---

## Candidatos detectados (1 par)

| Manter | Apagar | Clube | Escalão |
|---|---|---|---|
| `Associação Torre` (`141b437a-9f81-499d-8b37-6221c0afdca8`, short `AST`) | `Torre` (`83c98053-1f41-4d30-82e0-3fc95e96e2e0`, short `AFT`) | `6a01c7bb-90cb-4605-b737-ea45d581c485` | `10036f09-4bf7-4198-9ddf-2ae8f79f418f` |

**Sugestão**: confirmar com Pedro qual o nome canónico do clube ("Associação Torre" ou "Torre"). Os short_names `AST` vs `AFT` divergem — após merge, o `keep_id` mantém `AST`. Se for preferível o short `AFT` (versão mais usada nos placards oficiais), trocar a ordem:

```sql
-- Variante: manter "Torre" + short AFT
SELECT public.rpc_merge_opponents(
  '83c98053-1f41-4d30-82e0-3fc95e96e2e0',  -- keep: Torre (AFT)
  '141b437a-9f81-499d-8b37-6221c0afdca8'   -- delete: Associação Torre (AST)
);
```

---

## Auditoria pós-merge

Após cada execução de `rpc_merge_opponents`, verificar:

```sql
SELECT COUNT(*) FROM public.games WHERE opponent_id = '<keep_id>';
SELECT COUNT(*) FROM public.opponents WHERE id = '<delete_id>'; -- esperado: 0
```
