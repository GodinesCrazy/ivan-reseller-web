# FASE 2 ? MAPEO COMPLETO DEL BACKEND

**Auditorùa Ivan Reseller ? Cùdigo real (backend/src/)**

---

## Prefijos montados en app.ts (base: /api excepto /health, /version, /config, /ready)

| Prefijo | Archivo de rutas |
|--------|------------------|
| /api/auth | auth.routes.ts |
| /api/access-requests | access-requests.routes.ts |
| /api/users | users.routes.ts |
| /api/products | products.routes.ts |
| /api/sales | sales.routes.ts |
| /api/commissions | commission.routes.ts |
| /api/dashboard | dashboard.routes.ts |
| /api/onboarding | onboarding.routes.ts |
| /api/opportunities | opportunities.routes.ts |
| /api/ai-suggestions | ai-suggestions.routes.ts |
| /api/automation | routes/automation.routes.ts |
| /api/autopilot | autopilot.routes.ts |
| /api/settings | routes/settings.routes.ts |
| /api/marketplace | marketplace.routes.ts |
| /api/marketplace-oauth | marketplace-oauth.routes.ts |
| /aliexpress | marketplace-oauth.routes.ts (callback) |
| /api/aliexpress | modules/aliexpress/aliexpress.routes.ts |
| /api/amazon | amazon.routes.ts |
| /api/jobs | jobs.routes.ts |
| /api/reports | reports.routes.ts |
| /api/notifications | notifications.routes.ts |
| /api/webhooks | webhooks.routes.ts |
| /api/paypal | paypal.routes.ts |
| /api/orders | orders.routes.ts |
| /api/system | system.routes.ts |
| /api/logs | logs.routes.ts |
| /api/proxies | proxies.routes.ts |
| /api/publisher | publisher.routes.ts |
| /api/currency | currency.routes.ts |
| /api/captcha | captcha.routes.ts |
| /api/manual-captcha | manual-captcha.routes.ts |
| /api/credentials | api-credentials.routes.ts |
| /api/workflow | workflow-config.routes.ts |
| /api/admin | admin.routes.ts + admin-commissions.routes.ts |
| /api/operations | successful-operations.routes.ts |
| /api/financial-alerts | financial-alerts.routes.ts |
| /api/business-metrics | business-metrics.routes.ts |
| /api/anti-churn | anti-churn.routes.ts |
| /api/pricing-tiers | pricing-tiers.routes.ts |
| /api/referral | referral.routes.ts |
| /api/cost-optimization | cost-optimization.routes.ts |
| /api/ai-improvements | ai-improvements.routes.ts |
| /api/advanced-reports | advanced-reports.routes.ts |
| /api/revenue-change | revenue-change.routes.ts |
| /api/finance | finance.routes.ts |
| /api/dropshipping | dropshipping.routes.ts |
| /api/regional | regional.routes.ts |
| /api/manual-auth | manual-auth.routes.ts |
| /api/auth-status | auth-status.routes.ts |
| /api/setup-status | setup-status.routes.ts |
| /api/config-audit | config-audit.routes.ts |
| /api/listing-lifetime | listing-lifetime.routes.ts |
| /api/meeting-room | meeting-room.routes.ts |
| /api/help | help.routes.ts |
| /api/trends | trends.routes.ts |
| /api/profitability | profitability.routes.ts |
| /api/internal | internal.routes.ts |
| /api/diag | diag.routes.ts |
| /api/debug | debug.routes.ts |

Rutas globales en app.ts (sin /api): GET /health, GET /version, GET /config, GET /ready, GET /api/health, GET /api/cors-debug.

---

## Endpoints por mùdulo (mùtodo, ruta completa, efecto)

