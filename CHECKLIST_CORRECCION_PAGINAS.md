# ✅ CHECKLIST CORRECCIÓN PÁGINAS - Ivan Reseller Web

**Fecha inicio:** 4 de noviembre de 2025  
**Páginas a corregir:** 9 páginas simplificadas + 3 archivos obsoletos  

---

## 🗑️ LIMPIEZA INMEDIATA (5 minutos)

### Archivos Obsoletos a Eliminar:

```bash
cd c:\Ivan_Reseller_Web\frontend\src\pages

# Eliminar duplicados de Dashboard
- [ ] rm Dashboard-complete.tsx       # 434 líneas - IDÉNTICO a Dashboard.tsx
- [ ] rm Dashboard-enhanced.tsx       # 465 líneas - Versión alternativa no usada

# Eliminar demo de Reports
- [ ] rm Reports-demo.tsx             # 99 líneas - Reports.tsx es la versión completa

# Commit
- [ ] git add .
- [ ] git commit -m "chore: Eliminar páginas obsoletas (Dashboard-complete, Dashboard-enhanced, Reports-demo)"
- [ ] git push origin main
```

---

## 🔴 FASE 1: PÁGINAS CRÍTICAS (10 horas)

### 1️⃣ Settings.tsx (6 horas) 🔴 PRIORIDAD MÁXIMA

**Estado actual:** 11 líneas - Solo texto estático  
**Estado objetivo:** 400+ líneas - Hub de configuración completo

#### Checklist de Implementación:

**Estructura Base:**
- [ ] Crear estado para activeTab
- [ ] Implementar sistema de Tabs con 4 secciones
- [ ] Agregar breadcrumb: Home / Settings

**Tab 1: General Settings**
- [ ] Idioma del sistema (español/inglés)
- [ ] Zona horaria
- [ ] Formato de fecha
- [ ] Formato de moneda
- [ ] Tema (light/dark)
- [ ] Guardar preferencias en /api/users/preferences

**Tab 2: API Configuration**
- [ ] Link a /api-config (APIConfiguration.tsx)
- [ ] Link a /api-settings (APISettings.tsx)
- [ ] Link a /api-keys (APIKeys.tsx)
- [ ] Estado de APIs (activas/inactivas)
- [ ] Último test de conexión

**Tab 3: Notifications**
- [ ] Email notifications (on/off)
- [ ] Push notifications (on/off)
- [ ] Configurar eventos:
  - [ ] Nueva oportunidad detectada
  - [ ] Venta completada
  - [ ] Comisión generada
  - [ ] Error en publicación
  - [ ] Stock bajo
- [ ] Test de notificaciones

**Tab 4: Profile**
- [ ] Nombre completo
- [ ] Email
- [ ] Teléfono
- [ ] Cambiar contraseña
- [ ] Avatar (upload opcional)
- [ ] Integrar con /api/users/:id

**Integraciones Backend:**
- [ ] GET /api/settings → obtener configuración actual
- [ ] PUT /api/settings → guardar cambios
- [ ] GET /api/users/:id → datos de perfil
- [ ] PUT /api/users/:id → actualizar perfil
- [ ] POST /api/users/:id/password → cambiar contraseña

**UI/UX:**
- [ ] Loading states en cada acción
- [ ] Toast notifications de éxito/error
- [ ] Validación de campos
- [ ] Botón "Save Changes" por tab
- [ ] Indicador de cambios sin guardar

**Testing:**
- [ ] Guardar cada tab funciona correctamente
- [ ] Links a api-config/api-settings/api-keys funcionan
- [ ] Cambio de contraseña con validación
- [ ] Notificaciones de prueba funcionan

---

### 2️⃣ Users.tsx (4 horas) 🔴 PRIORIDAD MÁXIMA

**Estado actual:** 10 líneas - Solo placeholder  
**Estado objetivo:** 350+ líneas - Gestión completa de usuarios

#### Checklist de Implementación:

**Estructura Base:**
- [ ] Verificar rol de admin (redirect si no es admin)
- [ ] Estado para users, loading, filters
- [ ] Breadcrumb: Home / Users

**Tabla de Usuarios:**
- [ ] Columnas: ID, Avatar, Name, Email, Role, Status, Created, Actions
- [ ] Formateo de fechas
- [ ] Badge para status (active/inactive)
- [ ] Badge para role (admin/user/viewer)

