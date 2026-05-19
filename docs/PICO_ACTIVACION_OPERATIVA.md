# PICO - Activacion operativa en produccion

Este documento lista las variables, credenciales y acciones humanas necesarias para dejar operativo el flujo PICO del modulo `CJ Shopify USA`: blog SEO, SEO evolutivo, video multi-canal y promocion organica en redes.

Estado del codigo al cierre de esta guia:

- Backend, migracion DB, API de monitoreo, scheduler y UI estan implementados.
- La migracion PICO ya fue validada con `npm run pico:status:db`.
- Blog SEO y SEO evolutivo funcionan si existe `OPENAI_API_KEY` y Shopify esta conectado.
- Video funciona en dos etapas: render en Creatomate y publicacion en TikTok/Instagram.
- Pinterest esta integrado como promocion organica de producto/Pin, no como publicacion de video PICO.

## 1. Variables obligatorias para PICO core

Configurar en Railway, servicio backend `ivan-reseller-backend`.

| Variable | Obligatoria | Donde se obtiene | Para que sirve | Si falta |
|---|---:|---|---|---|
| `OPENAI_API_KEY` | Si | OpenAI Platform | Genera articulos SEO, captions, hashtags y mejoras SEO | Blog y SEO evolutivo se omiten |
| `CREATOMATE_API_KEY` | Si para video | Creatomate Dashboard, API settings | Renderiza videos verticales MP4 en la nube | PICO video queda bloqueado |
| `CREATOMATE_TEMPLATE_ID` | Opcional | Creatomate, template editor | Usa una plantilla propia en vez del slideshow dinamico | Si falta, el sistema usa composicion dinamica |

Valor esperado:

```env
OPENAI_API_KEY=sk-...
CREATOMATE_API_KEY=...
CREATOMATE_TEMPLATE_ID=...
```

Notas:

- `CREATOMATE_TEMPLATE_ID` es opcional. Si lo configuras, la plantilla debe aceptar modificaciones llamadas `Product-Title`, `Image-1`, `Image-2`, `Image-3`.
- Si no defines plantilla, el backend crea un video vertical 1080x1920 con imagenes del producto y texto superpuesto.
- Creatomate debe poder descargar las imagenes de producto por URL publica.

## 2. Variables para publicar en redes sociales

Estas credenciales dependen de aprobaciones OAuth externas. El codigo ya espera estos tokens, pero no implementa aun un flujo visual para renovarlos desde la app.

| Variable | Red | Obligatoria para | Donde se obtiene | Si falta |
|---|---|---|---|---|
| `TIKTOK_ACCESS_TOKEN` | TikTok | Publicar video | TikTok Developers, Content Posting API, OAuth | El render puede existir, pero TikTok falla/queda pendiente |
| `INSTAGRAM_ACCESS_TOKEN` | Instagram | Publicar Reel | Meta Developers, Instagram Graph API | Instagram falla/queda pendiente |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Instagram | Identificar cuenta IG Business | Meta Graph API, cuenta Business/Creator vinculada a Page | Instagram falla/queda pendiente |
| `PINTEREST_ACCESS_TOKEN` | Pinterest | Crear Pins organicos | Pinterest Developers OAuth | Promocion Pinterest queda bloqueada |
| `PINTEREST_BOARD_ID` | Pinterest | Board destino | Pinterest API/Dashboard | Promocion Pinterest queda bloqueada |

Valores esperados:

```env
TIKTOK_ACCESS_TOKEN=...
INSTAGRAM_ACCESS_TOKEN=...
INSTAGRAM_BUSINESS_ACCOUNT_ID=...
PINTEREST_ACCESS_TOKEN=...
PINTEREST_BOARD_ID=...
```

Alcance actual por red:

- TikTok: publica video mediante Content Posting API usando `PULL_FROM_URL`.
- Instagram: crea media `REELS` y luego ejecuta `media_publish`.
- Pinterest: publica Pines organicos de producto mediante el flujo social existente.

Importante:

- Los access tokens pueden expirar. Si expiran, el sistema mostrara readiness incompleto o errores de publicacion.
- Aun falta implementar una pantalla OAuth/refresh-token dentro de Ivan Reseller para TikTok, Meta y Pinterest. Por ahora la obtencion/renovacion es manual o fuera de banda.

## 3. Variables base que PICO necesita indirectamente

PICO no vive aislado: toma productos activos, imagenes, handles, blog y trazas del modulo CJ Shopify USA.