### Auth (api/auth)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| POST | /api/auth/register | 403 ? registro deshabilitado, redirige a request-access |
| POST | /api/auth/login | Cookie JWT + user; body: username, password |
| GET | /api/auth/me | authenticate ? user actual |
| POST | /api/auth/refresh | Refresh token |
| POST | /api/auth/forgot-password | Inicia flujo recuperaciùn |
| POST | /api/auth/reset-password | Resetea contrase?a |
| POST | /api/auth/logout | Invalida sesiùn |
| GET | /api/auth/test-cookies | Test cookies |
| POST | /api/auth/change-password | authenticate ? cambia contrase?a |

### Dashboard (api/dashboard)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/dashboard/stats | productStats, salesStats, commissionStats (o safe defaults si SAFE_DASHBOARD_MODE) |
| GET | /api/dashboard/recent-activity | Actividad reciente (ventas, comisiones, productos) |
| GET | /api/dashboard/charts/sales | Datos para grùfico ventas (query: days) |
| GET | /api/dashboard/charts/products | Datos para grùfico productos |
| GET | /api/dashboard/summary | Resumen dashboard |

### Opportunities (api/opportunities)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/opportunities | query, maxItems, marketplaces, region ? items (opportunity finder real) |
| GET | /api/opportunities/list | list paginado (page, limit) |
| GET | /api/opportunities/:id | Detalle oportunidad |

### Products (api/products)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/products | Lista productos (user/admin) |
| GET | /api/products/stats | Estadùsticas productos |
| GET | /api/products/:id/preview | Preview producto |
| GET | /api/products/:id | Un producto |
| POST | /api/products | Crear producto |
| PUT | /api/products/:id | Actualizar producto |
| PATCH | /api/products/:id/status | authorize(ADMIN) ? status |
| PATCH | /api/products/:id/price | Actualizar precio |
| DELETE | /api/products/:id | Eliminar producto |
| GET | /api/products/:id/workflow-status | Estado workflow del producto |
| GET | /api/products/maintenance/inconsistencies | authorize(ADMIN) |
| POST | /api/products/maintenance/fix-inconsistencies | authorize(ADMIN) |

Nota: Frontend llama POST /api/products/scrape pero backend no tiene esta ruta (scrape via publisher/jobs); verificar si estù en products.routes o en otro mùdulo.

### Sales (api/sales)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/sales | Lista ventas (user/admin, query status, page, limit) |
| GET | /api/sales/stats | Estadùsticas (query days) |
| GET | /api/sales/pending-purchases | Ventas pendientes de compra + capital |
| GET | /api/sales/:id | Una venta |
| POST | /api/sales | Crear venta |
| PATCH | /api/sales/:id/status | authorize(ADMIN) actualizar estado |

### Orders (api/orders)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/orders | Lista ùrdenes |
| GET | /api/orders/:id | Una orden |

### PayPal (api/paypal)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| POST | /api/paypal/create-order | Crear orden PayPal |
| POST | /api/paypal/capture-order | Capturar pago y crear orden interna |
| POST | /api/paypal/webhook | Webhook PayPal |

### Autopilot (api/autopilot)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/autopilot/workflows | Lista workflows |
| GET | /api/autopilot/stats | Estadùsticas autopilot |
| GET | /api/autopilot/health | Health check |
| GET | /api/autopilot/status | Estado running/stopped |
| POST | /api/autopilot/start | Iniciar autopilot |
| POST | /api/autopilot/stop | Detener autopilot |
| GET | /api/autopilot/workflows/:id/logs | Logs de un workflow |
| GET | /api/autopilot/logs | Logs generales |
| POST | /api/autopilot/workflows | Crear workflow |
| PUT | /api/autopilot/workflows/:id | Actualizar workflow |
| PUT | /api/autopilot/workflows/:id/enabled | Toggle enabled |
| DELETE | /api/autopilot/workflows/:id | Eliminar workflow |
| POST | /api/autopilot/workflows/:id/run | Ejecutar un run del workflow |