**Filtros:**
- [ ] Buscar por nombre/email
- [ ] Filtrar por rol (admin, user, viewer)
- [ ] Filtrar por status (active, inactive)
- [ ] Ordenar por: created, name, sales

**Acciones por Usuario:**
- [ ] Ver detalles (modal)
- [ ] Editar usuario (modal)
- [ ] Activar/Desactivar
- [ ] Cambiar rol (admin only)
- [ ] Resetear contraseña (enviar email)
- [ ] Ver estadísticas (link a Reports con filtro userId)

**Modal: Ver Detalles**
- [ ] Información personal
- [ ] Estadísticas:
  - [ ] Total productos
  - [ ] Total ventas
  - [ ] Revenue generado
  - [ ] Comisiones ganadas
- [ ] APIs configuradas
- [ ] Último login

**Modal: Editar Usuario**
- [ ] Nombre completo
- [ ] Email (validación)
- [ ] Teléfono
- [ ] Rol (dropdown: admin, user, viewer)
- [ ] Status (active/inactive toggle)
- [ ] Botón guardar

**Botón: Nuevo Usuario**
- [ ] Modal con formulario
- [ ] Campos: nombre, email, password, rol
- [ ] Validación de email único
- [ ] Enviar email de bienvenida
- [ ] POST /api/admin/users

**Integraciones Backend:**
- [ ] GET /api/admin/users → lista de usuarios
- [ ] GET /api/admin/users/:id → detalles
- [ ] POST /api/admin/users → crear usuario
- [ ] PUT /api/admin/users/:id → actualizar
- [ ] DELETE /api/admin/users/:id → desactivar
- [ ] POST /api/admin/users/:id/reset-password

**Link a AdminPanel:**
- [ ] Botón "Advanced Admin Settings" → /admin

**UI/UX:**
- [ ] Loading skeleton mientras carga
- [ ] Empty state si no hay usuarios
- [ ] Confirmación antes de desactivar usuario
- [ ] Toast notifications
- [ ] Paginación (20 por página)

**Testing:**
- [ ] Solo admin puede acceder
- [ ] CRUD completo funciona
- [ ] Filtros y búsqueda funcionan
- [ ] Estadísticas se calculan correctamente
- [ ] Email de reseteo se envía

---

## 🟡 FASE 2: PÁGINAS FUNCIONALES (18 horas)

### 3️⃣ FlexibleDropshipping.tsx (5 horas)

**Estado actual:** 25 líneas - Lista básica de reglas  
**Estado objetivo:** 400+ líneas - Sistema completo de reglas

#### Checklist:

**Estructura:**
- [ ] Estado: rules, suppliers, loading
- [ ] Breadcrumb: Home / Flexible Dropshipping

**Vista de Reglas:**
- [ ] Tabla con: Name, Type, Source, Targets, Status, Actions
- [ ] Tipos de reglas:
  - [ ] Price multiplier (precio × factor)
  - [ ] Fixed margin (precio + margen fijo)
  - [ ] Competitor-based (igualar competencia)
  - [ ] Dynamic (AI ajusta según demanda)

**CRUD de Reglas:**
- [ ] Modal: Nueva Regla
  - [ ] Nombre de la regla
  - [ ] Tipo de estrategia (dropdown)
  - [ ] Source marketplace (AliExpress, Alibaba)
  - [ ] Target marketplaces (eBay, Amazon, ML) - multi-select
  - [ ] Parámetros específicos por tipo
  - [ ] Activar/desactivar
- [ ] Editar regla (modal similar)
- [ ] Eliminar regla (confirmación)
- [ ] Duplicar regla

**Configuración de Suppliers:**
- [ ] Sección: "Supplier Configuration"
- [ ] Lista de suppliers:
  - [ ] AliExpress (configurado)
  - [ ] Alibaba (agregar)
  - [ ] 1688.com (agregar)
  - [ ] DHgate (agregar)
- [ ] Por supplier:
  - [ ] API credentials
  - [ ] Shipping time estimate
  - [ ] Default margin
  - [ ] Priority level (1-5)

**Mapeo Marketplace → Supplier:**
- [ ] Tabla de preferencias:
  - [ ] eBay US → AliExpress (priority 1)
  - [ ] Amazon US → Alibaba (priority 1)
  - [ ] MercadoLibre MX → AliExpress (priority 1)