| Variable / credencial | Obligatoria | Para que sirve |
|---|---:|---|
| `ENABLE_CJ_SHOPIFY_USA_MODULE=true` | Si | Expone rutas `/api/cj-shopify-usa/*` |
| `DATABASE_URL` | Si | Guarda listings, blog entries, video posts, trazas y scheduler |
| `REDIS_URL` | Recomendado | Workers/cache/sesiones; mejora operacion distribuida |
| `SHOPIFY_CLIENT_ID` | Si | App Shopify |
| `SHOPIFY_CLIENT_SECRET` | Si | App Shopify y validacion webhooks |
| `SHOPIFY_SHOP` | Si | Store destino, ejemplo `tu-store.myshopify.com` |
| `SHOPIFY_API_VERSION` | Recomendado | Version Admin API, actual recomendado en repo: `2026-04` |
| Credencial Shopify instalada en la app/BD | Si | Permite publicar blog, leer imagenes y actualizar productos |
| `CJ_API_KEY` o `CJ_DROPSHIPPING_API_KEY` | Necesario para el flujo completo CJ | Descubrimiento, supply, cotizaciones y operacion CJ |

## 4. Variables para validacion desde terminal

Estas no son estrictamente runtime PICO, pero ayudan a validar readiness.

```env
PICO_API_BASE_URL=https://ivan-reseller-backend-production.up.railway.app
PICO_AUTH_TOKEN=...
PICO_USER_ID=1
```

Alternativa si no usas `PICO_AUTH_TOKEN`:

```env
AUTOPILOT_LOGIN_USER=...
AUTOPILOT_LOGIN_PASSWORD=...
```

Comandos:

```bash
cd backend
npm run pico:status
npm run pico:status:db
```

Interpretacion:

- `pico:status` valida via API protegida.
- `pico:status:db` valida directamente schema, candidatos y readiness desde BD.
- Si `pico:status:db` dice `PICO core not fully ready: missing creatomate`, falta `CREATOMATE_API_KEY` en el entorno usado por el proceso.

## 5. Scheduler y automatizacion esperada

El objetivo es que PICO requiera la menor accion humana posible.

En la UI:

`CJ Shopify USA -> Agente Vendedor -> Aprendizaje`

Revisar/activar:

| Toggle | Recomendacion inicial | Que hace |
|---|---|---|
| `PICO: Blog SEO` / `autoPromoteViaBlog` | ON si `OPENAI_API_KEY` esta lista | Publica articulos SEO para productos candidatos |
| `PICO: SEO 30 dias` / `autoEvaluateStagnantSeo` | ON si `OPENAI_API_KEY` esta lista | Mejora SEO de listings estancados |
| `PICO: Video TikTok/IG` / `autoPromoteViaVideo` | OFF hasta validar Creatomate + tokens sociales | Encola render y publicacion en TikTok/Instagram |
| `Pinterest organico` / `autoPromoteOrganic` | ON solo con Pinterest token/board validos | Publica Pines organicos de productos promocionables |
| `Modo seguro` / `safeMode` | ON | Mantiene limites conservadores |

Limites recomendados para primer ciclo:

```text
maxBlogPostsPerCycle=1
maxSeoUpdatesPerCycle=2
maxVideoRendersPerCycle=1
maxPromotionsPerCycle=2
```

Luego de validar trazas reales, subir gradualmente.

## 6. Acciones humanas necesarias por plataforma

### OpenAI

1. Crear o usar una API key activa.
2. Cargar `OPENAI_API_KEY` en Railway.
3. Confirmar que la cuenta tiene billing/cupo disponible.
4. Ejecutar `npm run pico:status:db`.

### Creatomate

1. Crear cuenta/proyecto en Creatomate.
2. Obtener `CREATOMATE_API_KEY`.
3. Opcional: crear template vertical 1080x1920.
4. Si usas template, confirmar nombres de modificaciones:
   - `Product-Title`
   - `Image-1`
   - `Image-2`
   - `Image-3`
5. Cargar `CREATOMATE_API_KEY` y opcionalmente `CREATOMATE_TEMPLATE_ID` en Railway.
6. Ejecutar una accion manual `PROMOTE_VIA_VIDEO` con limite bajo.

### TikTok

1. Crear app en TikTok Developers.
2. Solicitar/habilitar Content Posting API.
3. Configurar OAuth y redirect URL segun la app TikTok.
4. Obtener access token con permisos de publicacion.
5. Guardar `TIKTOK_ACCESS_TOKEN` en Railway.
6. Probar con un solo video antes de activar automatizacion.

### Instagram / Meta