### Automation (api/automation)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/automation/config | Configuraciùn sistema |
| PUT | /api/automation/config | Actualizar config |
| POST | /api/automation/autopilot/start | Iniciar autopilot |
| POST | /api/automation/autopilot/stop | Detener autopilot |
| GET | /api/automation/autopilot/status | Estado autopilot |
| GET | /api/automation/stages | Etapas |
| PUT | /api/automation/stages | Actualizar etapas |
| POST | /api/automation/continue/:stage | Continuar etapa |
| GET | /api/automation/rules | Reglas |
| PUT | /api/automation/rules/:ruleId | Actualizar regla |
| GET | /api/automation/credentials | Listar credenciales |
| POST | /api/automation/credentials | A?adir credenciales |
| GET | /api/automation/notifications | Notificaciones |
| PATCH | /api/automation/notifications/:id/read | Marcar leùda |
| GET | /api/automation/metrics | Mùtricas |
| GET | /api/automation/production/validate | Validar producciùn |

### Workflow (api/workflow)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/workflow/config | Config usuario |
| PUT | /api/workflow/config | Actualizar config |
| GET | /api/workflow/stage/:stage | Modo de etapa |
| GET | /api/workflow/environment | Ambiente usuario |
| GET | /api/workflow/working-capital | Capital de trabajo |
| PUT | /api/workflow/working-capital | Actualizar capital |
| POST | /api/workflow/continue-stage | Continuar etapa guided |
| POST | /api/workflow/handle-guided-action | Acciùn guided (confirm/cancel purchase/publish) |

### Credentials (api/credentials)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/credentials | Lista APIs configuradas |
| GET | /api/credentials/status | Estado credenciales |
| GET | /api/credentials/minimum-dropshipping | Mùnimo para dropshipping |
| GET | /api/credentials/:apiName | Credencial de una API |
| POST | /api/credentials | Crear/guardar credencial |
| PUT | /api/credentials/:apiName/toggle | Activar/desactivar |
| DELETE | /api/credentials/:apiName | Eliminar (query: environment, scope) |
| POST | /api/credentials/:apiName/test | Probar credencial |
| POST | /api/credentials/maintenance/clean-corrupted | authorize(ADMIN) |

### Marketplace (api/marketplace)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/marketplace/validate/:marketplace | Validar marketplace |
| POST | /api/marketplace/publish | Publicar producto |
| POST | /api/marketplace/publish-multiple | Publicar varios |
| GET | /api/marketplace/credentials | Credenciales |
| POST | /api/marketplace/credentials | Guardar credenciales |
| GET | /api/marketplace/credentials/:marketplace | Credencial por marketplace |
| POST | /api/marketplace/test-connection/:marketplace | Test conexiùn |
| POST | /api/marketplace/sync-inventory | Sincronizar inventario |
| GET | /api/marketplace/stats | Estadùsticas |
| GET | /api/marketplace/auth-url/:marketplace | URL OAuth |

### Auth status (api/auth-status)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/auth-status | Estado por marketplace (aliexpress, etc.) |
| POST | /api/auth-status/:marketplace/refresh | Refrescar sesiùn marketplace |

### Setup status (api/setup-status)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/setup-status | setupRequired, steps, etc. |

### Settings (api/settings)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/settings/apis | Lista APIs con definiciones (settings.routes.ts) |
| (otros en settings.routes.ts segùn cùdigo) | | |

Nota: El frontend tambiùn llama GET /api/settings (general). Verificar si existe en settings.routes.ts o en otro archivo (p. ej. currency.routes o un GET / en settings).

### Publisher (api/publisher)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| POST | /api/publisher/send_for_approval/:productId | Enviar a aprobaciùn |
| POST | /api/publisher/add_for_approval | A?adir a aprobaciùn (body: aliexpressUrl, scrape) |
| GET | /api/publisher/pending | Productos pendientes aprobaciùn |
| GET | /api/publisher/listings | Listings |
| POST | /api/publisher/approve/:id | Aprobar (body: marketplaces) |

