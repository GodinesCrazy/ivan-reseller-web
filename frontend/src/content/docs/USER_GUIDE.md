# 📘 User Guide - Ivan Reseller

**Guía completa para usuarios finales**

**Última actualización:** 2025-03-04  
**Versión:** 1.1

---

## 🚀 Inicio Rápido

### 1. Acceso al Sistema

1. Obtener credenciales del administrador
2. Ir a `https://www.ivanreseller.com`
3. Hacer login con email y contraseña
4. Cambiar contraseña en el primer login (recomendado)

### 2. Configuración Inicial

**IMPORTANTE:** Configura tus APIs antes de empezar a usar el sistema.

1. Ir a **Settings → Configuración de APIs**
2. Configurar APIs críticas:
   - **AliExpress** (obligatorio)
   - **eBay, Amazon, o MercadoLibre** (al menos uno)
   - **GROQ AI** (recomendado)
   - **ScraperAPI o ZenRows** (recomendado)

**Ver guía detallada:** [docs/help/apis/](./help/apis/) o usar el botón "?" en cada API.

---

## 📊 Dashboard

El Dashboard muestra:

- **Métricas principales:** Productos, ventas, comisiones, ingresos
- **Actividad reciente:** Últimas acciones del sistema
- **Oportunidades:** Sugerencias de IA
- **Estado del sistema:** Workflow, Autopilot, APIs
- **Estado del sistema (Business Diagnostics):** Estado en tiempo real de Autopilot, Marketplace, Supplier, Payment, Database, Scheduler, Listings y Sales (OK/FAIL + conteos)

**Ubicación:** Menú lateral → Dashboard

---

## 🔍 Búsqueda de Oportunidades

### Búsqueda Manual

1. Ir a **Opportunities**
2. Ingresar URL de AliExpress o término de búsqueda
3. El sistema buscará y analizará productos
4. Revisar oportunidades encontradas
5. Seleccionar productos para publicar

### Búsqueda con IA

1. Ir a **Dashboard → AI Opportunity Finder**
2. El sistema sugiere productos basados en:
   - Tendencias de Google Trends
   - Análisis de rentabilidad
   - Demanda del mercado

---

## 📦 Gestión de Productos

### Ver Productos

1. Ir a **Products**
2. Filtrar por estado:
   - **Pending** - Esperando aprobación
   - **Published** - Publicados en marketplaces
   - **Sold** - Vendidos
   - **Archived** - Archivados

### Publicar Producto

1. Seleccionar producto en estado **Pending**
2. Hacer clic en **Publish**
3. Seleccionar marketplace (eBay, Amazon, MercadoLibre)
4. Revisar información y confirmar
5. El sistema publicará automáticamente (si el workflow está en modo Automatic)

---

## ⚙️ Configuración de Workflow

El workflow controla cómo se ejecutan las etapas del proceso de dropshipping.

### Modos Disponibles

- **Manual** - Requiere aprobación en cada etapa
- **Automatic** - Se ejecuta automáticamente
- **Guided** - Notifica y espera confirmación (timeout 5 minutos)

### Configurar Workflow

1. Ir a **Settings → Configuración de Workflow**
2. Seleccionar ambiente (Sandbox/Production)
3. Seleccionar modo global (Manual/Automatic/Hybrid)
4. Configurar cada etapa individualmente:
   - **SCRAPE** - Búsqueda de productos
   - **ANALYZE** - Análisis de rentabilidad
   - **PUBLISH** - Publicación en marketplaces
   - **PURCHASE** - Compra automática
   - **FULFILLMENT** - Gestión de envíos
   - **CUSTOMER SERVICE** - Atención al cliente

**Documentación completa:** Ver `docs/GUIDE_MOD_GUIDED_USUARIOS.md`

---

## 🤖 Sistema Autopilot

El Autopilot ejecuta el ciclo completo de dropshipping automáticamente 24/7.

### Activar Autopilot

1. Ir a **Autopilot**
2. Configurar parámetros:
   - Intervalo de ciclo (minutos)
   - Marketplace objetivo
   - Capital de trabajo disponible
   - Mínimo de ganancia y ROI
3. Activar Autopilot
4. El sistema ejecutará ciclos automáticamente

### Preset: 1 artículo de prueba

Para una primera prueba con mínimo riesgo, usar el botón **"Usar valores para 1 artículo de prueba (más económico)"**. Aplica: minProfitUsd=1, minSupplierPrice=0.50, minRoiPct=15, maxActiveProducts=1.

### Duplicar productos ganadores

Con **Repetir ganadores** activado y **Máx. duplicados por producto** > 1, el sistema duplica automáticamente listings de productos con buen rendimiento (WinningScore > 75), respetando capital y límites.

### Despublicación y reemplazo automático

Los productos con baja conversión, muchos días sin ventas o que exceden el capital disponible se despublican automáticamente. Tras cada despublicación, el Autopilot ejecuta un ciclo para buscar y publicar un producto de reemplazo.

**Documentación detallada:** [FEATURES_AUTOPILOT_AVANZADO.md](./FEATURES_AUTOPILOT_AVANZADO.md)

### Monitorear Autopilot

- Ver estadísticas en tiempo real
- Revisar productos publicados
- Ver rendimiento por categoría
- Ajustar configuración según resultados

---

## 💰 Finanzas y Comisiones

### Ver Comisiones

1. Ir a **Finance Dashboard**
2. Ver:
   - Comisiones pendientes
   - Comisiones pagadas
   - Ingresos totales
   - Gastos

### Comisiones

Las comisiones se calculan automáticamente:
- **Porcentaje:** Configurado por el administrador (típicamente 10-20%)
- **Costo fijo:** Costo mensual fijo (si aplica)

---

## 📈 Reportes

### Generar Reportes

1. Ir a **Reports**
2. Seleccionar tipo de reporte:
   - **Ventas** - Reporte detallado de ventas
   - **Productos** - Performance de productos
   - **Usuarios** - Rendimiento por usuario (solo admin)
   - **Marketplaces** - Analytics comparativo
   - **Ejecutivo** - Dashboard completo con KPIs
3. Configurar filtros (fechas, marketplaces, etc.)
4. Generar y descargar reporte

---

## 🆘 Ayuda y Soporte

### Centro de Ayuda

1. Ir a **Help Center** (menú lateral)
2. Navegar por secciones:
   - Inicio Rápido
   - Configuración
   - APIs y Credenciales
   - Gestión de Productos
   - Sistema Autopilot
   - Troubleshooting

### Documentación de APIs

1. Ir a **Help Center → APIs y Credenciales**
2. Hacer clic en **"Ver todas las guías de APIs"**
3. Buscar la API que necesitas configurar
4. Seguir la guía paso a paso

### Contactar Soporte

- Revisar [docs/TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- Consultar logs del sistema (si eres admin)
- Contactar al administrador del sistema

---

## 📚 Recursos Adicionales

- **Setup Local:** [docs/SETUP_LOCAL.md](./SETUP_LOCAL.md)
- **Architecture:** [docs/ARCHITECTURE.md](./ARCHITECTURE.md)
- **Guía Detallada de Workflow:** `docs/GUIDE_MOD_GUIDED_USUARIOS.md`
- **Funcionalidades Avanzadas Autopilot:** [FEATURES_AUTOPILOT_AVANZADO.md](./FEATURES_AUTOPILOT_AVANZADO.md)

---

**Última actualización:** 2025-03-04

