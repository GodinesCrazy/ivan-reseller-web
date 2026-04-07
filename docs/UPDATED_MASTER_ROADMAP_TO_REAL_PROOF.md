# Roadmap maestro actualizado — Hasta prueba real y luego escala

**Principio:** Solo trabajo que **cierra gaps** hacia prueba E2E con dinero real y luego SaaS multi-usuario. Orden = dependencias primero.

---

## Fase 0 — Pre-flight (1–3 días, equipo + entorno)

| # | Entrega | Tipo | Bloquea prueba real |
|---|---------|------|---------------------|
| 0.1 | Checklist credenciales ML + webhook + AliExpress DS + Railway/DB | Prerequisite | **Sí** |
| 0.2 | Runbook de prueba (SKU sugerido, quién compra, ventana de observación) | Prerequisite | **Sí** |
| 0.3 | Smoke `release-check` / health backend | Prerequisite | Recomendado |

---

## Fase 1 — Economía confiable (bloqueante calidad)

| # | Entrega | Tipo |
|---|---------|------|
| 1.1 | **Single source of truth** precio publicado: documentar y codificar ruta única desde oportunidad → producto → publish | Prerequisite prueba real |
| 1.2 | Fees / impuestos **MLC** revisados contra documentación oficial ML + moneda | Prerequisite prueba real |
| 1.3 | Test automatizado o script que compare `suggestedPrice` vs `publishProduct` price para SKU fixture | Prerequisite escalado |

---

## Fase 2 — Postventa probada (bloqueante confianza)

| # | Entrega | Tipo |
|---|---------|------|
| 2.1 | Prueba webhook ML en staging con payload real o fixture firmado | Prerequisite prueba real |
| 2.2 | Prueba `fulfillOrder` contra DS sandbox / orden de bajo monto con supervisión | Prerequisite prueba real |
| 2.3 | Alertas si `FAILED` o `MANUAL_ACTION_REQUIRED` (ya hay notificaciones — validar que lleguen) | Prerequisite prueba real |

---

## Fase 3 — UX operativa (no siempre bloqueante)

| # | Entrega | Tipo |
|---|---------|------|
| 3.1 | Panel “ML publish readiness”: publishSafe, commercialFloorPass, trace resumido | Mejora importante |
| 3.2 | Pre-flight página antes de “Publicar” con checklist credenciales + precio + idioma | Mejora importante |
| 3.3 | Unificar mensajes cuando autopilot vs manual | Mejora |

---

## Fase 4 — Escala SaaS (después de prueba real exitosa)

| # | Entrega | Tipo |
|---|---------|------|
| 4.1 | Multi-tenant aislamiento credenciales (auditoría ya parcial en credentials-manager) | Prerequisite escalado |
| 4.2 | Límites rate + costos API por usuario | Prerequisite escalado |
| 4.3 | Métricas negocio reales (no solo analytics) en dashboard | Mejora importante |

---

## Trabajo explícitamente **fuera** de este roadmap (hasta tener prueba)

- Nuevas features cosméticas dashboard.
- Promesas de “ranking ML” sin medición.
- Rediseño pipeline imágenes (ya está en madurez alta — solo calibración P86+).

---

## Hitos

- **Hito A:** Fase 0–1 completas → listo para publicar con confianza económica.
- **Hito B:** Fase 2 probada en staging → listo para compra tercero supervisada.
- **Hito C:** Prueba real OK → iniciar Fase 4.
