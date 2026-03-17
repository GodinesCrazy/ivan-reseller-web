# Phase 34 — UX Improvement Plan (Conversion & Trust)

Structured plan from the Full UX Audit + Conversion UX Engine. Focus: clarity, trust, profit visibility, decision speed.

---

## Problems detected (from codebase audit)

| # | Problem | Where |
|---|--------|--------|
| 1 | Profit is not the primary metric on Dashboard; revenue appears first | Dashboard overview grid |
| 2 | No single "What should I do now?" block; actions are scattered | Dashboard, Control Center |
| 3 | No decision blocks (Scale Now / Optimize Now / Remove Now) for listings | Products, listing views |
| 4 | Data freshness / source not shown on key metrics | Dashboard, Finance, Sales |
| 5 | Some cards use inconsistent dark mode (e.g. `bg-white` without dark variant) | Dashboard overview |
| 6 | Listing health score (0–100) not exposed in UI | Products / listings |
| 7 | Alerts (low conversion, no impressions, unprofitable) not centralized | Multiple pages |
| 8 | Conversion indicators (CTR, conversion rate, velocity) not prominent | Listing/product views |

---

## Solutions and expected impact

| # | Solution | Expected impact |
|---|----------|-----------------|
| 1 | Make profit the first and most prominent metric on Dashboard; add link to Finanzas | Users see profit in &lt;5s; clearer revenue hierarchy |
| 2 | Add an "Acciones recomendadas" or "Qué hacer ahora" section using existing strategy/scaling/optimization data | Faster decisions |
| 3 | Introduce decision blocks (Scale / Optimize / Remove) fed by existing analytics APIs | Clear next actions per listing |
| 4 | Add "Actualizado hace X" or "Fuente: API" on dashboard stats and key financial widgets | Trust, fewer doubts about data |
| 5 | Unify card styles (dark mode) across Dashboard overview | Consistency, readability |
| 6 | Surface listing health/score from backend or computed from visibility + conversion + profit | One number to prioritize |
| 7 | Centralize alerts in a small panel (Dashboard or Control Center) from existing diagnostics | Single place for issues |
| 8 | Show CTR, conversion, velocity in product/listing cards or detail | Conversion-focused decisions |

---

## Implementation order (Phase 34)

1. **Profit-centric Dashboard** — Profit first, larger or highlighted; revenue second; link to Finance.
2. **Dashboard card consistency** — Dark mode and border for all overview cards.
3. **Data freshness indicator** — Optional "Actualizado hace X min" on dashboard stats (from last fetch).
4. **Action-oriented block** — "Qué hacer ahora" using existing auto-listing decisions, scaling actions, conversion actions.
5. **Decision blocks (Scale / Optimize / Remove)** — New section or tab that classifies listings; backend may need a simple classifier or use existing scores.
6. **Alerts panel** — Aggregate from business-diagnostics and listing/product issues.
7. **Listing health score** — Backend endpoint + UI badge or column.
8. **Conversion indicators** — In product/listing tables or detail.

---

## Status

- [x] Plan documented
- [x] Profit-first Dashboard (profit card first, visual emphasis)
- [x] Card dark mode consistency (all overview cards + icon backgrounds)
- [x] Data freshness on dashboard (indicator text)
- [x] "Qué hacer ahora" block (scaling, optimization, strategy counts + CTAs)
- [x] Decision blocks UI (Scale Now / Optimize Now / Remove Now)
- [x] Alerts panel
- [x] Listing health score (Reports: columna Salud 0–100; Products pendiente si se desea)
- [x] Conversion indicators in listing views (Reports: CTR + Conv.% + Salud)

## Page audit (Phase 34)

Páginas **revisadas y mejoradas** en esta fase:

- **Dashboard:** Profit-first, card consistency, freshness, "Qué hacer ahora", decision blocks, alertas — done.
- **Control Center:** Modo autónomo labels, data-source note — done.
- **Reports:** totalProfit, listing analytics con CTR, Conv.%, Salud (0–100) — done.
- **Sales:** totalProfit, profit per sale; structure OK.
- **Products:** profit per product; decision blocks en Dashboard; health en Reports. Opcional: badge Salud en Products si se cargan métricas.
- **Settings:** Config-focused; no UX changes in this pass.

---

## Todas las páginas y menús (mapa completo)

Todas las rutas listadas fueron revisadas en Phase 34 (inicial o extensión). En la **extensión** se aplicó: dark mode en cards/tablas, nota de frescura donde aplica, profit first en Finanzas, enlace a alertas en Órdenes.

| Menú / Ruta | Página | Auditado Phase 34 |
|-------------|--------|-------------------|
| **Flujo principal** | | |
| `/dashboard` | Panel | Sí |
| `/control-center` | Control Center | Sí |
| `/dashboard?tab=trends` | Ciclo (Tendencias) | (mismo Dashboard) |
| `/opportunities` | Oportunidades | Sí (extensión) |
| `/autopilot` | Autopilot | Sí (extensión) |
| **Catálogo y ventas** | | |
| `/products` | Productos | Sí |
| `/sales` | Ventas | Sí |
| `/orders` | Órdenes | Sí (extensión) |
| `/checkout` | Checkout | Sí (extensión) |
| `/pending-purchases` | Compras pendientes | Sí (extensión) |
| **Finanzas** | | |
| `/commissions` | Comisiones | Sí (extensión) |
| `/finance` | Finanzas | Sí (extensión) |
| **Herramientas** | | |
| `/flexible` | Dropshipping flexible | Sí (extensión) |
| `/publisher` | Publicador inteligente | Sí (extensión) |
| `/jobs` | Trabajos | Sí (extensión) |
| `/reports` | Reportes | Sí |
| **Administración** (ADMIN) | | |
| `/users` | Usuarios | Sí (extensión) |
| `/logs` | Registros del sistema | Sí (extensión) |
| **Configuración** | | |
| `/regional` | Configuración regional | Sí (extensión) |
| `/system-status` | Estado del sistema | Sí (extensión) |
| `/workflow-config` | Config. workflows | Sí (extensión) |
| `/settings` | Configuración | Sí |
| `/api-settings` | API Settings | Sí (extensión) |
| `/meeting-room` | Sala de reuniones | Sí (ya tenía dark) |
| `/help` | Centro de ayuda | Sí (extensión) |
| `/onboarding` | Asistente de configuración | Sí (ya tenía dark) |
| **Rutas sin entrada en sidebar** | | |
| `/opportunities/history` | Historial oportunidades | Sí (extensión) |
| `/opportunities/:id` | Detalle oportunidad | Sí (extensión) |
| `/product-research` | Product Research | Sí (extensión) |
| `/products/:id/preview` | Vista previa producto | Sí (extensión) |
| `/orders/:id` | Detalle orden | Sí (extensión) |
| `/api-config` | API Configuration | Sí (extensión) |
| `/api-keys` | API Keys | Sí (extensión) |
| `/other-credentials` | Otras credenciales | Sí (extensión) |
| `/admin` | Admin Panel | Sí (extensión) |
| `/help/apis`, `/help/docs`, `/help/investors` | Subsecciones ayuda | Sí (extensión) |
| `/diagnostics` | Diagnósticos | Sí (extensión) |
| `/request-access`, `/manual-login`, `/resolve-captcha`, `/setup-required` | Auth / onboarding | Sí (extensión, dark contenedor) |

**Resumen:** Todas las páginas y menús del frontend han sido revisadas en Phase 34. Extensión: dark mode unificado, frescura de datos donde aplica, profit first en Finanzas, enlace "Ver alertas en Panel" en Órdenes cuando hay fallos.