- [ ] Editar prioridades

**Integraciones:**
- [ ] GET /api/automation/rules
- [ ] POST /api/automation/rules
- [ ] PUT /api/automation/rules/:id
- [ ] DELETE /api/automation/rules/:id
- [ ] GET /api/suppliers
- [ ] PUT /api/suppliers/:id

**Testing:**
- [ ] Crear regla de cada tipo
- [ ] Activar/desactivar regla
- [ ] Supplier preferences se guardan
- [ ] Validación de campos

---

### 4️⃣ RegionalConfig.tsx (4 horas)

**Estado actual:** 29 líneas - Solo mode y environment  
**Estado objetivo:** 300+ líneas - Configuración regional completa

#### Checklist:

**Estructura:**
- [ ] Estado: regions, currencies, taxes, shipping
- [ ] Tabs: Currencies, Taxes, Shipping, Languages

**Tab 1: Currencies**
- [ ] Tabla de regiones:
  - [ ] US → USD
  - [ ] UK → GBP
  - [ ] MX → MXN
  - [ ] BR → BRL
  - [ ] ES → EUR
  - [ ] DE → EUR
- [ ] Editar moneda por región
- [ ] Exchange rates (auto-update)
- [ ] Última actualización de rates

**Tab 2: Taxes**
- [ ] Configuración por país:
  - [ ] US: Sales tax por estado (0-10%)
  - [ ] UK: VAT (20%)
  - [ ] MX: IVA (16%)
  - [ ] BR: ICMS (variable)
- [ ] Editar tax rate por región
- [ ] Aplicar automáticamente en pricing

**Tab 3: Shipping**
- [ ] Shipping rates por marketplace:
  - [ ] eBay: Standard, Expedited, Overnight
  - [ ] Amazon: Prime, Standard
  - [ ] MercadoLibre: Full, Standard
- [ ] Configurar rates por peso/dimensión
- [ ] Free shipping threshold

**Tab 4: Languages**
- [ ] Idioma por marketplace:
  - [ ] eBay US → English
  - [ ] eBay UK → English
  - [ ] MercadoLibre MX → Español
  - [ ] MercadoLibre BR → Português
- [ ] Auto-traducción de listings (on/off)

**Integraciones:**
- [ ] GET /api/regional/config
- [ ] PUT /api/regional/currencies
- [ ] PUT /api/regional/taxes
- [ ] PUT /api/regional/shipping
- [ ] GET /api/fx/rates → exchange rates

**Testing:**
- [ ] Cambiar currency por región
- [ ] Actualizar tax rates
- [ ] Guardar shipping preferences
- [ ] Exchange rates se actualizan

---

### 5️⃣ Autopilot.tsx (6 horas)

**Estado actual:** 51 líneas - Botones básicos Start/Stop  
**Estado objetivo:** 450+ líneas - Sistema completo de automation

#### Checklist:

**Dashboard Principal:**
- [ ] Estado actual: Running / Stopped / Paused
- [ ] Tiempo en ejecución
- [ ] Última ejecución
- [ ] Próxima ejecución programada
- [ ] Métricas:
  - [ ] Oportunidades encontradas (24h)
  - [ ] Productos publicados (24h)
  - [ ] Ventas generadas (24h)
  - [ ] Success rate (%)

**Controles:**
- [ ] Botón Start (verde) → inicia autopilot
- [ ] Botón Stop (rojo) → detiene autopilot
- [ ] Botón Pause (amarillo) → pausa temporalmente
- [ ] Botón "Run Once" → ejecuta una vez sin schedule

**Configuración de Workflows:**
- [ ] Workflow 1: Search Opportunities
  - [ ] Schedule (cron expression)
  - [ ] Queries a buscar (lista editable)
  - [ ] Marketplaces target
  - [ ] Filtros (min profit, max competition)
  - [ ] Auto-add to pending (on/off)
- [ ] Workflow 2: Analyze Products
  - [ ] Schedule (cron)
  - [ ] Re-análisis de productos existentes
  - [ ] Ajustar precios según competencia
  - [ ] Actualizar stock desde supplier
- [ ] Workflow 3: Auto-Publish
  - [ ] Schedule (cron)
  - [ ] Auto-aprobar productos > X confidence
  - [ ] Marketplaces a publicar
  - [ ] Límite diario de publicaciones