### Jobs (api/jobs)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| POST | /api/jobs/scraping | Job scraping |
| POST | /api/jobs/publishing | Job publicaciùn |
| POST | /api/jobs/payout | Job payout |
| POST | /api/jobs/sync-inventory | Sincronizar inventario |
| GET | /api/jobs/stats | Estadùsticas jobs |
| POST | /api/jobs/schedule-payout | Programar payout |
| GET | /api/jobs/publishing/recent | Publicaciones recientes |
| GET | /api/jobs/publishing/:id | Detalle publicaciùn |

### Finance (api/finance)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/finance/summary | Resumen (query: range) |
| GET | /api/finance/breakdown | Desglose |
| GET | /api/finance/cashflow | Flujo caja |
| GET | /api/finance/tax-summary | Resumen impuestos |
| GET | /api/finance/export/:format | Exportar (format: csv, xlsx, etc.) |

### Listing lifetime (api/listing-lifetime)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/listing-lifetime/config | authorize(ADMIN) config |
| POST | /api/listing-lifetime/config | authorize(ADMIN) guardar config |
| GET | /api/listing-lifetime/product/:productId | Por producto |
| GET | /api/listing-lifetime/listing/:listingId | Por listing |
| GET | /api/listing-lifetime/evaluate-all | Evaluar todos |

### Manual auth (api/manual-auth)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| POST | /api/manual-auth | Iniciar sesiùn manual (body: provider) |
| GET | /api/manual-auth/:token | Estado sesiùn manual |
| POST | /api/manual-auth/:token/complete | Completar |
| POST | /api/manual-auth/save-cookies | authenticate ? guardar cookies |

### System (api/system)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/system/health/detailed | Health detallado |
| GET | /api/system/features | Features |
| GET | /api/system/status | authenticate ? estado |
| GET | /api/system/operation-mode | Modo operaciùn |
| GET | /api/system/api-status | authenticate ? estado APIs |
| GET | /api/system/capabilities | authenticate ? capacidades |
| POST | /api/system/refresh-api-cache | authenticate |
| POST | /api/system/test-apis | authenticate ? probar APIs |
| GET | /api/system/error-stats | authenticate |
| GET | /api/system/performance-stats | authenticate |

### Admin (api/admin)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/admin/users | authorize(ADMIN) lista usuarios |
| GET | /api/admin/users/:id | authorize(ADMIN) |
| GET | /api/admin/users/:id/stats | authorize(ADMIN) |
| POST | /api/admin/users | authorize(ADMIN) crear usuario |
| PUT | /api/admin/users/:id | authorize(ADMIN) |
| DELETE | /api/admin/users/:id | authorize(ADMIN) |
| POST | /api/admin/users/:id/reset-password | authorize(ADMIN) |
| PUT | /api/admin/users/:userId/commissions | authorize(ADMIN) |
| POST | /api/admin/users/:userId/apis | authorize(ADMIN) |
| GET | /api/admin/dashboard | authorize(ADMIN) |
| POST | /api/admin/charges/monthly | authorize(ADMIN) |
| POST | /api/admin/users/:userId/resend-credentials | authorize(ADMIN) |
| GET | /api/admin/platform-config | authorize(ADMIN) |
| PATCH | /api/admin/platform-config | authorize(ADMIN) |
| GET | /api/admin/platform-revenue | authorize(ADMIN) |
| (admin-commissions: GET /api/admin/commissions, GET /api/admin/commissions/stats) | | |

### Access requests (api/access-requests)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/access-requests | Lista solicitudes (admin) |
| POST | /api/access-requests | Crear solicitud (pùblico) |
| POST | /api/access-requests/:id/approve | approve(ADMIN) |
| POST | /api/access-requests/:id/reject | approve(ADMIN) |

