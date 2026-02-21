# Configurar Políticas de Negocio en eBay

Para publicar productos vía API necesitas tener configurado en tu cuenta de eBay:

## 1. Ubicación de inventario
- Ve a **Seller Hub** ? **Inventory** ? **Locations**
- Crea una ubicación (warehouse) con tu dirección
- O la API puede crear `default_location` automáticamente

## 2. Políticas de negocio (obligatorio)
1. Entra en **Seller Hub** ? **Account** ? **Business Policies**
2. Crea o verifica que tengas:
   - **Fulfillment Policy** (envío): tiempo de manejo, opciones de envío
   - **Payment Policy** (pago): métodos aceptados
   - **Return Policy** (devoluciones): ventana de devolución, quién paga envío

3. Sin estas políticas, la API devolverá 404 al intentar publicar.

## 3. Verificación
- Tras crearlas, espera unos minutos
- Vuelve a ejecutar el ciclo: `$env:DRY_RUN="0"; npm run run:remote-cycle`