**Vista de Tareas en Progreso:**
- [ ] Tabla real-time con:
  - [ ] Task ID
  - [ ] Type (search, analyze, publish)
  - [ ] Status (running, completed, failed)
  - [ ] Progress bar (0-100%)
  - [ ] Started at
  - [ ] Duration
- [ ] Auto-refresh cada 5 segundos

**Logs de Ejecución:**
- [ ] Lista de últimas 50 ejecuciones:
  - [ ] Timestamp
  - [ ] Workflow ejecutado
  - [ ] Resultado (success/failure)
  - [ ] Items procesados
  - [ ] Errores (si hay)
  - [ ] Duration

**Estadísticas:**
- [ ] Success rate últimos 7 días (LineChart)
- [ ] Oportunidades por día (BarChart)
- [ ] Avg duration por workflow
- [ ] Error rate por tipo

**Integraciones:**
- [ ] POST /api/automation/autopilot/start
- [ ] POST /api/automation/autopilot/stop
- [ ] POST /api/automation/autopilot/pause
- [ ] GET /api/automation/status
- [ ] GET /api/automation/tasks/active
- [ ] GET /api/automation/logs
- [ ] PUT /api/automation/workflows/:id

**Testing:**
- [ ] Start autopilot funciona
- [ ] Stop detiene todas las tareas
- [ ] Schedules se ejecutan correctamente
- [ ] Logs se muestran en tiempo real
- [ ] Métricas se actualizan

---

### 6️⃣ Jobs.tsx (3 horas)

**Estado actual:** 71 líneas - Tabla simple  
**Estado objetivo:** 250+ líneas - Sistema completo de jobs

#### Checklist:

**Filtros Avanzados:**
- [ ] Por estado: all, active, completed, failed, delayed
- [ ] Por tipo: publishing, scraping, analysis, sync
- [ ] Por fecha: today, week, month, custom range
- [ ] Buscar por productId o marketplace

**Tabla Mejorada:**
- [ ] Columnas actuales: ID, State, Progress, Product, Marketplaces, Started, Finished
- [ ] Nuevas columnas:
  - [ ] Type (badge con color)
  - [ ] Duration (calculado)
  - [ ] Retry count
  - [ ] Error message (si failed)

**Acciones por Job:**
- [ ] Ver detalles completos (modal)
- [ ] Retry job (si failed)
- [ ] Cancel job (si active)
- [ ] Ver logs de ejecución

**Modal: Detalles del Job**
- [ ] Job ID
- [ ] Type
- [ ] Status
- [ ] Input data (JSON viewer)
- [ ] Output/Result (JSON viewer)
- [ ] Timestamps: queued, started, finished
- [ ] Duration
- [ ] Logs completos
- [ ] Stack trace (si error)

**Acciones Bulk:**
- [ ] Seleccionar múltiples jobs (checkbox)
- [ ] Retry all failed
- [ ] Cancel all active
- [ ] Delete completed

**Estadísticas en Header:**
- [ ] Active jobs count
- [ ] Completed today
- [ ] Failed today
- [ ] Avg duration

**Paginación:**
- [ ] 20 jobs por página
- [ ] Navegación: First, Previous, Next, Last
- [ ] Jump to page

**Auto-refresh:**
- [ ] Toggle auto-refresh (on/off)
- [ ] Interval: 5 segundos
- [ ] Solo refresha si hay active jobs

**Integraciones:**
- [ ] GET /api/jobs/publishing/recent → actualizar con filtros
- [ ] GET /api/jobs/:id → detalles
- [ ] POST /api/jobs/:id/retry
- [ ] POST /api/jobs/:id/cancel
- [ ] DELETE /api/jobs/:id

**Testing:**
- [ ] Filtros funcionan correctamente
- [ ] Retry job lo reintenta
- [ ] Cancel job lo detiene
- [ ] Auto-refresh funciona
- [ ] Paginación correcta

---

## 🟢 FASE 3: MEJORAS Y OPTIMIZACIÓN (12 horas)

### 7️⃣ FinanceDashboard.tsx (5 horas)

**Estado actual:** 47 líneas - 3 métricas simples  
**Estado objetivo:** 400+ líneas - Dashboard financiero completo

#### Checklist:

