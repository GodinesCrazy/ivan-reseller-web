# FASE 7 ? VALIDACIÓN DEL CICLO DE USUARIO COMPLETO

**Flujo: usuario nuevo ? login ? onboarding ? connect PayPal ? connect AliExpress ? activate autopilot ? view dashboard.**

---

## Pasos verificados (código real)

| Paso | Acción | Frontend | Backend | Estado |
|------|--------|----------|---------|--------|
| 1 | Login | Login.tsx ? authApi.login() | POST /api/auth/login (auth.routes) ? cookie JWT + user | OK (rutas auth corregidas a /api/auth/*) |
| 2 | Onboarding | OnboardingWizard, redirect si !onboardingCompleted | GET /api/onboarding/status, POST /api/onboarding/paypal, connect-marketplace, complete-step, finish | OK (onboarding.routes) |
| 3 | Connect PayPal | Settings/APISettings, OnboardingWizard | POST /api/credentials (apiName: paypal), GET /api/credentials/status | OK |
| 4 | Connect AliExpress | APISettings, authStatusStore | GET /api/marketplace-oauth/start/aliexpress, /aliexpress/callback, GET /api/auth-status | OK |
| 5 | Activate autopilot | Autopilot.tsx | POST /api/autopilot/start, GET /api/autopilot/status, GET /api/autopilot/workflows | OK (autopilot.routes, autopilot.service start(userId)) |
| 6 | View dashboard | Dashboard.tsx | GET /api/dashboard/stats, recent-activity, GET /api/opportunities/list, GET /api/ai-suggestions, GET /api/automation/config | OK (datos reales; ver DASHBOARD_VALIDATION_REPORT) |

---

## Posibles puntos de fallo

- **Login en desarrollo:** Antes las rutas eran `/auth/login`; con baseURL `http://localhost:4000` daba 404. **Corregido:** auth.api.ts usa `/api/auth/login` (y resto de rutas /api/auth/*).
- **Setup required:** Si el backend responde setup_required, useSetupCheck redirige a /setup-required; el dashboard no debe bloquear la app si una llamada devuelve setup_required (Dashboard.tsx ya evita marcar error solo por eso).
- **Onboarding completo:** Autopilot exige onboardingCompleted (autopilot.service runSingleCycle comprueba User.onboardingCompleted); si no está completo lanza ONBOARDING_INCOMPLETE.

---

## Resumen

El flujo usuario nuevo ? login ? onboarding ? conectar PayPal ? conectar AliExpress ? activar autopilot ? ver dashboard está respaldado por endpoints y servicios reales. La única corrección aplicada en esta auditoría fue la de las rutas de auth en el frontend.
