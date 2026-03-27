# Intelligent Publisher — runtime fix tests

## Commands run

From `frontend/`:

```bash
npm run build
npx vitest run src/pages/intelligentPublisher/publishRowGuards.test.ts
```

## Result (representative run)

- Build: succeeded (`vite build`).
- Vitest: `publishRowGuards.test.ts` — **8 tests passed** (includes loading, missing truth, `missingSku`, `agentTrace.blocking`, `publicationReadinessState: BLOCKED`, whitespace-only `blockerCode`, ML canary candidate rules).

## Optional extensions

- Component test for `PendingProductCard` marketplace reset on `rowBlockedVisual` (React Testing Library) if the team wants UI-level regression coverage beyond guards.
