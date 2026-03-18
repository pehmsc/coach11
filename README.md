This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Web Push

Web Push usa:
- `NEXT_PUBLIC_ENABLE_WEB_PUSH=true`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY=...`
- `VAPID_PRIVATE_KEY=...`
- `VAPID_SUBJECT=mailto:...`
- `PUSH_TEST_SECRET=...` opcional para `/api/push/test`

### Base de dados

Aplicar migrations Supabase antes de testar Web Push:

```bash
supabase db push
```

Se o backend devolver `PGRST205` / `Could not find the table 'public.push_subscriptions' in the schema cache`:
1. confirmar que a migration `push_subscriptions` foi aplicada
2. no Supabase Dashboard ir a `Settings > API`
3. clicar `Reload schema`
4. aguardar alguns segundos e testar novamente

### Teste rápido iPhone

1. Instalar a PWA via Safari `Partilhar -> Adicionar ao Ecrã principal`
2. Abrir a app instalada
3. Ativar notificações push no menu/definições
4. Confirmar que a UI muda para `Notificações push ativas`
5. Testar envio manual:

```bash
curl -X POST https://coach11.app/api/push/test \
  -H "x-push-test-secret: $PUSH_TEST_SECRET" \
  -H "Content-Type: application/json" \
  --cookie "..." \
  -d '{"title":"Teste Coach11","body":"Push de teste","url":"/notifications"}'
```

## Domain Guardrails

O domínio funcional é `age_group`-first. `clubs`, `club_memberships` e `team_staff`
existem apenas como compatibilidade técnica.

- referência curta: [docs/domain-boundaries.md](/Users/pedrocampos/Project_2026/coach11/docs/domain-boundaries.md)
- guard automático: `pnpm run guard:architecture`
- `pnpm lint` já inclui este guard

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
