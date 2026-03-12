# Mercado Libre: Cumplimiento de políticas (propiedad intelectual)

Este documento resume las reglas de Mercado Libre para evitar suspensiones por infracción de propiedad intelectual. El software aplica sanitización automática en títulos y descripciones; las imágenes requieren atención manual.

**Fuente oficial:** [Central de aprendizaje ML - Cómo publicar sin infringir propiedad intelectual](https://vendedores.mercadolibre.cl/nota/como-publicar-sin-infringir-propiedad-intelectual)

---

## Título y descripción

### Términos prohibidos para marcas

- **No usar:** "tipo X", "símil X", "réplica", "idéntico a", "igual a" para referirse a marcas registradas.
- **Usar en su lugar:** "compatible con X" o "para X" (ej. "Cargador compatible con iPhone 5, 6, 7, 8 y Plus" en vez de "Cargador tipo iPhone").

El software aplica automáticamente estas sustituciones en `sanitizeTitleForML` y `sanitizeDescriptionForML` (mercadolibre.service.ts).

### Ficha técnica - Marca

- Si el producto **no tiene marca real**, indicar **"Genérico"**.
- No usar "tipo Apple", "tipo Xiaomi", etc. en el campo Marca.

El flujo de creación y repair usa `inferBrandFromTitle` y envía "Genérico" cuando no hay marca identificable.

---

## Imágenes

### Calidad mínima (tamaño)

- **Mínimo 15 KB por imagen.** Mercado Libre exige fotos de calidad suficiente. El software filtra imágenes por debajo de este umbral en `mercadolibre.service.ts` (MIN_IMAGE_BYTES = 15 * 1024).
- Si ninguna imagen del producto cumple el requisito, la publicación falla con mensaje: *"none of the product images met quality requirements (min 15KB)"*.

### Contenido (derechos de autor)

- **No incluir** logos o marcas registradas de terceros en las imágenes (a menos que se tenga autorización).
- **No descargar** fotos de internet que puedan infringir derechos de autor.
- ML detecta "La portada tiene logos y/o textos" y reduce exposición o inactiva la publicación.

**Acción:** Revisar que las imágenes del producto no contengan logos, texto promocional ni marcas de terceros. El software no puede corregir imágenes por API; hay que reemplazar las fotos manualmente en AliExpress o antes de publicar.

---

## Categoría

- Usar la categoría correcta para el producto. ML puede inactivar publicaciones en "categoría incorrecta".
- Algunas **categorías de alto riesgo** exigen requisitos adicionales (p. ej. video/clip obligatorio). Ver sección "Falta crear clip" más abajo.

El software usa `predictCategory` (domain_discovery) al publicar; en repair se conserva o se obtiene desde ML si existe.

---

## Eliminar todas las publicaciones ML

Para dejar el software y Mercado Libre como si no se hubieran publicado (cerrar en ML y borrar de la base de datos todas las publicaciones del usuario):

- **Desde la API (usuario autenticado):**  
  `POST /api/publisher/listings/ml-bulk-close`  
  Body: `{}` o `{ "listingIds": [] }`  
  No uses `onlyAlreadyClosed: true` si quieres cerrar **todas** las publicaciones (también las activas).

- **Desde consola (sin depender del frontend):**  
  `cd backend && npm run close:ml-all` — cierra todos los listados ML de **todos** los usuarios con listados.  
  `cd backend && npm run close:ml-all <userId>` — cierra solo los listados ML de ese usuario.

Si algunos ítems en ML devuelven error al cerrar (por ejemplo ya están cerrados o en un estado que no permite cerrar), esos **no** se borran de nuestra BD. Opciones:

1. **Volver a llamar** `POST /api/publisher/listings/ml-bulk-close` con **`onlyAlreadyClosed: true`**: solo intenta cerrar en ML los que ya estén closed/paused en ML y, para los que ya estaban cerrados, los elimina de la BD (evitando el error de "ya cerrado").
2. O ejecutar primero `GET /api/publisher/listings/ml-status` y luego enviar en `listingIds` solo los que sigan en la BD y quieras forzar a cerrar/limpiar.

---

## Falta crear clip (3 publicaciones)

Algunas categorías en ML exigen **video/clip** para la publicación. Si aparecen "Falta crear clip":

1. **Opción A:** Subir el clip manualmente en la app de Mercado Libre para esas 3 publicaciones.
2. **Opción B:** Cerrar esas publicaciones vía `POST /api/publisher/listings/ml-bulk-close` (pasar los `listingId` afectados) y eliminarlas de la BD.

El software no soporta subida de clips por API en la versión actual.

---

## Endpoints de gestión ML

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/publisher/listings/ml-status?limit=200` | Diagnóstico: estado de cada listing ML (active, closed, paused, etc.). |
| `POST /api/publisher/listings/repair-ml` | Reparar títulos, descripciones, atributos (BRAND Genérico). Omite listings ya cerrados/pausados. |
| `POST /api/publisher/listings/ml-bulk-close` | Cerrar listings en ML y eliminarlos de la BD (software = realidad). Body: `{ listingIds?: string[], onlyAlreadyClosed?: boolean }`. |
| `GET /api/publisher/listings/ml-compliance?limit=200` | Verificación de cumplimiento PI: obtiene título/descripción desde ML y devuelve cuáles cumplen y cuáles no (violations: tipo, símil, réplica, etc.). |

---

## Flujo: Repair + verificación de cumplimiento

Para asegurar que las publicaciones en ML quedan acordes a las políticas:

1. **Ejecutar repair masivo** (desde backend):
   - `cd backend && npx tsx scripts/repair-ml-listings.ts` (todos los usuarios con listados ML)
   - o `npx tsx scripts/repair-ml-listings.ts <userId>` para un usuario.
2. **Ejecutar verificación de cumplimiento:**
   - API: `GET /api/publisher/listings/ml-compliance?limit=500` (con sesión).
   - O script: `cd backend && npx tsx scripts/check-ml-compliance.ts [userId]`.
3. **Actuar sobre no conformes:** Si hay listings con `compliant: false`, corregir el producto en nuestra BD y volver a lanzar repair para esos `listingIds`, o cerrarlos con `POST /api/publisher/listings/ml-bulk-close`.
4. **Revisión visual final:** En [Publicaciones de Mercado Libre](https://www.mercadolibre.cl) o la app, comprobar a ojo que títulos y fichas técnicas se vean correctos.

**Nota:** Si el repair devuelve muchos fallidos con "status:under_review" o "Cannot update item", ML no permite editar esos ítems mientras estén en revisión. Opciones: usar `ml-bulk-close` con `onlyAlreadyClosed: true` para limpiar de la BD los que ya estén cerrados/pausados en ML; o esperar a que ML resuelva la revisión y volver a lanzar repair. La verificación de cumplimiento (ml-compliance) solo lee título/descripción desde ML y puede indicar 0 violaciones aunque el repair no haya podido actualizar.

---

## Flujo recomendado ante suspensiones

1. **Diagnóstico:** `GET /api/publisher/listings/ml-status` para ver qué listings están active vs closed/paused.
2. **Reparar:** `POST /api/publisher/listings/repair-ml` para corregir título, descripción y BRAND.
3. **Cerrar los irrecuperables:** `POST /api/publisher/listings/ml-bulk-close` con los listingIds que no se puedan reparar (p. ej. por imágenes con logos).
4. **Re-publicar** productos con contenido e imágenes ya compatibles.

---

## Verificación: que todo quede corregido en ML y en el software

### En el software (nuestra app)

1. **Estado de listings:** En Intelligent Publisher → Publicaciones, filtrar por Mercado Libre. El listado debe mostrar solo los que siguen publicados en ML. Si cerraste en ML y usaste unpublish o bulk-close, esos ítems ya no deben aparecer (se eliminaron de la BD).
2. **Diagnóstico:** Llamar `GET /api/publisher/listings/ml-status?limit=500`. Revisar que los `listingId` que siguen en la respuesta tengan `mlStatus: "active"` si quieres conservarlos; los que aparecen `closed` o `paused` puedes eliminarlos de la BD con bulk-close (`onlyAlreadyClosed: true`).
3. **Repair aplicado:** Tras ejecutar `POST /api/publisher/listings/repair-ml`, la respuesta indica `repaired` y `failed`. Los reparados tienen en ML título/descripción/atributos ya sanitizados (tipo → compatible con, BRAND Genérico).

### En Mercado Libre (app o vendedores.mercadolibre)

1. **Publicaciones:** Entra a Publicaciones y revisa que el número de publicaciones activas coincida con lo que ves en nuestro listado (si cerraste masivamente, en ML bajará el total; en nuestra app también habrán desaparecido esos listings).
2. **Títulos/descripciones:** Abre varias publicaciones que hayas reparado y comprueba que no figuren "tipo X", "símil", "réplica" en el título ni en la descripción; que digan "compatible con X" donde corresponda.
3. **Ficha técnica:** En una publicación reparada, revisa que en Atributos / Marca aparezca "Genérico" (o la marca real del producto), nunca "tipo [marca]".
4. **Infracciones:** En [Infracciones de propiedad intelectual](https://www.mercadolibre.cl/noindex/pppi/infractions) no deberían sumarse nuevas detecciones tras las correcciones; las que ya estaban dadas de baja siguen apareciendo pero no se reactivan sin republicar.

Si algo no coincide (p. ej. en ML sigue saliendo un título con "tipo"), ejecuta de nuevo repair para ese producto/listing o verifica que el producto en nuestra BD tenga el título ya corregido antes de reparar.
