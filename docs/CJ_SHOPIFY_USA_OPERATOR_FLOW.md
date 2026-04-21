# CJ -> Shopify USA - Operator Flow & Runbook

Este documento establece el flujo operativo que el manager (basado en Chile) debe seguir para mantener la calidad publicitaria y operativa hacia el mercado USA en Shopify.

## 1. Contexto & Requerimientos del Store
El sistema Backend asume que este es el estado del store operativo si está aprovisionado en nuestro módulo:
- **Ubicación Base:** Chile (Por defecto, Shopify asigna la cuenta bancaria de retiros a esto).
- **Checkout Gateway:** **PayPal Express** o pasarela compatible (No engañarse pensando que Payoneer es opción de Checkouts. Payoneer actúa como la cuenta virtual receptora del final del túnel para dólares retirados, u otros gateways alternativos de retiro, no como pasarela de cobro de clientes finales).
- **Moneda Transaccional:** El panel se bloquea con error si la tienda no se configura en `USD`.
- **Target Target:** USA (Tanto Mercado local como Zonas de Envío configuradas en USA. Shipping Rates explícitos alistados para USA).

## 2. Descubrimiento y Evaluación de Productos (Product Research Flow)
- **Heurística de Filtrado:** El operador entra en `/cj-shopify-usa/discover`. El módulo busca en CJ Dropshipping, priorizando *Fulfillment Origin: US* para optimizar la calidad de experiencia de Dropshipping.
- **Preview & Draft (Borrador):** Automáticamente el módulo mapea los costos, asume los fees de PayPal Express (ej: `5.4% + $0.30` como variable base a customizar por el usuario en lugar del `2.9%` de Shopify Payments que el store de Chile NO TIENE), y da el precio sugerido de venta en USD.

## 3. Publicación (Publish Flow)
- Al aprobar, el servidor empuja un Payload enriquecido a `POST /admin/api/{version}/products.json` de Shopify.
- El módulo no modifica tu configuración global y de theme de Shopify, asume que el producto encaja en las colecciones si hay reglas *automáticas* (Tags inyectados).

## 4. Fulfillment y Órdenes
- La ingesta de órdenes es captada mediante Webhooks o Syncing Manual. 
- Una vez la orden está mapeada en `cj_shopify_usa_orders`, el operador puede revisar el Coste Total CJ y darle a **Place Order** hacia CJ (o Autopilot si está activado).

## 5. Glosario de Estados Internos
- **REAL**: Datos de acceso confirmados. Modelos de órdenes de Shopify. Existencia de la Tienda. Check de Moneda local `USD`. Costo del proveedor verificado.
- **ESTIMATED**: Fechas de llegada de producto enviadas hacia el cliente. Fees porcentuales y fijos de pasarelas alternas (ya que Shopify los puede ocultar de algunos reportes crudos).
- **HEURISTIC**: Reglas y perfiles de envío (Se deduce que el usuario configuró shipping rates USA, el backend no fuerza override en tiempo real para no quebrar otras ventas).
- **BLOCKED**: Operaciones bloqueadas estáticamente cuando NO existe setup de USD o Scopes en Webhooks.
