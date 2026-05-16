# Plan Premium Visual Para CJ-Shopify USA

## Resumen

Objetivo: llevar todas las páginas del módulo `CJ-Shopify USA` a una experiencia premium, consistente y comercial, sin cambiar reglas críticas de negocio ni activar automatizaciones nuevas. La mejora se enfocará en jerarquía visual, lectura ejecutiva, foco en ventas y reducción de ruido.

El patrón único será:

`Estado actual → acción recomendada → señales comerciales → cola de decisiones → tabla/detalle operativo`

## Cambios Clave

### 1. Sistema Visual Premium Común

- Ampliar `CommercialCockpit` con componentes reutilizables:
  - `PremiumSectionHeader`
  - `DecisionTabs`
  - `CompactDataPanel`
  - `SignalBadge`
  - `ProductSignalRow`
  - `EmptyCommercialState`
- Mantener el estilo dark cockpit actual, cards `8px`, tablas densas, chips de estado, lucide icons y acciones arriba.
- Reducir duplicación visual: cada página debe iniciar con `CommercialPageHeader`, `ActionPriorityBand`, métricas accionables y una sección principal.
- Corregir inconsistencias heredadas: cards demasiado grandes, tablas con estilos viejos, textos largos sin jerarquía y secciones técnicas antes de decisiones comerciales.

### 2. Mejoras Por Página

- **Overview**
  - Convertir el hero/pipeline en resumen ejecutivo más limpio.
  - Priorizar: escalar ganadores, corregir productos, proteger margen, rotar sin tracción.
  - Reducir métricas secundarias debajo del primer viewport.

- **Discover**
  - Hacer que se parezca más a una mesa de oportunidades premium.
  - Cada candidato mostrará: problema PET que resuelve, margen, stock/envío USA, riesgo, score y acción.
  - Separar claramente `Buscar → Evaluar → Draft → Publicar`.
  - Mejor empty state para búsqueda PET preseleccionada.

- **Productos CJ**
  - Compactar la página para que la tabla sea protagonista.
  - Mover detalles técnicos/configuración a paneles colapsables.
  - Agregar badges visibles: `posible ganador`, `requiere shipping`, `margen débil`, `bloqueado`, `draft/listing`.

- **Listings / Store Products**
  - Reforzar como “mesa de trading comercial”.
  - Filtros premium por `Escalar`, `Optimizar`, `Proteger`, `Rotar`, `Publicables`.
  - En cada fila destacar acción recomendada, score, margen, ventas 30d, señales y Profit Guard.
  - Mantener drawer y acciones masivas seguras.

- **Sales Agent**
  - Reorganizar en pestañas internas:
    - `Ahora`
    - `Escalar`
    - `Corregir`
    - `Proteger`
    - `Aprendizaje`
  - La primera vista debe mostrar solo decisión principal, métricas y top acciones.
  - Mover memoria, trazas y evidencia larga hacia secciones inferiores o pestañas.
  - Mantener toda la información existente, pero con menos saturación inicial.

- **Analytics**
  - Convertir Sales Intelligence por producto en bloque principal.
  - Mostrar ranking accionable: vistas, carrito, checkout, compra, margen y decisión.
  - Conectar visualmente con Sales Agent mediante CTA claro.

- **Profit**
  - Reforzar comparación `precio publicado vs costo actual`.
  - Mostrar primero cola: `subir precio`, `pausar`, `mantener`, `revisar shipping`.
  - Mantener tabla financiera como soporte, no como lectura principal.

- **Automation**
  - Mostrar subciclos como cards compactas:
    - publicación
    - Profit Guard
    - higiene comercial
    - postventa
    - social orgánico
    - experimentos
    - aprendizaje
  - Cada subciclo tendrá estado, último resultado y acción disponible.

- **Orders / Order Detail / Post Venta**
  - Unificar look postventa: riesgo SLA, tracking, pago CJ y reputación arriba.
  - Order Detail debe iniciar con hero/status y acciones rápidas; eventos/evidencia abajo.
  - Post Venta conservará riesgo predictivo como sección principal.

- **Settings, Alerts, Logs, Social**
  - Settings: separar bloques `Pricing`, `Higiene`, `Experimentos`, `Preview impacto`.
  - Alerts: agrupar por impacto `dinero`, `reputación`, `publicación`, `integración`.
  - Logs: mejorar filtros/chips y densidad, sin perder lectura técnica.
  - Social: mostrar campañas orgánicas como parte del ciclo comercial y priorizar productos con señales.

## Implementación

- No crear migraciones nuevas para esta pasada visual.
- No cambiar endpoints salvo que falte un dato ya disponible en backend; preferir reutilizar:
  - `/sales-agent`
  - `/analytics/sales-intelligence`
  - `/cleanup/preview`
  - `/profit/price-risk`
  - `/post-sale/risk-dashboard`
- Mantener todas las acciones existentes y sus guardrails.
- No activar auto-pausa, auto-publicación ni experimentos por defecto.
- Prioridad de implementación:
  1. Mejorar componentes compartidos premium.
  2. Rehacer primera pantalla de `Sales Agent`.
  3. Pulir `Discover`, `Products`, `Listings`.
  4. Pulir `Profit`, `Analytics`, `Automation`.
  5. Ajustar `Orders`, `Order Detail`, `Post Sale`.
  6. Pasada final en `Settings`, `Alerts`, `Logs`, `Social`.

## Test Plan

- Ejecutar:
  - `backend npm run type-check`
  - `backend npm run build`
  - `frontend npm run type-check`
  - `frontend npm run build`
- Smoke visual manual:
  - `/cj-shopify-usa/overview`
  - `/cj-shopify-usa/discover`
  - `/cj-shopify-usa/products`
  - `/cj-shopify-usa/listings`
  - `/cj-shopify-usa/sales-agent`
  - `/cj-shopify-usa/analytics`
  - `/cj-shopify-usa/profit`
  - `/cj-shopify-usa/automation`
  - `/cj-shopify-usa/orders`
  - `/cj-shopify-usa/post-sale`
  - `/cj-shopify-usa/settings`
- Criterios de aceptación:
  - Cada página tiene acción recomendada visible arriba.
  - La primera pantalla no se siente técnica ni saturada.
  - Discover, Products y Listings se ven como partes del mismo sistema.
  - Sales Agent queda como centro premium, claro y accionable.
  - No hay placeholders ni secciones visualmente heredadas dominantes.
  - Build completo pasa.
  - Deploy Vercel y Railway quedan en `Ready/SUCCESS`.

## Supuestos

- La mejora es visual/comercial, no una reescritura de lógica.
- El nicho PET USA sigue siendo el foco principal.
- No se agregan nuevas automatizaciones destructivas.
- No se elimina información; se reorganiza por prioridad.
- El módulo debe verse premium sin perder densidad operativa.
