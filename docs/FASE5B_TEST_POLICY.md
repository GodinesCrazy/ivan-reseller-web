# Política de Tests Frontend — Fase 5B
**Fecha:** 2026-04-06

---

## Estado actual

| Suite | Runner | Tests | Estado |
|---|---|---|---|
| `src/utils/__tests__/currency.test.ts` | Vitest | 15 | ✅ PASS |
| `src/utils/operational-lifecycle.test.ts` | Vitest | 6 | ✅ PASS |
| `src/pages/intelligentPublisher/publishRowGuards.test.ts` | Vitest | 8 | ✅ PASS |
| `src/hooks/useLiveData.test.tsx` | Vitest | 2 | ✅ PASS |
| `src/utils/simulated-order-id.test.ts` | Vitest | 3 | ✅ PASS |
| `e2e/autopilot-start.spec.ts` | **Playwright** | — | Aislado correctamente |
| `e2e/order-fulfillment.spec.ts` | **Playwright** | — | Aislado correctamente |

**Total vitest:** 34/34 PASS

---

## Correcciones aplicadas

### 1. E2E Playwright excluidos de Vitest
**Problema:** Los archivos `e2e/*.spec.ts` eran recolectados por Vitest, causando error  
`"Playwright Test did not expect test.describe() to be called here."`

**Fix en `vitest.config.ts`:**
```ts
exclude: ['node_modules/**', 'e2e/**']
```

**Cómo correr E2E:**
```bash
cd frontend
npx playwright test                      # requiere backend activo
npx playwright test --project=chromium  # solo Chrome
E2E_LOGIN_USER=... E2E_LOGIN_PASSWORD=... npx playwright test
```

### 2. React 18.3 + act() en production build
**Problema:** React 18.3.1 carga el bundle CJS de producción si `process.env.NODE_ENV` no está  
explícitamente definido en el contexto de Vitest, y el bundle de producción lanza:  
`"act(...) is not supported in production builds of React."`

**Fix en `vitest.config.ts`:**
```ts
define: {
  'process.env.NODE_ENV': JSON.stringify('test'),
}
```

### 3. useLiveData.test.tsx — avance de timers con act()
**Fix:** Envolver `vi.advanceTimersByTime()` en `act()` para cumplir con React 18 scheduling.

---

## Política de tests

### Tests unitarios (Vitest) — deben pasar SIEMPRE
Son la barrera de calidad mínima. Deben pasar antes de cualquier deploy.

```bash
cd frontend && npm run test -- --run
```

### Tests E2E (Playwright) — se corren manualmente antes de compra
Requieren backend activo, ML credentials, y usuario de prueba.  
NO bloquean CI pero DEBEN pasar antes de una compra controlada.

### Nuevos tests a agregar (prioridad post-fase 5B)
1. Test para `PendingPurchases` — render con mock de capital y orden
2. Test para `preflight` checks — validar que blockers se muestran
3. Test para `publishRowGuards` (ya existe y pasa — mantener)
4. Test E2E: flujo login → ver listing activo → verificar no hay blockers

---

## Comando canónico de validación

```bash
# Desde frontend/
npm run type-check && npm run test -- --run && npm run build
```

Resultado esperado: 0 errores typecheck, 34/34 tests, build ✓
