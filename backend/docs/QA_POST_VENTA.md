# QA Post-venta — Checklist navegador

Verificación manual de las páginas clave del ciclo post-venta (ventas, órdenes, compras pendientes, productos, dashboard). Ejecutar con la app desplegada (producción o staging) y usuario con acceso a ventas/órdenes.

## Entorno

- [ ] URL base: ________________
- [ ] Usuario: ________________
- [ ] Entorno (producción / sandbox): ________________

## Checklist por ruta

### `/sales` (Ventas)

- [ ] Lista de ventas carga sin error
- [ ] Ventas eBay muestran **ID pedido eBay** (columna o detalle)
- [ ] Badge **Automatización** visible: Completada (AliExpress) / Pendiente compra / Requiere mapeo / Fallida
- [ ] Gráficos (Ventas por marketplace, Evolución ingresos) coherentes con tarjetas superiores
- [ ] Tarjetas (Ingresos totales, Beneficio, Total Sales, Avg Order Value) no en 0 si hay ventas en el período
- [ ] Filtro por marketplace (eBay, Amazon, Mercado Libre) funciona
- [ ] Modal detalle: enlaces a Órdenes / Compras pendientes cuando aplica

### `/orders` (Órdenes)

- [ ] Lista de órdenes carga sin error
- [ ] Órdenes con origen eBay visibles (paypalOrderId tipo `ebay:...` o indicador de origen)
- [ ] Órdenes con origen Mercado Libre visibles si existen
- [ ] Botón **Traer pedido desde eBay** abre formulario y permite ingresar ID de pedido eBay
- [ ] Estados correctos: PAID, PURCHASING, PURCHASED, FAILED
- [ ] Reintentar cumplimiento disponible para órdenes FAILED por fondos (si aplica)

### `/pending-purchases` (Compras pendientes)

- [ ] Página carga sin error
- [ ] Órdenes que requieren compra manual o reintento aparecen listadas
- [ ] Enlace a “Importar orden eBay” visible
- [ ] Información de capital / fondos si aplica

### `/products` (Productos)

- [ ] Lista de productos carga
- [ ] Listings por marketplace visibles (eBay, ML, Amazon) por producto
- [ ] Si existe sección “Post-venta” o estado por listing: última venta / estado por canal visible

### Dashboard / resumen inventario

- [ ] Conteos de órdenes por estado (Por comprar, Comprando, Comprado, Fallidas) coherentes
- [ ] Listings por marketplace (eBay, ML, Amazon) si el widget está presente

## Fallos detectados

Documentar aquí o en un issue:

| Ruta | Descripción del fallo |
|------|------------------------|
|      |                        |

## Fecha

- Fecha de ejecución: ________________
