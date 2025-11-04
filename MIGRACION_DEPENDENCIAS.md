# Mapas de APIs, Scrapers y Dependencias

Este documento resume los componentes técnicos requeridos para alcanzar paridad con el modelo original, y cómo conectarlos en la versión web.

## 1) Bridge de Scraping Nativo (Python)

- Fuente: `ivan_reseller/aliexpress_stealth_scraper.py`, `scraper_real.py`, `native_scraping_agent.py`
- Requerimientos Python:
  - `undetected_chromedriver`, `selenium`, `requests`, `Flask`/`FastAPI` (para microservicio), manejo de proxies y delays humanizados.
  - Chrome estable + chromedriver compatibles.
- Endpoints propuestos del microservicio local:
  - `POST /scraping/aliexpress/search` → body: `{ query, max_items, locale, proxies? }` → retorna lista de productos reales (estructura original).
  - `GET /health` → estado del driver/proxy/cola.
- Integración Node:
  - Nuevo servicio `backend/src/services/scraper-bridge.service.ts` (HTTP client hacia el microservicio local) con reintentos, timeouts y cascada real a proveedores externos si falla (sin datos simulados).
  - Logs SSE: reenviar desde Python → Node → frontend.

## 2) Analizador de Competidores (APIs reales)

- Original: `real_market_competitor_analyzer.py` usa handlers de eBay, Amazon y Mercado Libre + traducción de consulta por región.
- Web:
  - eBay: `backend/src/services/ebay.service.ts` (OAuth, búsqueda, fees). Añadir método `searchProducts(params)` con normalización.
  - Amazon: `backend/src/services/amazon.service.ts` (SP-API). Añadir método de búsqueda catálogo/precios por marketplace/ASIN.
  - Mercado Libre: `backend/src/services/mercadolibre.service.ts` (revisar e incluir búsqueda con filtros región/condición).
  - Traducción: opcional `content-translator.service.ts` (Groq/OpenAI/Gemini) para alinear consulta a idioma/región según marketplace.
  - Nuevo: `backend/src/services/competitor-analyzer.service.ts` para orquestar búsquedas multi-marketplace con rate limiting y backoff.

## 3) Calculadora de Costos Real

- Original: `real_cost_calculator.py` (comisiones marketplace, fees de pago, impuestos, envío y conversión FX).
- Web:
  - Nuevo `backend/src/services/cost-calculator.service.ts` con tablas parametrizadas por marketplace/país/moneda.
  - Fuente de FX: endpoints dedicados `/api/currency/*` y `/api/exchange-rates/*` (por implementar) o proveedor externo.

## 4) Orquestador de Oportunidades

- Original: `real_opportunity_finder.py` (scraping → competencia → costos → scoring + AI opcional).
- Web:
  - Nuevo `backend/src/services/opportunity-finder.service.ts` que coordine: `scraper-bridge` → `competitor-analyzer` → `cost-calculator`.
  - Nueva ruta `backend/src/api/routes/opportunities.routes.ts` con `GET /api/opportunities` (paridad con original) + filtros.
  - Persistencia: modelos `Opportunity`, `CompetitionSnapshot` y `OpportunityRun/JobRun` en Prisma.

## 5) Credenciales y Seguridad

- Modelo Prisma actual: `User`, `ApiCredential`, `Product`, `Sale`, `Commission`, `Activity`.
- Añadir:
  - `Opportunity`, `CompetitionSnapshot`, `Notification`, `AuditLog`, `JobRun`.
  - Cifrado de `ApiCredential.credentials` (ya es String JSON). Asegurar cifrado en repositorio y en reposo.
- Flujos de OAuth/keys:
  - eBay OAuth (ya disponible), Mercado Libre OAuth, Amazon SP-API LWA.
  - UI `APIConfiguration.tsx` debe cubrir pruebas por marketplace (ping completo).

## 6) Proxies, Captcha y Anti-bot

- Original: `advanced_proxy_manager.py`, `captcha_solver_ai.py`, endpoints `/api/proxies/*`, `/api/captcha/*`.
- Web:
  - Añadir rutas `proxies.routes.ts` y `captcha.routes.ts` + servicios equivalentes con proveedores compatibles (ZenRows/ScraperAPI si aplica) y/o solver captcha automático.
  - Configurar rotación en el bridge Python y exponer estado a Node.

## 7) Observabilidad/Producción

- Original: `/api/production/*` (health, alerts, audit, recovery, keys, metrics) + logs SSE `/api/logs/stream`.
- Web:
  - Añadir endpoints `production.routes.ts` y `logs.routes.ts` (SSE), más middleware de auditoría.
  - Integrar `backend/src/services/notifications.service.ts` para eventos y alertas.

## 8) Dependencias de entorno (resumen)

- Python: `undetected_chromedriver`, `selenium`, `Flask/FastAPI`, `requests`.
- Node: `axios`, `express`, `jsonwebtoken`, `prisma`, `zod`, `helmet`, `compression`, `cors`.
- Infra: Chrome estable, Chromedriver, Redis (colas), Proxy pool, claves API marketplaces + IA opcional.

## 9) Mapa rápido de archivos nuevos (web)

- `backend/src/services/scraper-bridge.service.ts`
- `backend/src/services/competitor-analyzer.service.ts`
- `backend/src/services/cost-calculator.service.ts`
- `backend/src/services/opportunity-finder.service.ts`
- `backend/src/api/routes/opportunities.routes.ts`
- `backend/src/api/routes/proxies.routes.ts` (opcional)
- `backend/src/api/routes/logs.routes.ts` (SSE)

## 10) Riesgos y mitigación

- Anti-bot: bridge Python con anti-detección + rotación proxies y tiempos humanos.
- Límites API: rate limiting y backoff por marketplace.
- FX y comisiones: parametrizar por región/marketplace y versionar tablas.
- Multi-tenant: scoping por usuario en todas las consultas/escrituras y auditoría.