**KPIs Principales:**
- [ ] Total Revenue (30d)
- [ ] Total Profit (30d)
- [ ] Pending Payouts
- [ ] **NUEVOS:**
  - [ ] Gross Margin %
  - [ ] Net Profit Margin %
  - [ ] ROI Average
  - [ ] Cash Flow (in - out)

**Gráficos:**
- [ ] Revenue Trend (LineChart 90 días)
- [ ] Profit vs Costs (BarChart por mes)
- [ ] Revenue by Marketplace (PieChart)
- [ ] Daily Sales (AreaChart 30 días)

**Breakdown por Marketplace:**
- [ ] Tabla con:
  - [ ] Marketplace
  - [ ] Total Sales
  - [ ] Revenue
  - [ ] Costs
  - [ ] Profit
  - [ ] Margin %

**Cash Flow Projection:**
- [ ] Próximos 30 días estimados
- [ ] Ingresos esperados (ventas pendientes)
- [ ] Gastos fijos (subscripciones, etc)
- [ ] Comisiones a pagar
- [ ] Balance proyectado

**Tax Reports:**
- [ ] Sección "Tax Summary"
- [ ] Tax collected por región
- [ ] Tax owed
- [ ] Tax paid
- [ ] Link para exportar reporte fiscal

**Filtros:**
- [ ] Date range picker
- [ ] Por marketplace
- [ ] Por categoría de producto

**Integraciones:**
- [ ] GET /api/reports/finance
- [ ] GET /api/reports/cash-flow
- [ ] GET /api/reports/tax-summary

**Testing:**
- [ ] Gráficos se renderizan correctamente
- [ ] Métricas coinciden con datos reales
- [ ] Filtros actualizan los datos
- [ ] Cash flow projection es razonable

---

### 8️⃣ SystemLogs.tsx (3 horas)

**Estado actual:** 32 líneas - SSE stream básico  
**Estado objetivo:** 200+ líneas - Visor de logs avanzado

#### Checklist:

**Filtros:**
- [ ] Por nivel: all, info, warning, error, critical
- [ ] Por módulo: api, scraper, autopilot, publisher, auth
- [ ] Por fecha/hora: desde, hasta
- [ ] Búsqueda por texto (regex)

**Vista de Logs:**
- [ ] Línea por línea con:
  - [ ] Timestamp
  - [ ] Level (badge con color)
  - [ ] Module
  - [ ] Message
  - [ ] Details (expandible)
- [ ] Syntax highlighting para JSON/stack traces
- [ ] Auto-scroll toggle (on/off)

**Controles:**
- [ ] Botón Pause stream
- [ ] Botón Clear logs
- [ ] Botón Export logs (CSV/JSON)
- [ ] Slider para max logs en pantalla (50-500)

**Estadísticas:**
- [ ] Logs count por nivel (últimos 60min)
- [ ] Errors per minute (LineChart)
- [ ] Most common errors (top 5)

**Paginación:**
- [ ] Cargar más logs (botón "Load More")
- [ ] Scroll infinito opcional

**Integraciones:**
- [ ] SSE: /api/logs/stream
- [ ] GET /api/logs → logs históricos
- [ ] POST /api/logs/export

**Testing:**
- [ ] Stream SSE funciona
- [ ] Filtros aplican correctamente
- [ ] Búsqueda por texto encuentra matches
- [ ] Export logs descarga archivo
- [ ] Auto-scroll funciona

---

### 9️⃣ Estandarización General (4 horas)

#### Nomenclatura:

**Opportunities.tsx:**
- [ ] Cambiar título: "Real Opportunities" → "Opportunities"
- [ ] Actualizar breadcrumb

**RegionalConfig.tsx:**
- [ ] Cambiar título: "Regional Configuration" → "Regional Config"
- [ ] Actualizar breadcrumb

**HelpCenter.tsx:**
- [ ] Cambiar título: "Centro de Ayuda" → "Help Center"
- [ ] Traducir contenido a inglés (opcional)

#### CSS Consistente:

**Todas las páginas:**
- [ ] Contenedor principal: `<div className="p-6 space-y-4">`
- [ ] Título h1: `<h1 className="text-2xl font-bold text-gray-900">`
- [ ] Subtítulo: `<p className="text-gray-600">`
- [ ] Cards: `className="bg-white border rounded-lg p-4"`

**Páginas a actualizar:**
- [ ] Settings.tsx
- [ ] Users.tsx
- [ ] Dashboard.tsx (solo ajustar padding)

