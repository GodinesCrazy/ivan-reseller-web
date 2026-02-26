# FASE 4 ? PUBLIC PRODUCT VERIFICATION REPORT

Confirmar que un producto publicado existe en el marketplace, es visible y puede comprarse manualmente.

## Cómo obtener un producto publicado

1. **Ciclo automático hasta publicación:**  
   Ejecutar (con secret interno):
   ```bash
   curl -X POST "https://<BACKEND_URL>/api/internal/test-full-cycle-search-to-publish" \
     -H "Content-Type: application/json" \
     -H "x-internal-secret: <INTERNAL_RUN_SECRET>" \
     -d '{"keyword": "phone case"}'
   ```
   O desde backend: `npm run test:search-to-publish` (si está definido) o script que llame al handler.

2. **O desde el frontend:** Oportunidades ? crear producto ? aprobar ? publicar (Products o Intelligent Publisher).

3. **Consultar en DB:**
   ```sql
   SELECT id, "userId", title, "aliexpressUrl", "suggestedPrice", "aliexpressPrice", status, "isPublished"
   FROM products
   WHERE status = 'PUBLISHED'
   ORDER BY "createdAt" DESC
   LIMIT 1;
   ```

## Campos del reporte (rellenar tras publicación real)

| Campo | Valor |
|-------|--------|
| **productId** | |
| **title** | |
| **public URL** | (listing URL en eBay/MercadoLibre o URL del marketplace) |
| **price** | (precio de venta) |
| **cost** | (aliexpressPrice / costo proveedor) |
| **profit estimado** | (price - cost - fees) |

## Verificación manual

- [ ] Producto existe en listado del marketplace (eBay/MercadoLibre).
- [ ] Es visible públicamente (sin login o con cuenta comprador).
- [ ] Puede a?adirse al carrito y completarse compra manual (checkout PayPal según flujo actual).

---

*Rellenar este reporte después de ejecutar el ciclo de publicación y comprobar el listing en el marketplace.*
