# Ciclos de dropshipping automáticos y estado de optimización

Responde a: **¿El sistema está ejecutando automáticamente ciclos de dropshipping y ya se encuentra funcionando y optimizado?**

---

## 1. ¿Se ejecutan ciclos automáticamente?

**Depende de la configuración guardada.**

- **Sí**, si en la base de datos la config del Autopilot tiene **`enabled: true`** y el backend arrancó correctamente (Redis + workers ok). En ese caso, al iniciar el servidor se llama a `autopilotSystem.start(userId)` con el primer usuario activo que tenga `paypalPayoutEmail`, y los ciclos se programan solos cada **`cycleIntervalMinutes`** (p. ej. 15 min).
- **No**, si `enabled` es `false` (valor por defecto al instalar). Entonces los ciclos **no** se ejecutan hasta que alguien active el Autopilot (p. ej. desde la UI en **Autopilot** o con `POST /api/autopilot/start`).

**Dónde verlo en la app**

- **Control Center** → sección **System Readiness** → **Ciclos de dropshipping**:
  - **En ejecución**: el Autopilot está corriendo y los ciclos se disparan solos.
  - **Parados**: no hay ciclos automáticos (hay que activar Autopilot o revisar que `enabled` esté en true y que el servidor haya arrancado con esa config).
- **Autopilot** (página): estado "Running" / "Stopped" y **Último ciclo** con fecha/hora.

**Resumen:** Los ciclos son automáticos **solo** cuando el Autopilot está **enabled** y **started**; si no, el sistema está “listo” pero no ejecuta ciclos hasta que lo actives.

---

## 2. ¿Qué hace falta para que esté “funcionando”?

Para que los ciclos de dropshipping se ejecuten solos y el sistema esté “funcionando” en modo automático:

| Requisito | Dónde comprobarlo |
|-----------|-------------------|
| **Redis + Workers ok** | Control Center → System Readiness (Redis, Workers en verde). |
| **Autopilot config con `enabled: true`** | Guardado en `system_config` (key `autopilot_config`) o desde la UI de Autopilot. |
| **Autopilot iniciado** | Al arrancar el backend, si `enabled` es true se hace `start(firstUser.id)`. Si el backend ya estaba arrancado con `enabled: false`, hay que iniciarlo manualmente (Autopilot → Start o `POST /api/autopilot/start`). |
| **Usuario activo con PayPal** | Al menos un usuario con `isActive: true` y `paypalPayoutEmail` no nulo (para que el ciclo corra a nombre de ese usuario). |
| **Marketplace y proveedor configurados** | Control Center muestra “Marketplaces: X configured” y “Supplier: Yes”. |

Si todo eso está ok, **sí** está funcionando en el sentido de que los ciclos se ejecutan automáticamente (búsqueda → oportunidades → validación → publicación según configuración).

---

## 3. ¿Está “optimizado”?

El sistema tiene varias capas de optimización ya implementadas; que estén “activas” depende de config y entorno:

| Componente | Qué hace | Cómo ver si está activo |
|------------|----------|--------------------------|
| **Sales Acceleration Mode** | Precios más agresivos (top 25% más baratos), más publicaciones/día, SEO en títulos. | Control Center → Sales Acceleration Mode: Enabled/Disabled. |
| **Listing lifetime / optimizador** | Ajusta precios y despublica según rendimiento y capital. | Workers ok + colas BullMQ (listing-lifetime-optimizer, product-unpublish). |
| **Profit guard y pricing engine** | No publica si el precio no supera coste + fees (evita pérdidas). | Activo por defecto en el flujo de publicación. |
| **Backoff y límite de fallos** | Si un ciclo falla, el siguiente se retrasa (backoff); tras N fallos el Autopilot se pausa. | Logs y estado del Autopilot (no infinitos ciclos fallidos). |
| **Capital y límites** | `workingCapital`, `maxActiveProducts`, `minProfitUsd`, `minRoiPct` limitan qué se publica. | Config del Autopilot (UI o `system_config`). |

**Conclusión:** El sistema **está preparado para estar optimizado** (precios, márgenes, límites, workers). Que “ya se encuentre optimizado” en la práctica significa: Redis y workers en ok, Autopilot con `enabled: true` y en ejecución, Sales Acceleration activado si quieres ese modo, y parámetros (capital, márgenes, intervalos) ajustados a tu operación.

---

## 4. Cómo comprobar todo de un vistazo

1. **Control Center**
   - **System Readiness**: Database, Redis, Workers, Autonomous mode.
   - **Ciclos de dropshipping**: “En ejecución” = ciclos automáticos activos; “Parados” = no se están ejecutando.
   - **Último ciclo**: si hay fecha reciente, los ciclos se están disparando.

2. **Autopilot (página)**
   - Estado Running/Stopped, último run, métricas (oportunidades, publicados).

3. **Script (opcional)**  
   Desde `backend/`:  
   `npm run check-autopilot-and-sales`  
   (con `API_BASE_URL` y credenciales en `.env`). Muestra si el Autopilot está corriendo y cuenta de ventas.

---

**En una frase:** El sistema **ejecuta ciclos de dropshipping automáticamente** cuando el Autopilot está **enabled** y **started** (y Redis/workers ok). Que esté **funcionando y optimizado** se comprueba en Control Center (Ciclos de dropshipping + Sales Acceleration + readiness) y en la página Autopilot (estado y último ciclo). La venta demo que se añadió antes **no** es necesaria para que los ciclos corran; solo servía para mostrar “Generando utilidades: Sí” cuando aún no hay ventas reales.