#### Limpieza de Imports:

**Dashboard.tsx:**
- [ ] Revisar 27 iconos importados
- [ ] Eliminar los no usados
- [ ] Ejecutar ESLint para detectar más

**Products.tsx, Sales.tsx, etc:**
- [ ] Limpiar imports no utilizados en cada página
- [ ] Organizar imports: React → Libraries → Local

#### Dashboard con Backend Real:

**Dashboard.tsx líneas 88-96:**
```tsx
// ANTES:
setDashboardData({
  totalSales: 15420.50,
  totalProfit: 4280.30,
  // ...
});

// DESPUÉS:
- [ ] Crear endpoint: GET /api/dashboard/metrics
- [ ] Implementar en backend:
  - [ ] Total sales (últimos 30d)
  - [ ] Total profit
  - [ ] Active products count
  - [ ] Opportunities count (hoy)
  - [ ] AI suggestions count
  - [ ] Automation rules count
- [ ] Actualizar frontend para usar API
```

**Dashboard.tsx líneas 52-81:**
```tsx
// ANTES:
const [recentActivity] = useState([hardcoded array]);

// DESPUÉS:
- [ ] Crear endpoint: GET /api/dashboard/recent-activity
- [ ] Implementar en backend:
  - [ ] Últimas 10 actividades
  - [ ] Tipos: sale, opportunity, automation, inventory
  - [ ] Ordenadas por timestamp desc
- [ ] Actualizar frontend para usar API
- [ ] Agregar auto-refresh cada 30 segundos
```

---

## 📊 PROGRESO GLOBAL

### Limpieza:
```
⬜ Eliminar Dashboard-complete.tsx
⬜ Eliminar Dashboard-enhanced.tsx
⬜ Eliminar Reports-demo.tsx
```

### Fase 1 - Páginas Críticas (10h):
```
⬜ Settings.tsx completo          (0/6h)
⬜ Users.tsx completo              (0/4h)
```

### Fase 2 - Páginas Funcionales (18h):
```
⬜ FlexibleDropshipping.tsx        (0/5h)
⬜ RegionalConfig.tsx              (0/4h)
⬜ Autopilot.tsx                   (0/6h)
⬜ Jobs.tsx                        (0/3h)
```

### Fase 3 - Mejoras (12h):
```
⬜ FinanceDashboard.tsx            (0/5h)
⬜ SystemLogs.tsx                  (0/3h)
⬜ Estandarización general         (0/4h)
```

**Total:** 0/40 horas completadas (0%)

---

## 🎯 CRITERIOS DE ACEPTACIÓN

### Cada página debe cumplir:

✅ **Funcionalidad:**
- [ ] Todas las features descritas implementadas
- [ ] Integración con backend completa
- [ ] CRUD funciona correctamente (si aplica)
- [ ] Sin console.errors

✅ **UI/UX:**
- [ ] Loading states en todas las acciones
- [ ] Toast notifications de éxito/error
- [ ] Empty states cuando no hay datos
- [ ] Confirmaciones antes de acciones destructivas
- [ ] Responsive design (mobile-friendly)

✅ **Código:**
- [ ] Sin imports no utilizados
- [ ] Sin console.logs
- [ ] Comentarios en lógica compleja
- [ ] Nombres de variables descriptivos
- [ ] TypeScript types correctos

✅ **Testing:**
- [ ] Todas las features principales probadas
- [ ] Happy path funciona
- [ ] Error handling funciona
- [ ] Edge cases considerados

---

## 📝 NOTAS DE DESARROLLO

### Tips:
1. **Reutilizar componentes existentes:**
   - Modals de Products.tsx
   - Filtros de Sales.tsx
   - Tabs de Dashboard.tsx

2. **Usar shadcn/ui components:**
   - Button, Input, Select
   - DatePicker
   - Tabs, Card
   - Badge, Toast

3. **Copiar patrones de páginas completas:**
   - Products.tsx para CRUD
   - Sales.tsx para filtros y tabla
   - Reports.tsx para gráficos

4. **Backend endpoints:**
   - Verificar que existan antes de integrar
   - Crear endpoint en backend si falta
   - Probar con Postman/curl primero

---

**Documento creado:** 4 de noviembre de 2025  
**Actualizar progreso:** Después de completar cada página  
**Revisión final:** Cuando todas las checkboxes estén ✅
