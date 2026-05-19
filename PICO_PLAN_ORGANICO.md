# Plan Inteligente de Crecimiento Orgánico (P.I.C.O)
**Proyecto:** PawVault (Ivan Reseller Web)
**Objetivo:** Desarrollar e integrar módulos avanzados de Inteligencia Artificial para automatizar la atracción de tráfico orgánico pasivo y escalable.

---

## 🏗️ Fase 1: Creación Autónoma de Blogs (SEO de Contenido)
**Estado:** `[Integrado en código / pendiente activación producción]`

**Descripción:** Un sub-agente especializado (`BloggingAgent`) que generará artículos optimizados para los buscadores (Google) atrayendo tráfico educativo hacia los productos ganadores.

**Tareas a Ejecutar:**
- [x] 1.1 **Arquitectura de Base de Datos:** Crear modelo `ShopifyBlogEntry` en Prisma para registrar los posts generados y rastrear su estado.
- [x] 1.2 **Identificación de Keywords:** Integrar un paso en el *Sales Agent* que tome los productos con alto "Commercial Score" y solicite una palabra clave de "problema/solución" al LLM.
- [x] 1.3 **Pipeline de Generación (LLM):** Prompts de sistema para redactar un blog de 500-800 palabras con estructura HTML (`<h1>`, `<h2>`, `<p>`).
- [x] 1.4 **Integración Shopify API:** Utilizar la API REST de Shopify para crear las entradas del blog directamente bajo el blog principal del tema.
- [ ] 1.5 **Pruebas y Despliegue:** Ejecutar primer dry-run/acción manual en Railway con `OPENAI_API_KEY` y Shopify activos.

---

## 🔄 Fase 2: Auto-Optimización Dinámica (SEO Evolutivo)
**Estado:** `[Integrado en código / pendiente validación con listings reales >30 días]`

**Descripción:** Un sistema de auditoría recurrente (`EvolutionarySEOAgent`) que medirá si un producto se está vendiendo/visitando; si no, re-estructurará su metadata de forma autónoma.

**Tareas a Ejecutar:**
- [x] 2.1 **Métricas de Performance:** Usar ventas/ordenes locales como señal inicial de performance.
- [x] 2.2 **Cron de Auditoría 30-Días:** Escanear productos activos con más de 30 días sin ventas y sin `lastSeoUpdate` reciente.
- [x] 2.3 **A/B Testing Engine:** Reescritura LLM de título/descripción enfocada en una nueva intención de compra.
- [x] 2.4 **Update y Registro:** Actualizar `cjShopifyUsaListing.lastSeoUpdate`, guardar payload de refresh y empujar el cambio con `cjShopifyUsaAdminService.updateProductDetails`.

---

## 🎥 Fase 3: Expansión Multi-Canal (TikTok e Instagram Automatizado)
**Estado:** `[Integrado en código / publicación social depende de OAuth tokens]`

**Descripción:** Un módulo de video-marketing que transforme las imágenes de catálogo de CJ Dropshipping en videos atractivos para redes sociales.

**Tareas a Ejecutar:**
- [x] 3.1 **Asset Collector:** Recolectar 3-5 imágenes desde el payload/listing del producto.
- [x] 3.2 **Video AI Integration:** Integrar Creatomate para render en la nube compatible con Railway.
- [x] 3.3 **Generación de Copy/Hashtags:** Generar caption y hashtags con LLM.
- [x] 3.4 **Publicación Social API:** Conectar publishers TikTok, Instagram y Pinterest con estado degradado si faltan tokens.

---

## 🚀 Fase 4: Despliegue en Producción (Railway)
**Estado:** `[Casi listo / falta aplicar migración y activar credenciales en Railway]`

- [x] 4.1 **Actualización de variables `.env`**: `.env.example` incluye `OPENAI_API_KEY`, `CREATOMATE_API_KEY`, `TIKTOK_ACCESS_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `PINTEREST_ACCESS_TOKEN`, `PINTEREST_BOARD_ID`.
- [x] 4.2 **Sincronización al `SalesAgent`**: Módulo *PICO* conectado al ciclo del Sales Agent y al procesamiento de backlog de video.
- [x] 4.3 **Monitoreo en Vivo**: Endpoint `GET /api/cj-shopify-usa/pico/status`, acción `POST /api/cj-shopify-usa/pico/video/process-backlog`, panel UI y script `npm run pico:status`.
- [ ] 4.4 **Migración producción:** Aplicar `backend/prisma/migrations/20260517120000_pico_organic_growth/migration.sql` con `npm run prisma:migrate:deploy`.
- [ ] 4.5 **Primer ciclo supervisado:** Ejecutar una acción manual PICO desde el Agente Vendedor y verificar trazas recientes.

---

## Runbook de activación PICO en Railway

1. Aplicar migración:
   ```bash
   cd backend
   npm run prisma:migrate:deploy
   ```
   En Railway el deploy debe ejecutar automaticamente `node scripts/railway-migrate-deploy.js` como `preDeployCommand`, con `connection_limit=1` y reintentos ante `too many clients`.

2. Configurar variables mínimas:
   ```bash
   OPENAI_API_KEY=...
   CREATOMATE_API_KEY=...
   CREATOMATE_TEMPLATE_ID=... # opcional
   ```

3. Configurar variables sociales cuando estén aprobadas las apps:
   ```bash
   TIKTOK_ACCESS_TOKEN=...
   INSTAGRAM_ACCESS_TOKEN=...
   INSTAGRAM_BUSINESS_ACCOUNT_ID=...
   PINTEREST_ACCESS_TOKEN=...
   PINTEREST_BOARD_ID=...
   ```

4. Validar readiness desde terminal:
   ```bash
   cd backend
   API_BASE_URL=https://<railway-backend> AUTOPILOT_LOGIN_USER=<admin> AUTOPILOT_LOGIN_PASSWORD=<password> npm run pico:status
   ```
   Si el backend HTTP o login no esta disponible, validar directo contra la BD:
   ```bash
   cd backend
   PICO_USER_ID=1 npm run pico:status:db
   ```

5. Ejecutar primer ciclo manual:
   - UI: Agente Vendedor -> Proteger -> accion `PROMOTE_VIA_BLOG`, `EVALUATE_STAGNANT_LISTINGS` o `PROMOTE_VIA_VIDEO`.
   - API: `GET /api/cj-shopify-usa/pico/status` para revisar candidatos, readiness y actividad reciente.

## OAuth TikTok/Meta/Pinterest

- TikTok: crear app en TikTok Developers, habilitar Content Posting API, solicitar scopes de publicacion, completar OAuth fuera de banda y guardar `TIKTOK_ACCESS_TOKEN` en Railway.
- Instagram: convertir cuenta a Business/Creator, vincularla a una Page de Facebook, crear app Meta, conceder permisos de Instagram Graph API y guardar `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_BUSINESS_ACCOUNT_ID`.
- Pinterest: crear app Pinterest Developers, autorizar con scope de pins/boards y guardar `PINTEREST_ACCESS_TOKEN` + `PINTEREST_BOARD_ID`.
- Hasta tener estos tokens, mantener `autoPromoteViaVideo=false` o usar video solo como render/backlog. Blog SEO y SEO evolutivo pueden operar con `OPENAI_API_KEY` + Shopify.
