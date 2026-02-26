# Ciclo completo de dropshipping (de inicio a fin)

Flujo completo desde tendencias hasta payout, con servicios y rutas implicados.

---

## INICIO ? Descubrimiento y catálogo

### 1. Trend discovery (tendencias)
- **Servicio:** `trends.service.ts` ? `getTrendingKeywords(config)`
- **Fuentes:** Google Trends (SerpAPI), tendencias internas, fallback por categorías
- **Rutas:** `GET /api/trends/keywords` (authenticate), autopilot, test-full-cycle
- **Resultado:** Lista de keywords priorizadas para buscar productos

### 2. Opportunity search (oportunidades)
- **Servicio:** `opportunity-finder.service.ts` ? `findOpportunities(userId, filters)`
- **Usa:** Keywords, AliExpress (Affiliate/API o scraping), comparativa de marketplaces, costos y márgenes
- **Rutas:** Autopilot, internal test, `findOpportunitiesWithDiagnostics`
- **Resultado:** Lista de `OpportunityItem` (producto, cost, suggestedPrice, profitMargin, etc.)

### 3. Product creation (producto en BD)
- **Servicio:** `product.service.ts` ? `createProduct(userId, data: CreateProductDto)`
- **Rutas:** `POST /api/products`, publisher (add/approve), autopilot test-cycle, jobs
- **Datos:** title, aliexpressUrl, aliexpressPrice, suggestedPrice, finalPrice, images, etc.
- **Resultado:** Product en BD (status PENDING/APPROVED, isPublished false)

### 4. Product publish (publicación)
- **Acciones:** `PATCH /api/products/:id/status` con `status: 'PUBLISHED'`, o flujo publisher (approve ? publish), o jobs de publicación a marketplace (eBay, etc.)
- **Resultado:** Product visible para venta (isPublished true, o listado en marketplace)

---

## MEDIO ? Compra del cliente y pago

### 5. Cliente compra (checkout)
- **Frontend:** Checkout ? `createPayPalOrder(...)` ? `POST /api/paypal/create-order` ? redirect a PayPal
- **Backend:** `paypal-checkout.service.ts` ? `createOrder(...)` ? PayPal REST API
- **Resultado:** URL de aprobación PayPal; usuario paga en PayPal

### 6. PayPal captura
- **Frontend:** Vuelta de PayPal con `?token=...` ? `capturePayPalOrder(...)` ? `POST /api/paypal/capture-order` (con auth)
- **Backend:** `paypal.routes.ts` (authenticate) ? `service.captureOrder(paypalOrderId)` ? PayPal REST capture
- **Resultado:** Pago capturado en PayPal

### 7. Order creada (PAID)
- **Backend:** En el mismo handler de capture-order ? `prisma.order.create({ userId: req.user?.userId, status: 'PAID', price, productUrl, shippingAddress, ... })`
- **Luego:** `orderFulfillmentService.fulfillOrder(order.id)`

---

## FULFILLMENT ? Compra en AliExpress y venta interna

### 8. executePurchase(userId)
- **Servicio:** `order-fulfillment.service.ts` ? `purchaseRetryService.attemptPurchase(..., order.userId)` ? `aliexpress-checkout.service.ts` ? `placeOrder(..., userId)`
- **Internamente:** `aliexpress-auto-purchase.service.ts` ? `executePurchase(request, userId)`

### 9. AliExpress Dropshipping API (orden real)
- **Servicio:** `aliexpress-dropshipping-api.service.ts` ? `placeOrder(request)` (cuando hay OAuth válido en api_credentials)
- **Credenciales:** `CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', env)`
- **Resultado:** Orden real en AliExpress; `orderId`, `orderNumber`, `totalAmount`

### 10. Order actualizada (PURCHASED)
- **Backend:** `order-fulfillment.service.ts` ? `prisma.order.update({ status: 'PURCHASED', aliexpressOrderId: result.orderId })`

### 11. Sale creada
- **Servicio:** `sale.service.ts` ? `createSaleFromOrder(orderId)` (llamado justo después de marcar PURCHASED)
- **Datos:** orderId, userId, productId (por order.productId o productUrl), salePrice = order.price, costPrice = product.aliexpressPrice
- **Resultado:** Sale en BD + Commission (+ AdminCommission si aplica)

### 12. Profit generado
- **Dentro de createSale:** grossProfit = salePrice ? costPrice; platformCommission; netProfit = userProfit ? platformFees
- **Campos en Sale:** grossProfit, commissionAmount, netProfit

### 13. Payout ejecutado
- **Servicio:** `sale.service.ts` ? `sendPayoutToAdminAndUser(sale)` tras crear la Sale
- **Condición:** `hasSufficientBalanceForPayout(totalPayoutAmount)` (balance-verification ? PayPal real)
- **Acción:** `paypal-payout.service.ts` ? `sendPayout(admin)` y `sendPayout(user)` (comisión + beneficio usuario)
- **Resultado:** Dinero enviado a admin y usuario; Sale status COMPLETED (o PAYOUT_SKIPPED_INSUFFICIENT_FUNDS si no hay saldo)

---

## Resumen en una línea

**Trend discovery ? Opportunity search ? Product creation ? Product publish ? Cliente compra ? PayPal captura ? Order (PAID) ? fulfillOrder ? executePurchase(userId) ? AliExpress Dropshipping API placeOrder ? Order (PURCHASED) ? createSaleFromOrder ? Sale + profit ? sendPayout (admin + user).**

| Fase        | Pasos                                      |
|------------|---------------------------------------------|
| **Inicio** | 1?4: Tendencias ? Oportunidades ? Producto ? Publicar |
| **Medio**  | 5?7: Checkout ? Captura PayPal ? Order PAID |
| **Fin**    | 8?13: executePurchase ? AliExpress ? PURCHASED ? Sale ? Profit ? Payout |