### Users (api/users)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/users | authorize(ADMIN) |
| POST | /api/users | authorize(ADMIN) |
| GET | /api/users/:id | Usuario por id (propio o admin) |
| PUT | /api/users/:id | Actualizar usuario (propio o admin) |
| DELETE | /api/users/:id | authorize(ADMIN) |
| GET | /api/users/:id/stats | Stats usuario |
| GET | /api/users/:id/profile | Perfil |
| GET | /api/users/username/:username | authorize(ADMIN) |

Nota: Frontend llama PUT /api/users/:id y POST /api/users/:id/password. Verificar si change-password estù en users o en auth (auth tiene POST /api/auth/change-password).

### Onboarding (api/onboarding)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/onboarding/status | Estado onboarding |
| POST | /api/onboarding/paypal | Paso PayPal |
| POST | /api/onboarding/connect-marketplace | Conectar marketplace |
| POST | /api/onboarding/complete-step | Completar paso |
| POST | /api/onboarding/finish | Finalizar |

### AI suggestions (api/ai-suggestions)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/ai-suggestions | Lista sugerencias (query: limit) |
| POST | /api/ai-suggestions/generate | Generar |
| POST | /api/ai-suggestions/:id/implement | Implementar |

Frontend tambiùn llama GET /api/ai-suggestions/keywords ? verificar si existe en ai-suggestions.routes o en otro mùdulo.

### Trends (api/trends)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/trends/keywords | authenticate ? keywords (query: region, maxKeywords) |

### Reports (api/reports)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/reports/sales | Reporte ventas (query: startDate, endDate, userId, marketplace, status, format) |
| (otros: executive, etc. segùn reports.service) | | |

Frontend llama GET /api/reports/executive y GET /api/reports/:activeTab ? verificar rutas exactas en reports.routes.ts.

### Operations (api/operations)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/operations/success-stats | (successful-operations.routes.ts) |
| GET | /api/operations/learning-patterns | |

### Help (api/help)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/help/investors | authorize(ADMIN) lista |
| GET | /api/help/investors/:slug | authorize(ADMIN) documento |

### Regional (api/regional)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/regional/configs | Lista configuraciones regionales |
| PUT | /api/regional/configs/:id | Actualizar |
| POST | /api/regional/configs | Crear |
| DELETE | /api/regional/configs/:id | Eliminar |
| PUT | /api/regional/configs/:id (toggle active) | Activar/desactivar |

### Meeting room (api/meeting-room)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/meeting-room/availability | Disponibilidad |
| POST | /api/meeting-room/create | Crear sala |
| POST | /api/meeting-room/:roomId/end | Finalizar |

### Config audit (api/config-audit)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /api/config-audit | Auditorùa configuraciùn |

### Notifications (api/notifications)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| POST | /api/notifications/test | Enviar notificaciùn de prueba |

### Health / global (app.ts)
| Mùtodo | Ruta | Efecto |
|--------|------|--------|
| GET | /health | Health bùsico |
| GET | /api/health | Health API |
| GET | /version | Versiùn |
| GET | /config | Config (sin secretos) |
| GET | /ready | Ready (DB, etc.) |

---

## Servicios clave (referencia para Fases 4?5)

- **autopilot.service.ts** ? Ciclo autopilot (workflows, run, start/stop).
- **sale.service.ts** ? Ventas, stats, crear venta, actualizar estado.
- **order-fulfillment.service.ts** ? ùrdenes, compra AliExpress, payout.
- **opportunity-finder.service.ts** ? Bùsqueda oportunidades.
- **product.service.ts** ? Productos, stats.
- **commission.service.ts** ? Comisiones, stats.
- **workflow-config.service.ts** ? Config workflow, capital, etapas.
- **AliExpress:** aliexpress-affiliate-api.service.ts, aliexpress-oauth.service.ts, aliexpress-token.store.ts.
- **PayPal:** paypal.routes + order-fulfillment/sale para create-order/capture-order y payouts.

---

*Documento generado a partir del cùdigo real. Fase 3 cruzarù con FRONTEND_FEATURE_MAP y corregirù discrepancias.*
