# Cómo verificar si el sistema está generando utilidades

**Utilidades** = ganancia neta por ventas (suma de `netProfit` de ventas no canceladas).

## Dónde comprobarlo

1. **Control Center** (recomendado)  
   En **ivanreseller.com** → **Control Center** verás la sección **Utilidades**:
   - **Hoy** y **Este mes**: ganancia neta en USD.
   - **Generando utilidades: Sí** si hay ganancia en el mes o hoy; **No** si aún no hay ventas con ganancia registradas.

2. **$ Ventas**  
   En el menú **Catálogo y ventas** → **$ Ventas** tienes el total de ventas, ingresos y ganancias por período.

3. **Finanzas**  
   En **Finanzas** → **Finanzas** (o Finance Dashboard) ves resumen, desglose, flujo de caja y proyección de ganancias.

4. **Script desde terminal**  
   Con el backend en marcha (local o producción):
   ```bash
   cd backend
   API_BASE_URL=https://ivanreseller.com \
   AUTOPILOT_LOGIN_USER=admin \
   AUTOPILOT_LOGIN_PASSWORD=*** \
   npx tsx scripts/check-autopilot-and-sales.ts
   ```
   La línea **Generando utilidades: sí/no** usa los mismos datos que el Control Center (`profitToday` y `profitMonth` de `/api/dashboard/autopilot-metrics`).

## Origen de los datos

- **profitToday**: suma de `netProfit` de ventas de hoy (no canceladas).
- **profitMonth**: suma de `netProfit` de ventas del mes en curso (no canceladas).

Si ambos son 0, no hay ventas con ganancia registradas en ese período y el sistema **no** está generando utilidades todavía.