1. Convertir Instagram a Business o Creator.
2. Vincular Instagram a una Facebook Page.
3. Crear app en Meta Developers.
4. Habilitar Instagram Graph API.
5. Conceder permisos necesarios para publicar Reels.
6. Obtener:
   - `INSTAGRAM_ACCESS_TOKEN`
   - `INSTAGRAM_BUSINESS_ACCOUNT_ID`
7. Guardar ambas variables en Railway.
8. Probar con un solo video antes de activar automatizacion.

### Pinterest

1. Crear app en Pinterest Developers.
2. Autorizar OAuth con scopes de boards/pins.
3. Obtener `PINTEREST_ACCESS_TOKEN`.
4. Identificar board destino y guardar `PINTEREST_BOARD_ID`.
5. Activar promocion organica solo luego de una prueba manual.

### Shopify

1. Confirmar que la app Shopify esta instalada.
2. Confirmar scopes necesarios para productos/blog/webhooks.
3. Confirmar que el blog principal existe o que Shopify permite crearlo/publicar articulos.
4. Confirmar que los productos activos tienen:
   - `shopifyHandle`
   - imagenes publicas
   - precio/margen validado

## 7. Prueba supervisada recomendada

Orden sugerido:

1. Validar schema/readiness:
   ```bash
   cd backend
   npm run pico:status:db
   ```

2. Probar blog:
   - UI: `Agente Vendedor -> Ahora/Proteger`
   - Ejecutar accion `PROMOTE_VIA_BLOG`.
   - Verificar articulo en Shopify.
   - Verificar trazas recientes.

3. Probar SEO evolutivo:
   - Ejecutar `EVALUATE_STAGNANT_LISTINGS`.
   - Revisar que `lastSeoUpdate` se actualice en candidatos.

4. Probar video sin activar automatizacion masiva:
   - Cargar `CREATOMATE_API_KEY`.
   - Cargar tokens TikTok/Instagram si ya existen.
   - Ejecutar `PROMOTE_VIA_VIDEO` con limite 1.
   - Verificar:
     - render en Creatomate
     - rows en `cj_shopify_usa_video_posts`
     - estado `SUCCESS`, `RETRYING` o `FAILED`
     - trazas `pico.video.*`

5. Activar automatizacion gradual:
   - Blog ON.
   - SEO ON.
   - Pinterest ON si tokens validos.
   - Video ON solo despues de publicar un video real correctamente.

## 8. Monitoreo esperado en la UI

Ruta:

```text
https://www.ivanreseller.com/cj-shopify-usa/sales-agent
```

La pantalla debe distinguir:

- `Piloto automatico`: si el agente corre solo, esta pausado o esta trabajando.
- `Fidelidad de datos`: si la lectura es real, estimada o parcial.
- `PICO`: credenciales faltantes y candidatos.
- `Feedback`: resultado visible despues de presionar un boton.
- `Automatizaciones permitidas`: ON significa que el agente lo puede hacer solo en sus ciclos.

## 9. Que queda fuera del codigo actual

Estos puntos requieren credenciales/aprobaciones externas o una fase futura:

- Flujo OAuth visual dentro de la app para TikTok, Instagram y Pinterest.
- Refresh automatico de tokens sociales.
- Pantalla dedicada para administrar `CREATOMATE_TEMPLATE_ID` y preview de plantilla.
- Confirmacion visual profunda de URLs publicadas por TikTok/Instagram cuando la API solo devuelve `publish_id`.
- Publicacion de video en Pinterest. Hoy Pinterest esta tratado como promocion organica de producto/Pin, no como video PICO.

## 10. Checklist final de activacion

- [ ] `OPENAI_API_KEY` cargada en Railway.
- [ ] `CREATOMATE_API_KEY` cargada en Railway.
- [ ] `CREATOMATE_TEMPLATE_ID` cargada si usaras template propio.
- [ ] `TIKTOK_ACCESS_TOKEN` cargado y con Content Posting API aprobado.
- [ ] `INSTAGRAM_ACCESS_TOKEN` cargado.
- [ ] `INSTAGRAM_BUSINESS_ACCOUNT_ID` cargado.
- [ ] `PINTEREST_ACCESS_TOKEN` cargado.
- [ ] `PINTEREST_BOARD_ID` cargado.
- [ ] Shopify conectado y con scopes correctos.
- [ ] `npm run pico:status:db` sin missing core.
- [ ] Primer blog PICO publicado y revisado.
- [ ] Primer SEO refresh revisado.
- [ ] Primer video renderizado en Creatomate.
- [ ] Primer video publicado en TikTok/Instagram.
- [ ] Pinterest probado con un Pin organico.
- [ ] `autoPromoteViaVideo=true` solo despues de la primera prueba exitosa.
