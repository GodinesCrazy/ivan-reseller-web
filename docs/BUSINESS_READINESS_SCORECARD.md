# Business readiness scorecard (ejecutivo)

**Leyenda verificación:** V = Verificado (código/repo), P = Parcialmente verificado, NV = No verificado (prod / E2E real).

| Área | Estado actual | Verificación | Severidad máx. en área | Bloquea prueba real | Bloquea escalado SaaS | Próxima acción |
|------|---------------|--------------|-------------------------|---------------------|----------------------|----------------|
| Ciclo E2E dropshipping (código) | Pipeline definido webhook→fulfill | P | Alta (depende config) | Depende OAuth/webhook/capital | Sí | Runbook prueba + checklist credenciales |
| Imágenes ML canónico P76–P86 | Integrado en publish + fail-closed | V | Media | No si pack OK | No | Exponer trace floor en UI producto |
| Pricing / márgenes | Múltiples servicios; fees simplificados | P | **Alta** | **Recomendado sí** | **Sí** | Unificar fuente precio + fees MLC reales |
| Traducción / idioma CL | Policy + context | P | Media | Revisión manual título | Parcial | Traducción o plantilla ES obligatoria |
| Publicación ML | Publisher + imágenes + bloqueos | V | Media | No | No | — |
| “Visibilidad” / ranking | Sin garantía; agente opcional | NV | Baja | No | No | Métricas post-publish honestas |
| Postventa automática | Código presente | P | Alta | **Sí** si webhook/DS fallan | Sí | Probar webhook firmado + orden real sandbox |
| UI verdad operativa | Mixta; partes muy honestas | P | Media | No | Parcial | Panel pre-flight publish |
| Despliegue / SRE | Scripts Railway en repo | NV | ? | NV | NV | `release-check` / smoke prod documentado |
| Seguridad webhooks / secrets | Middleware firma ML/eBay | V (código) | Alta | NV en prod | Sí | Rotación secretos + prueba penetración básica |

---

## Resumen numérico (subjetivo, basado en evidencia código)

- **Preparación lógica del ciclo:** ~**70–80%** (fuerte backend, dependencias externas no probadas aquí).
- **Preparación económica confiable:** ~**50–60%** (hasta alinear pricing).
- **Preparación UX operativa:** ~**55–65%** (truth parcial, falta panel integral).

*Estos porcentajes son orientativos, no métricas instrumentadas.*
