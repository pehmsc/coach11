# Design Pattern Report

## Contexto
Este relatório documenta a refatoração aplicada para reduzir acoplamento, melhorar manutenibilidade e manter paridade funcional da app.

## Refatorações executadas

### 1) Extração de controller hook e subcomponentes da página live
Aplicado em `src/app/(dashboard)/games/[id]/live/page.tsx`.

- Hook extraído:
  - `src/lib/hooks/useGameLiveController.ts`
  - Centraliza lógica de scoreboard/gating (`liveUnlocked`, labels de scoreboard e metadata do jogo).
- Subcomponentes extraídos:
  - `src/components/games/live/LiveScreenStates.tsx`
  - `src/components/games/live/LiveScoreboardCard.tsx`
- Resultado:
  - Redução de complexidade visual da página live.
  - Separação entre lógica de composição e renderização de UI recorrente.

### 2) Split do endpoint de calendário por handlers + service
Aplicado no domínio `api/calendar/events`.

- Route fina:
  - `src/app/api/calendar/events/route.ts`
- Handlers por método:
  - `src/app/api/calendar/events/handlers/get.ts`
  - `src/app/api/calendar/events/handlers/post.ts`
  - `src/app/api/calendar/events/handlers/patch.ts`
  - `src/app/api/calendar/events/handlers/delete.ts`
- Service dedicado:
  - `src/lib/services/calendar-events.service.ts`
- Resultado:
  - `route.ts` deixou de concentrar regras de negócio.
  - Fluxo por método ficou explícito e testável por responsabilidade.

### 3) Consolidação de `extractRequestIp`
Removida duplicação entre `lib/http` e `lib/public-share`.

- Fonte única:
  - `src/lib/http/request-ip.ts`
- Ajustes:
  - `HeaderBag` passou a ser exportado.
  - `src/lib/public-share.ts` passou a reutilizar `extractRequestIp` central.
- Resultado:
  - Evita drift entre implementações iguais.
  - Mantém compatibilidade via re-export em `public-share`.

### 4) Introdução de repository layer (domínios críticos)

#### Calendário
- `src/lib/repositories/calendar-events.repository.ts`
- `src/lib/services/calendar-events.service.ts` passou a usar repository para queries/mutações principais.

#### Notificações
- `src/lib/repositories/notifications.repository.ts`
- `src/lib/notifications/service.ts` passou a delegar inserts/delete ao repository.

#### Convocações
- `src/lib/repositories/convocation.repository.ts`
- `src/app/api/games/[id]/convocation/tactical/route.ts` passou a usar repository para RPC tático.

## Padrões reforçados

- **Route Handler Thin Controller**: rotas com delegação para handlers/services.
- **Service Layer**: regras de negócio centralizadas em serviços (`calendar-events.service`).
- **Repository Pattern**: acesso a dados encapsulado por domínio (calendar/notifications/convocation).
- **Presentation Components**: componentes UI extraídos da página live.
- **Single Responsibility**: separação de responsabilidades por camada.

## Garantia de não impacto funcional
Validação executada após refatoração:

- `pnpm lint`:
  - sem erros
  - 2 warnings preexistentes de `<img>` em páginas não alteradas
- `pnpm test --run`:
  - 8 suites passadas
  - 45 testes passados
- `pnpm build`:
  - build Next.js concluído com sucesso

## Observações finais
A refatoração preservou contratos de API, payloads e códigos de resposta dos endpoints alterados, mantendo comportamento funcional e adicionando estrutura para evolução incremental com menor risco.
