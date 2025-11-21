# 📚 DOCUMENTACIÓN COMPLETA DEL MODELO IVAN RESELLER
## Manual de Funciones, Objetivos y Servicios para Admin y Usuarios

**Fecha de Documentación:** 2025-11-20  
**Versión del Sistema:** 1.0  
**Plataforma Web:** www.ivanreseller.com

---

## 📋 TABLA DE CONTENIDOS

1. [Introducción y Objetivo General](#1-introducción-y-objetivo-general)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Funcionalidades Core para Usuarios](#3-funcionalidades-core-para-usuarios)
4. [Funcionalidades Core para Administradores](#4-funcionalidades-core-para-administradores)
5. [Sistema de Dropshipping](#5-sistema-de-dropshipping)
6. [Sistema de Automatización](#6-sistema-de-automatización)
7. [Sistema Financiero](#7-sistema-financiero)
8. [Integración con Marketplaces](#8-integración-con-marketplaces)
9. [Sistema de Oportunidades y Scraping](#9-sistema-de-oportunidades-y-scraping)
10. [Gestión de Productos](#10-gestión-de-productos)
11. [Gestión de Ventas y Órdenes](#11-gestión-de-ventas-y-órdenes)
12. [Sistema de Comisiones](#12-sistema-de-comisiones)
13. [Notificaciones y Alertas](#13-notificaciones-y-alertas)
14. [Reportes y Analytics](#14-reportes-y-analytics)
15. [Configuración y Administración](#15-configuración-y-administración)
16. [Servicios de Soporte](#16-servicios-de-soporte)

---

## 1. INTRODUCCIÓN Y OBJETIVO GENERAL

### 1.1 ¿Qué es Ivan Reseller?

**Ivan Reseller** es una plataforma web completa de dropshipping automatizado que permite a usuarios:

1. **Buscar oportunidades de negocio** en AliExpress automáticamente
2. **Publicar productos** en múltiples marketplaces (eBay, Amazon, MercadoLibre)
3. **Gestionar ventas** de forma automatizada
4. **Calcular ganancias** y comisiones automáticamente
5. **Operar sin inventario propio** (dropshipping)

### 1.2 Objetivo Principal

**Para Usuarios:**
- Facilitar el inicio en el negocio de dropshipping
- Automatizar la búsqueda y publicación de productos
- Optimizar la rentabilidad mediante análisis inteligente
- Gestionar todas las operaciones desde una sola plataforma

**Para Administradores:**
- Gestionar usuarios y sus actividades
- Controlar el sistema de comisiones
- Monitorear el rendimiento general
- Configurar y mantener el sistema

---

## 2. ARQUITECTURA DEL SISTEMA

### 2.1 Componentes Principales

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + TypeScript)             │
│  - 23 páginas de usuario/admin                              │
│  - Interfaz reactiva con React Query                        │
│  - Notificaciones en tiempo real (Socket.IO)                │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                 BACKEND API (Node.js + Express)              │
│  - 194+ endpoints REST                                       │
│  - 58+ servicios especializados                             │
│  - Autenticación JWT                                         │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│              BASE DE DATOS (PostgreSQL + Prisma)             │
│  - Sistema multi-tenant                                      │
│  - Gestión de usuarios, productos, ventas                   │
│  - Historial de oportunidades                                │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│           INTEGRACIONES EXTERNAS                             │
│  - AliExpress (scraping)                                     │
│  - eBay API                                                  │
│  - Amazon SP-API                                             │
│  - MercadoLibre API                                          │
│  - PayPal (pagos)                                            │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Flujo Principal de Dropshipping

```
1. BUSCAR OPORTUNIDADES
   ↓
2. ANALIZAR PRODUCTOS (precios, competencia, margen)
   ↓
3. IMPORTAR/CREAR PRODUCTO
   ↓
4. APROBAR PRODUCTO (usuario o admin)
   ↓
5. PUBLICAR EN MARKETPLACES
   ↓
6. RECIBIR VENTA
   ↓
7. REGISTRAR VENTA EN SISTEMA
   ↓
8. COMPRAR EN ALIEXPRESS (futuro: automático)
   ↓
9. CALCULAR COMISIONES
   ↓
10. PAGO A USUARIO
```

---

## 3. FUNCIONALIDADES CORE PARA USUARIOS

### 3.1 🔐 Autenticación y Sesión

#### **Login/Logout**
- **Objetivo:** Acceso seguro al sistema
- **Funciones:**
  - Login con email/contraseña
  - Autenticación JWT (tokens)
  - Sesión persistente
  - Logout seguro
- **Servicios:**
  - `POST /api/auth/login` - Iniciar sesión
  - `POST /api/auth/logout` - Cerrar sesión
  - `POST /api/auth/refresh` - Renovar token
  - `GET /api/auth/me` - Obtener usuario actual
- **Para el usuario:** Acceso rápido y seguro a su cuenta
- **Para el admin:** Control de acceso y seguridad

---

### 3.2 📊 Dashboard Principal

#### **Dashboard Personalizado**
- **Objetivo:** Vista general del negocio del usuario
- **Funciones:**
  - Métricas de productos (total, publicados, pendientes)
  - Métricas de ventas (total, este mes, pendientes)
  - Métricas de ganancias (bruta, neta, comisiones)
  - Gráficos de tendencias
  - Últimas actividades
- **Servicios:**
  - `GET /api/dashboard` - Datos del dashboard
  - `GET /api/dashboard/stats` - Estadísticas generales
- **Para el usuario:** Monitoreo en tiempo real de su negocio
- **Para el admin:** Visión general del rendimiento de usuarios

---

### 3.3 🔍 Sistema de Búsqueda de Oportunidades

#### **Opportunity Finder (Buscador de Oportunidades)**
- **Objetivo:** Encontrar productos rentables en AliExpress automáticamente
- **Funciones:**
  1. **Búsqueda por palabra clave** en AliExpress
  2. **Análisis de competencia** en eBay, Amazon, MercadoLibre
  3. **Cálculo de margen de ganancia** automático
  4. **Estimación de ROI** (Retorno de Inversión)
  5. **Sugerencia de precio óptimo**
  6. **Análisis de demanda del mercado**
  7. **Score de confianza** (0-100)
- **Servicios:**
  - `POST /api/opportunities/search` - Buscar oportunidades
  - `GET /api/opportunities/history` - Historial de búsquedas
  - `GET /api/opportunities/:id` - Detalle de oportunidad
- **Componente Frontend:** `/opportunities`
- **Para el usuario:** Encuentra productos rentables sin esfuerzo manual
- **Para el admin:** Monitorea qué oportunidades buscan los usuarios

**Ejemplo de resultado:**
```json
{
  "title": "Wireless Earbuds",
  "aliexpressPrice": 15.50,
  "suggestedPrice": 35.99,
  "profitMargin": 0.57,
  "roiPercentage": 132.2,
  "competitionLevel": "low",
  "marketDemand": "high",
  "confidenceScore": 85
}
```

---

### 3.4 📦 Gestión de Productos

#### **Productos (CRUD Completo)**
- **Objetivo:** Gestionar el catálogo de productos del usuario
- **Funciones:**
  1. **Crear producto** (desde oportunidad o manualmente)
  2. **Listar productos** (con filtros: estado, fecha, categoría)
  3. **Editar producto** (precio, título, descripción, imágenes)
  4. **Cambiar estado** (PENDING → APPROVED → PUBLISHED)
  5. **Eliminar producto**
  6. **Ver estadísticas** de productos
- **Estados del Producto:**
  - `PENDING` - Pendiente de aprobación
  - `APPROVED` - Aprobado para publicar
  - `REJECTED` - Rechazado
  - `PUBLISHED` - Publicado en marketplaces
  - `INACTIVE` - Desactivado
- **Servicios:**
  - `GET /api/products` - Listar productos
  - `POST /api/products` - Crear producto
  - `GET /api/products/:id` - Detalle de producto
  - `PUT /api/products/:id` - Actualizar producto
  - `PATCH /api/products/:id/status` - Cambiar estado
  - `DELETE /api/products/:id` - Eliminar producto
  - `GET /api/products/stats` - Estadísticas
- **Componente Frontend:** `/products`
- **Para el usuario:** Control total sobre su catálogo
- **Para el admin:** Supervisa productos de todos los usuarios

---

### 3.5 🚀 Intelligent Publisher (Publicador Inteligente)

#### **Publisher (Publicación Inteligente)**
- **Objetivo:** Publicar productos en múltiples marketplaces de forma inteligente
- **Funciones:**
  1. **Lista de productos pendientes** de publicación
  2. **Aprobación de productos** antes de publicar
  3. **Publicación automática** a eBay, Amazon, MercadoLibre
  4. **Optimización de títulos** y descripciones
  5. **Sugerencias de precio** por marketplace
  6. **Gestión de imágenes** (multi-imagen)
  7. **Tracking de publicaciones** (exitosas/fallidas)
- **Servicios:**
  - `GET /api/publisher/pending` - Productos pendientes
  - `POST /api/publisher/approve/:id` - Aprobar producto
  - `POST /api/publisher/publish/:id` - Publicar producto
  - `GET /api/publisher/published` - Productos publicados
- **Componente Frontend:** `/publisher`
- **Para el usuario:** Publica productos en minutos en múltiples marketplaces
- **Para el admin:** Controla qué productos se publican y dónde

---

### 3.6 💰 Gestión de Ventas

#### **Sales (Ventas)**
- **Objetivo:** Registrar y gestionar las ventas realizadas
- **Funciones:**
  1. **Registrar venta** (manual o automática desde webhook)
  2. **Listar ventas** (con filtros: estado, fecha, producto)
  3. **Ver detalle de venta** (producto, cliente, tracking)
  4. **Actualizar estado** (PENDING → PROCESSING → SHIPPED → DELIVERED)
  5. **Tracking de órdenes** (número de seguimiento)
  6. **Cálculo automático de ganancias**
- **Estados de Venta:**
  - `PENDING` - Pendiente de procesar
  - `PROCESSING` - En proceso
  - `SHIPPED` - Enviado
  - `DELIVERED` - Entregado
  - `CANCELLED` - Cancelado
- **Servicios:**
  - `GET /api/sales` - Listar ventas
  - `POST /api/sales` - Registrar venta
  - `GET /api/sales/:id` - Detalle de venta
  - `PATCH /api/sales/:id/status` - Actualizar estado
  - `GET /api/sales/stats` - Estadísticas de ventas
- **Componente Frontend:** `/sales`
- **Para el usuario:** Gestiona todas sus ventas en un solo lugar
- **Para el admin:** Supervisa ventas de todos los usuarios

---

### 3.7 💸 Sistema de Comisiones

#### **Commissions (Comisiones)**
- **Objetivo:** Gestionar el cálculo y pago de comisiones
- **Funciones:**
  1. **Cálculo automático** al registrar venta
  2. **Lista de comisiones** (PENDING, SCHEDULED, PAID)
  3. **Programación de pagos** (fechas automáticas)
  4. **Pago individual o en lote**
  5. **Historial de pagos**
  6. **Balance del usuario**
- **Estructura de Comisiones:**
  - **Comisión de Usuario:** 10% de ganancia bruta (configurable)
  - **Comisión de Admin:** 2% fijo del precio de venta
  - **Ganancia Neta:** Precio venta - Costo - Comisiones
- **Estados de Comisión:**
  - `PENDING` - Pendiente de calcular
  - `SCHEDULED` - Programada para pago
  - `PAID` - Pagada
  - `FAILED` - Falló el pago
- **Servicios:**
  - `GET /api/commissions` - Listar comisiones
  - `GET /api/commissions/:id` - Detalle de comisión
  - `POST /api/commissions/pay/:id` - Pagar comisión
  - `GET /api/commissions/balance` - Balance del usuario
  - `GET /api/commissions/stats` - Estadísticas
- **Componente Frontend:** `/commissions`
- **Para el usuario:** Ve cuánto gana y cuándo cobra
- **Para el admin:** Controla los pagos y el sistema de comisiones

---

### 3.8 🤖 Autopilot (Modo Automático)

#### **Autopilot (Sistema Automatizado)**
- **Objetivo:** Automatizar completamente el proceso de dropshipping
- **Funciones:**
  1. **Búsqueda automática** de oportunidades (configurable)
  2. **Análisis automático** de competencia y márgenes
  3. **Publicación automática** (si está habilitado)
  4. **Optimización por categoría** (aprende qué categorías funcionan mejor)
  5. **Gestión de capital** (controla cuánto invierte)
  6. **Reportes de performance** por categoría
  7. **Recomendaciones inteligentes** basadas en resultados
- **Configuración:**
  - **Intervalo de ciclos:** Cada cuánto tiempo busca (ej: cada 6 horas)
  - **Modo de publicación:** Automático o manual (requiere aprobación)
  - **Marketplace objetivo:** eBay, Amazon, MercadoLibre, o todos
  - **Capital de trabajo:** Presupuesto máximo para publicar
  - **Márgenes mínimos:** Margen mínimo aceptado (ej: 30%)
  - **Queries de búsqueda:** Lista de términos a buscar
- **Servicios:**
  - `GET /api/autopilot/status` - Estado del autopilot
  - `POST /api/autopilot/start` - Iniciar autopilot
  - `POST /api/autopilot/stop` - Detener autopilot
  - `GET /api/autopilot/config` - Configuración actual
  - `PUT /api/autopilot/config` - Actualizar configuración
  - `GET /api/autopilot/stats` - Estadísticas de performance
  - `GET /api/autopilot/report` - Reporte detallado
- **Componente Frontend:** `/autopilot`
- **Para el usuario:** Deja que el sistema trabaje automáticamente
- **Para el admin:** Monitorea el uso del autopilot por usuarios

---

### 3.9 💵 Finance Dashboard (Dashboard Financiero)

#### **Finance Dashboard**
- **Objetivo:** Visualizar y analizar la situación financiera del usuario
- **Funciones:**
  1. **Ingresos totales** (por período)
  2. **Gastos totales** (comisiones, costos)
  3. **Ganancias netas** (ingresos - gastos)
  4. **Gráficos de tendencias** (línea de tiempo)
  5. **Proyecciones** basadas en tendencias
  6. **Análisis por categoría** de producto
  7. **Análisis por marketplace**
- **Servicios:**
  - `GET /api/finance/summary` - Resumen financiero
  - `GET /api/finance/revenue` - Ingresos detallados
  - `GET /api/finance/expenses` - Gastos detallados
  - `GET /api/finance/trends` - Tendencias y gráficos
  - `GET /api/finance/projections` - Proyecciones futuras
- **Componente Frontend:** `/finance`
- **Para el usuario:** Entiende su rentabilidad y toma mejores decisiones
- **Para el admin:** Analiza el rendimiento financiero del sistema

---

### 3.10 ⚙️ Settings (Configuración Personal)

#### **Settings (Configuración)**
- **Objetivo:** Personalizar la experiencia del usuario
- **Funciones:**
  1. **Moneda base** (USD, EUR, CLP, etc.)
  2. **Idioma** (futuro)
  3. **Notificaciones** (email, push)
  4. **Configuración de margen mínimo** personalizado
  5. **Preferencias de marketplace** (cuál usar por defecto)
  6. **Límite de productos pendientes** (controlar cuántos productos pueden estar pendientes)
- **Servicios:**
  - `GET /api/settings` - Obtener configuración
  - `PUT /api/settings` - Actualizar configuración
- **Componente Frontend:** `/settings`
- **Para el usuario:** Personaliza el sistema a su medida
- **Para el admin:** Ve las preferencias de los usuarios

---

## 4. FUNCIONALIDADES CORE PARA ADMINISTRADORES

### 4.1 👥 Gestión de Usuarios

#### **Users (Administración de Usuarios)**
- **Objetivo:** Gestionar todos los usuarios del sistema
- **Funciones:**
  1. **Listar usuarios** (con filtros: rol, estado, fecha registro)
  2. **Crear usuario** (nuevo usuario)
  3. **Editar usuario** (rol, permisos, estado)
  4. **Eliminar usuario** (soft delete)
  5. **Ver estadísticas** por usuario (productos, ventas, ganancias)
  6. **Activar/Desactivar** usuarios
- **Roles:**
  - `ADMIN` - Administrador total del sistema
  - `USER` - Usuario regular (dropshipper)
- **Servicios:**
  - `GET /api/users` - Listar usuarios (solo admin)
  - `POST /api/users` - Crear usuario (solo admin)
  - `GET /api/users/:id` - Detalle de usuario
  - `PUT /api/users/:id` - Actualizar usuario
  - `DELETE /api/users/:id` - Eliminar usuario
  - `GET /api/users/:id/stats` - Estadísticas del usuario
- **Componente Frontend:** `/users` (solo visible para admin)
- **Para el admin:** Control total sobre usuarios del sistema

---

### 4.2 💼 Admin Panel (Panel de Administración)

#### **Admin Panel**
- **Objetivo:** Vista general del sistema para administradores
- **Funciones:**
  1. **Dashboard administrativo** (métricas globales)
  2. **Gestión de comisiones** (configuración y pagos)
  3. **Configuración del sistema** (parámetros globales)
  4. **Monitoreo de salud** del sistema
  5. **Reportes administrativos**
  6. **Gestión de precios** (tiers de precios)
- **Servicios:**
  - `GET /api/admin/stats` - Estadísticas globales
  - `GET /api/admin/users` - Lista de usuarios
  - `GET /api/admin/revenue` - Ingresos globales
  - `GET /api/admin/commissions` - Comisiones pendientes
  - `PUT /api/admin/config` - Configurar sistema
- **Componente Frontend:** `/admin`
- **Para el admin:** Control central del sistema

---

### 4.3 📋 Sistema de Logs

#### **System Logs (Logs del Sistema)**
- **Objetivo:** Monitorear y debuggear el sistema
- **Funciones:**
  1. **Ver logs del sistema** (errores, warnings, info)
  2. **Filtrar logs** (por nivel, fecha, servicio)
  3. **Buscar en logs** (texto libre)
  4. **Exportar logs** (para análisis)
- **Niveles de Log:**
  - `ERROR` - Errores críticos
  - `WARN` - Advertencias
  - `INFO` - Información general
  - `DEBUG` - Información de depuración
- **Servicios:**
  - `GET /api/logs` - Obtener logs (solo admin)
  - `GET /api/logs/:level` - Filtrar por nivel
- **Componente Frontend:** `/logs` (solo visible para admin)
- **Para el admin:** Diagnóstico y mantenimiento del sistema

---

### 4.4 💳 Gestión de Comisiones (Admin)

#### **Admin Commissions (Administración de Comisiones)**
- **Objetivo:** Controlar el sistema de comisiones y pagos
- **Funciones:**
  1. **Configurar porcentajes** de comisión
  2. **Aprobar pagos** manualmente
  3. **Procesar pagos en lote** (todos los pendientes)
  4. **Ver historial** de pagos a usuarios
  5. **Gestionar estados** de comisiones
  6. **Reportes de comisiones** (cuánto se ha pagado)
- **Servicios:**
  - `GET /api/admin/commissions` - Lista de comisiones (todos los usuarios)
  - `POST /api/admin/commissions/approve` - Aprobar pago
  - `POST /api/admin/commissions/pay-all` - Pagar todas las pendientes
  - `GET /api/admin/commissions/stats` - Estadísticas de comisiones
- **Componente Frontend:** `/admin` (sección de comisiones)
- **Para el admin:** Control sobre pagos y comisiones del sistema

---

## 5. SISTEMA DE DROPSHIPPING

### 5.1 🔄 Flexible Dropshipping

#### **Flexible Dropshipping (Dropshipping Flexible)**
- **Objetivo:** Sistema flexible y configurable de dropshipping
- **Funciones:**
  1. **Configuración de reglas** personalizadas
  2. **Gestión de inventario virtual** (sin stock real)
  3. **Automatización** de reordenamiento
  4. **Gestión de múltiples proveedores** (futuro)
  5. **Tracking de envíos** automático
  6. **Gestión de devoluciones** (futuro)
- **Servicios:**
  - `GET /api/dropshipping/rules` - Reglas configuradas
  - `POST /api/dropshipping/rules` - Crear regla
  - `PUT /api/dropshipping/rules/:id` - Actualizar regla
  - `GET /api/dropshipping/inventory` - Inventario virtual
  - `GET /api/dropshipping/shipments` - Envíos en curso
- **Componente Frontend:** `/flexible`
- **Para el usuario:** Configuración avanzada de dropshipping
- **Para el admin:** Controla reglas globales de dropshipping

---

### 5.2 🌍 Regional Config (Configuración Regional)

#### **Regional Configuration**
- **Objetivo:** Configurar el sistema según región geográfica
- **Funciones:**
  1. **Moneda regional** (por país/región)
  2. **Marketplaces por región** (qué marketplaces usar)
  3. **Configuración de envío** (costos, tiempos)
  4. **Impuestos y tasas** regionales
  5. **Idioma** por región (futuro)
- **Servicios:**
  - `GET /api/regional/config` - Configuración regional
  - `PUT /api/regional/config` - Actualizar configuración
  - `GET /api/regional/marketplaces` - Marketplaces por región
  - `GET /api/regional/shipping` - Configuración de envío
- **Componente Frontend:** `/regional`
- **Para el usuario:** Configura el sistema para su región
- **Para el admin:** Define configuraciones regionales globales

---

## 6. SISTEMA DE AUTOMATIZACIÓN

### 6.1 🤖 Autopilot Service

#### **Autopilot Service (Servicio de Autopilot)**
- **Objetivo:** Automatizar completamente el ciclo de dropshipping
- **Funciones Internas:**
  1. **Búsqueda programada** de oportunidades
  2. **Análisis automático** de viabilidad
  3. **Creación automática** de productos
  4. **Publicación automática** (si está configurado)
  5. **Monitoreo de performance** de productos publicados
  6. **Ajuste automático** de estrategias basado en resultados
- **Para el usuario:** El sistema trabaja solo
- **Para el admin:** Monitorea el autopilot a nivel global

---

### 6.2 ⚙️ Automation Service

#### **Automation Service (Servicio de Automatización)**
- **Objetivo:** Automatizar tareas específicas del sistema
- **Funciones:**
  1. **Tareas programadas** (cron jobs)
  2. **Eventos automáticos** (cuando X ocurre, hacer Y)
  3. **Flujos de trabajo** personalizados
  4. **Integraciones** con servicios externos
- **Servicios:**
  - `GET /api/automation/tasks` - Tareas automatizadas
  - `POST /api/automation/tasks` - Crear tarea
  - `PUT /api/automation/tasks/:id` - Actualizar tarea
- **Para el usuario:** Personaliza automatizaciones
- **Para el admin:** Controla automatizaciones globales

---

### 6.3 📅 Jobs (Trabajos en Segundo Plano)

#### **Jobs (Sistema de Trabajos)**
- **Objetivo:** Gestionar tareas que se ejecutan en segundo plano
- **Funciones:**
  1. **Lista de jobs** (scraping, publicación, análisis)
  2. **Estado de jobs** (pending, running, completed, failed)
  3. **Logs de ejecución** de cada job
  4. **Cancelar jobs** en ejecución
  5. **Reintentar jobs** fallidos
  6. **Historial de jobs**
- **Tipos de Jobs:**
  - `SCRAPE_ALIEXPRESS` - Scraping de AliExpress
  - `PUBLISH_PRODUCT` - Publicar producto
  - `ANALYZE_COMPETITION` - Analizar competencia
  - `CALCULATE_PRICES` - Calcular precios
  - `SYNC_MARKETPLACE` - Sincronizar con marketplace
- **Servicios:**
  - `GET /api/jobs` - Listar jobs
  - `GET /api/jobs/:id` - Detalle de job
  - `POST /api/jobs/:id/cancel` - Cancelar job
  - `POST /api/jobs/:id/retry` - Reintentar job
  - `GET /api/jobs/stats` - Estadísticas de jobs
- **Componente Frontend:** `/jobs`
- **Para el usuario:** Ve qué tareas se están ejecutando
- **Para el admin:** Monitorea todos los jobs del sistema

---

## 7. SISTEMA FINANCIERO

### 7.1 💰 Cost Calculator (Calculadora de Costos)

#### **Cost Calculator Service**
- **Objetivo:** Calcular costos y márgenes de productos
- **Funciones:**
  1. **Cálculo de costo total** (precio + envío + comisiones)
  2. **Cálculo de margen** de ganancia
  3. **Cálculo de ROI** (Retorno de Inversión)
  4. **Comparación** con competencia
  5. **Sugerencia de precio** óptimo
- **Para el usuario:** Entiende la rentabilidad de cada producto
- **Para el admin:** Analiza rentabilidad global

---

### 7.2 💱 FX Service (Servicio de Tipos de Cambio)

#### **FX Service (Servicio de Conversión de Moneda)**
- **Objetivo:** Convertir precios entre diferentes monedas
- **Funciones:**
  1. **Conversión** de moneda (USD, EUR, CLP, etc.)
  2. **Actualización automática** de tasas de cambio
  3. **Historial de tasas** de cambio
  4. **Redondeo inteligente** por moneda (CLP sin decimales, USD con 2 decimales)
- **Servicios:**
  - `GET /api/currency/rates` - Tasas de cambio actuales
  - `POST /api/currency/convert` - Convertir moneda
  - `GET /api/currency/history` - Historial de tasas
- **Para el usuario:** Ve precios en su moneda local
- **Para el admin:** Gestiona tasas de cambio globales

---

### 7.3 📊 Business Metrics (Métricas de Negocio)

#### **Business Metrics Service**
- **Objetivo:** Calcular métricas avanzadas de negocio
- **Funciones:**
  1. **LTV** (Lifetime Value - Valor de vida del cliente)
  2. **CAC** (Customer Acquisition Cost - Costo de adquisición)
  3. **Churn Rate** (Tasa de abandono)
  4. **Revenue per User** (Ingresos por usuario)
  5. **Growth Rate** (Tasa de crecimiento)
- **Servicios:**
  - `GET /api/business-metrics/ltv` - LTV de usuarios
  - `GET /api/business-metrics/cac` - CAC
  - `GET /api/business-metrics/churn` - Tasa de churn
  - `GET /api/business-metrics/revenue-per-user` - Ingresos por usuario
- **Para el usuario:** Ve métricas de su negocio
- **Para el admin:** Analiza métricas del sistema completo

---

### 7.4 ⚠️ Financial Alerts (Alertas Financieras)

#### **Financial Alerts Service**
- **Objetivo:** Alertar sobre situaciones financieras importantes
- **Funciones:**
  1. **Alertas de balance bajo** (cuando el balance es bajo)
  2. **Alertas de comisión pendiente** (comisiones sin pagar)
  3. **Alertas de margen bajo** (productos con bajo margen)
  4. **Alertas de ventas** (cuando hay una venta importante)
  5. **Alertas de ingresos** (objetivos de ingresos alcanzados)
- **Servicios:**
  - `GET /api/financial-alerts` - Lista de alertas
  - `POST /api/financial-alerts/configure` - Configurar alertas
  - `POST /api/financial-alerts/:id/dismiss` - Descartar alerta
- **Para el usuario:** Se mantiene informado de su situación financiera
- **Para el admin:** Monitorea alertas globales del sistema

---

### 7.5 💡 Cost Optimization (Optimización de Costos)

#### **Cost Optimization Service**
- **Objetivo:** Optimizar costos y mejorar rentabilidad
- **Funciones:**
  1. **Análisis de costos** por producto
  2. **Recomendaciones** de optimización
  3. **Comparación** de proveedores (futuro)
  4. **Sugerencias de precio** para maximizar ganancias
  5. **Análisis de gastos** generales
- **Servicios:**
  - `GET /api/cost-optimization/analysis` - Análisis de costos
  - `GET /api/cost-optimization/recommendations` - Recomendaciones
  - `POST /api/cost-optimization/apply` - Aplicar optimización
- **Para el usuario:** Mejora la rentabilidad de su negocio
- **Para el admin:** Optimiza costos del sistema

---

## 8. INTEGRACIÓN CON MARKETPLACES

### 8.1 🛒 Marketplace Service (Servicio Principal)

#### **Marketplace Service**
- **Objetivo:** Gestionar integraciones con todos los marketplaces
- **Funciones:**
  1. **Publicación** a eBay, Amazon, MercadoLibre
  2. **Gestión de credenciales** OAuth
  3. **Sincronización** de productos y precios
  4. **Actualización** de listings activos
  5. **Gestión de inventario** virtual
  6. **Tracking de publicaciones** (exitosas/fallidas)
- **Para el usuario:** Publica en múltiples marketplaces fácilmente
- **Para el admin:** Gestiona integraciones globales

---

### 8.2 📦 eBay Service

#### **eBay Service**
- **Objetivo:** Integración específica con eBay
- **Funciones:**
  1. **Autenticación OAuth** con eBay
  2. **Búsqueda de productos** en eBay
  3. **Publicación de productos** en eBay
  4. **Actualización de listings** existentes
  5. **Gestión de órdenes** (futuro)
  6. **Sincronización de inventario** (futuro)
- **Servicios:**
  - `GET /api/marketplace/auth-url/ebay` - URL de autenticación OAuth
  - `POST /api/marketplace/publish` - Publicar a eBay
  - `GET /api/amazon/search` - Buscar en eBay
- **Para el usuario:** Usa eBay como marketplace
- **Para el admin:** Configura credenciales de eBay

---

### 8.3 📦 Amazon Service

#### **Amazon Service**
- **Objetivo:** Integración específica con Amazon SP-API
- **Funciones:**
  1. **Autenticación OAuth** con Amazon
  2. **Búsqueda en catálogo** de Amazon
  3. **Publicación de productos** en Amazon
  4. **Gestión de inventario** (futuro)
  5. **Sincronización de precios** (futuro)
  6. **Gestión de órdenes** (futuro)
- **Servicios:**
  - `GET /api/marketplace/auth-url/amazon` - URL de autenticación OAuth
  - `POST /api/marketplace/publish` - Publicar a Amazon
  - `GET /api/amazon/search` - Buscar en Amazon
  - `GET /api/amazon/catalog` - Buscar en catálogo
- **Para el usuario:** Usa Amazon como marketplace
- **Para el admin:** Configura credenciales de Amazon SP-API

---

### 8.4 📦 MercadoLibre Service

#### **MercadoLibre Service**
- **Objetivo:** Integración específica con MercadoLibre
- **Funciones:**
  1. **Autenticación OAuth** con MercadoLibre
  2. **Búsqueda de productos** en MercadoLibre
  3. **Publicación de productos** en MercadoLibre
  4. **Gestión de preguntas** (futuro)
  5. **Sincronización de inventario** (futuro)
- **Servicios:**
  - `GET /api/marketplace/auth-url/mercadolibre` - URL de autenticación OAuth
  - `POST /api/marketplace/publish` - Publicar a MercadoLibre
  - `GET /api/mercadolibre/search` - Buscar en MercadoLibre
- **Para el usuario:** Usa MercadoLibre como marketplace
- **Para el admin:** Configura credenciales de MercadoLibre

---

### 8.5 🔐 API Credentials Management

#### **API Credentials Service**
- **Objetivo:** Gestionar credenciales de APIs de marketplaces
- **Funciones:**
  1. **Guardar credenciales** (OAuth tokens, API keys)
  2. **Validar credenciales** (verificar si funcionan)
  3. **Actualizar credenciales** (refresh tokens)
  4. **Activar/Desactivar** credenciales
  5. **Gestión de ambientes** (sandbox/production)
  6. **Credenciales globales** (compartidas por admin)
- **Servicios:**
  - `GET /api/credentials` - Listar credenciales configuradas
  - `POST /api/credentials` - Guardar credenciales
  - `PUT /api/credentials/:apiName/toggle` - Activar/desactivar
  - `GET /api/credentials/status` - Estado de todas las APIs
- **Componente Frontend:** `/api-config`, `/api-settings`, `/api-keys`
- **Para el usuario:** Configura sus propias credenciales
- **Para el admin:** Gestiona credenciales globales y por usuario

---

## 9. SISTEMA DE OPORTUNIDADES Y SCRAPING

### 9.1 🔍 Opportunity Finder Service

#### **Opportunity Finder Service (Buscador de Oportunidades)**
- **Objetivo:** Encontrar productos rentables en AliExpress
- **Funciones:**
  1. **Scraping de AliExpress** (usando Puppeteer o bridge Python)
  2. **Análisis de competencia** en múltiples marketplaces
  3. **Cálculo de márgenes** y ROI
  4. **Sugerencia de precios** óptimos
  5. **Análisis de demanda** del mercado
  6. **Score de confianza** (0-100)
  7. **Persistencia** de oportunidades encontradas
- **Para el usuario:** Encuentra productos rentables automáticamente
- **Para el admin:** Monitorea el scraping y oportunidades

---

### 9.2 🕷️ Advanced Scraper Service

#### **Advanced Scraper Service (Servicio de Scraping Avanzado)**
- **Objetivo:** Scraping inteligente de AliExpress
- **Funciones:**
  1. **Scraping con Puppeteer** (headless Chrome)
  2. **Manejo de CAPTCHA** (integración con Anti-Captcha)
  3. **Rotación de user agents** (evitar detección)
  4. **Manejo de rate limiting** (respeta límites de AliExpress)
  5. **Extracción de datos** estructurados (precio, título, imágenes, descripción)
  6. **Manejo de errores** y reintentos automáticos
- **Para el usuario:** Scraping rápido y confiable
- **Para el admin:** Control del scraping a nivel sistema

---

### 9.3 🔐 AliExpress Auth Monitor

#### **AliExpress Auth Monitor**
- **Objetivo:** Monitorear la sesión de AliExpress
- **Funciones:**
  1. **Verificación de salud** de cookies de sesión
  2. **Detección de logout** automático
  3. **Notificaciones** cuando se requiere login manual
  4. **Background monitoring** (monitoreo en segundo plano)
- **Servicios:**
  - `GET /api/auth-status/aliexpress` - Estado de autenticación
  - `POST /api/manual-auth/login` - Login manual de AliExpress
- **Para el usuario:** Recibe notificaciones cuando necesita hacer login
- **Para el admin:** Monitorea el estado de autenticación global

---

### 9.4 🧩 Manual Auth Service

#### **Manual Auth Service (Autenticación Manual)**
- **Objetivo:** Permitir autenticación manual cuando falla la automática
- **Funciones:**
  1. **Generación de token** temporal para login manual
  2. **Guía de login** paso a paso
  3. **Verificación de login** exitoso
  4. **Actualización de cookies** de sesión
- **Servicios:**
  - `POST /api/manual-auth/init` - Iniciar proceso de login manual
  - `GET /api/manual-login/:token` - Página de login manual
  - `POST /api/manual-auth/verify` - Verificar login exitoso
- **Componente Frontend:** `/manual-login/:token`
- **Para el usuario:** Puede hacer login manual cuando es necesario
- **Para el admin:** Gestiona autenticaciones manuales

---

### 9.5 🎯 Competitor Analyzer

#### **Competitor Analyzer Service**
- **Objetivo:** Analizar competencia en marketplaces
- **Funciones:**
  1. **Búsqueda de competidores** (productos similares)
  2. **Análisis de precios** de competencia
  3. **Análisis de ratings** y reviews
  4. **Análisis de volúmenes** de venta
  5. **Recomendaciones** de posicionamiento
- **Para el usuario:** Entiende la competencia antes de publicar
- **Para el admin:** Analiza competencia a nivel global

---

## 10. GESTIÓN DE PRODUCTOS

### 10.1 📦 Product Service (Completo)

#### **Product Service (Servicio de Productos)**
- **Objetivo:** Gestionar el ciclo de vida de productos
- **Funciones:**
  1. **Creación de productos** (desde oportunidad o manual)
  2. **Actualización de productos** (precios, información)
  3. **Cambio de estado** (PENDING → APPROVED → PUBLISHED)
  4. **Sincronización** de precios con marketplaces
  5. **Gestión de imágenes** (multi-imagen)
  6. **Cálculo de precios** finales
  7. **Validaciones** (precio > costo, imágenes válidas)
  8. **Cleanup** de listings al rechazar/eliminar productos
- **Para el usuario:** Gestiona su catálogo completo
- **Para el admin:** Supervisa productos de todos los usuarios

---

## 11. GESTIÓN DE VENTAS Y ÓRDENES

### 11.1 💰 Sale Service

#### **Sale Service (Servicio de Ventas)**
- **Objetivo:** Gestionar ventas y órdenes
- **Funciones:**
  1. **Registro de ventas** (manual o automática desde webhook)
  2. **Cálculo automático** de ganancias brutas
  3. **Tracking de órdenes** (número de seguimiento)
  4. **Actualización de estado** (PENDING → PROCESSING → SHIPPED → DELIVERED)
  5. **Gestión de comprador** (información de cliente)
  6. **Cálculo de comisiones** automático
  7. **Actualización de balance** del usuario
- **Para el usuario:** Gestiona todas sus ventas
- **Para el admin:** Supervisa ventas globales

---

### 11.2 🛒 AliExpress Auto Purchase (Futuro)

#### **AliExpress Auto Purchase Service**
- **Objetivo:** Comprar automáticamente en AliExpress cuando hay venta
- **Funciones (futuro):**
  1. **Detección automática** de nueva venta
  2. **Compra automática** en AliExpress
  3. **Actualización de tracking** automática
  4. **Gestión de direcciones** de envío
- **Estado:** Planificado para futuro
- **Para el usuario:** Automatización completa del ciclo
- **Para el admin:** Controla compras automáticas

---

## 12. SISTEMA DE COMISIONES

### 12.1 💸 Commission Service

#### **Commission Service (Servicio de Comisiones)**
- **Objetivo:** Calcular y gestionar comisiones
- **Funciones:**
  1. **Cálculo automático** al crear venta
  2. **Gestión de estados** (PENDING → SCHEDULED → PAID)
  3. **Programación de pagos** (fechas automáticas)
  4. **Pago individual** o en lote
  5. **Integración con PayPal** (preparada)
  6. **Historial de pagos**
  7. **Balance del usuario**
- **Estructura:**
  - **Comisión de Usuario:** 10% de ganancia bruta (configurable)
  - **Comisión de Admin:** 2% fijo del precio de venta
  - **Ganancia Neta:** Precio venta - Costo - Comisiones
- **Para el usuario:** Cobra sus ganancias automáticamente
- **Para el admin:** Gestiona el sistema de comisiones

---

## 13. NOTIFICACIONES Y ALERTAS

### 13.1 🔔 Notification Service

#### **Notification Service (Servicio de Notificaciones)**
- **Objetivo:** Notificar a usuarios sobre eventos importantes
- **Funciones:**
  1. **Notificaciones en tiempo real** (Socket.IO)
  2. **Notificaciones por email** (Nodemailer)
  3. **Notificaciones push** (futuro)
  4. **Tipos de notificaciones:**
     - Nueva venta
     - Producto publicado
     - Comisión pagada
     - Alerta de balance bajo
     - Requiere login manual (AliExpress)
     - Error en scraping
- **Servicios:**
  - `GET /api/notifications` - Listar notificaciones
  - `POST /api/notifications/:id/read` - Marcar como leída
  - `GET /api/notifications/unread` - Notificaciones no leídas
- **Componente Frontend:** `NotificationCenter` (componente global)
- **Para el usuario:** Se mantiene informado de todo
- **Para el admin:** Envía notificaciones globales

---

### 13.2 ⚠️ Financial Alerts

Ya documentado en la sección 7.4.

---

## 14. REPORTES Y ANALYTICS

### 14.1 📊 Reports Service

#### **Reports Service (Servicio de Reportes)**
- **Objetivo:** Generar reportes detallados del negocio
- **Funciones:**
  1. **Reporte de productos** (publicados, vendidos, pendientes)
  2. **Reporte de ventas** (por período, por marketplace)
  3. **Reporte financiero** (ingresos, gastos, ganancias)
  4. **Reporte de comisiones** (pagadas, pendientes)
  5. **Exportación** (JSON, Excel, PDF, HTML)
  6. **Programación** de reportes (enviar automáticamente)
- **Servicios:**
  - `GET /api/reports/products` - Reporte de productos
  - `GET /api/reports/sales` - Reporte de ventas
  - `GET /api/reports/financial` - Reporte financiero
  - `POST /api/reports/schedule` - Programar reporte
- **Componente Frontend:** `/reports`
- **Para el usuario:** Analiza su negocio en detalle
- **Para el admin:** Genera reportes globales del sistema

---

### 14.2 📈 Advanced Reports

#### **Advanced Reports Service**
- **Objetivo:** Reportes avanzados con análisis profundo
- **Funciones:**
  1. **Análisis de tendencias** (gráficos temporales)
  2. **Análisis por categoría** (qué categorías funcionan mejor)
  3. **Análisis por marketplace** (rendimiento por plataforma)
  4. **Análisis de competencia** (comparación con competidores)
  5. **Proyecciones** basadas en datos históricos
- **Servicios:**
  - `GET /api/advanced-reports/trends` - Análisis de tendencias
  - `GET /api/advanced-reports/category` - Análisis por categoría
  - `GET /api/advanced-reports/marketplace` - Análisis por marketplace
- **Para el usuario:** Decisiones basadas en datos
- **Para el admin:** Análisis estratégico del sistema

---

## 15. CONFIGURACIÓN Y ADMINISTRACIÓN

### 15.1 ⚙️ Workflow Config

#### **Workflow Config Service**
- **Objetivo:** Configurar flujos de trabajo personalizados
- **Funciones:**
  1. **Configuración de ambiente** (sandbox/production)
  2. **Configuración de publicación** (automática/manual)
  3. **Configuración de márgenes** mínimos
  4. **Configuración de límites** (productos pendientes, etc.)
  5. **Configuración de notificaciones** (qué notificar)
- **Servicios:**
  - `GET /api/workflow/config` - Obtener configuración
  - `PUT /api/workflow/config` - Actualizar configuración
- **Componente Frontend:** `/workflow-config`
- **Para el usuario:** Personaliza su flujo de trabajo
- **Para el admin:** Configura flujos globales

---

### 15.2 🔧 Config Audit

#### **Config Audit Service**
- **Objetivo:** Auditar configuraciones del sistema
- **Funciones:**
  1. **Validación de configuraciones** (credenciales, APIs)
  2. **Detección de problemas** en configuración
  3. **Recomendaciones** de mejora
  4. **Reporte de auditoría**
- **Servicios:**
  - `GET /api/config-audit` - Ejecutar auditoría
  - `GET /api/config-audit/report` - Reporte de auditoría
- **Para el usuario:** Verifica que su configuración esté correcta
- **Para el admin:** Audita configuración global

---

### 15.3 📋 API Health Monitor

#### **API Health Monitor Service**
- **Objetivo:** Monitorear salud de APIs externas
- **Funciones:**
  1. **Health check** de APIs (eBay, Amazon, MercadoLibre)
  2. **Detección de outages** (caídas de APIs)
  3. **Notificaciones** cuando APIs están caídas
  4. **Historial de disponibilidad**
- **Para el usuario:** Sabe si hay problemas con APIs
- **Para el admin:** Monitorea salud de todas las APIs

---

## 16. SERVICIOS DE SOPORTE

### 16.1 📞 Help Center

#### **Help Center (Centro de Ayuda)**
- **Objetivo:** Proporcionar ayuda y documentación
- **Funciones:**
  1. **Documentación** de uso
  2. **Preguntas frecuentes** (FAQ)
  3. **Guías paso a paso**
  4. **Contacto con soporte** (futuro)
- **Componente Frontend:** `/help`
- **Para el usuario:** Encuentra ayuda cuando la necesita
- **Para el admin:** Gestiona documentación del sistema

---

### 16.2 🔍 System Status

#### **System Status**
- **Objetivo:** Ver estado del sistema
- **Funciones:**
  1. **Estado de servicios** (back-end, base de datos, Redis)
  2. **Estado de APIs** externas
  3. **Métricas de rendimiento** (tiempo de respuesta, uptime)
  4. **Incidentes** conocidos (futuro)
- **Servicios:**
  - `GET /health` - Health check del sistema
  - `GET /api/system/status` - Estado detallado
- **Para el usuario:** Verifica si el sistema está funcionando
- **Para el admin:** Monitorea salud del sistema

---

## 📊 RESUMEN DE SERVICIOS POR ROL

### Para Usuarios (USER)

✅ **Acceso completo a:**
- Dashboard personalizado
- Búsqueda de oportunidades
- Gestión de productos
- Publicación en marketplaces
- Gestión de ventas
- Sistema de comisiones
- Autopilot (automatización)
- Dashboard financiero
- Reportes personales
- Configuración personal
- Notificaciones

❌ **Sin acceso a:**
- Gestión de usuarios
- Logs del sistema
- Configuración global
- Comisiones de otros usuarios

---

### Para Administradores (ADMIN)

✅ **Acceso completo a:**
- **TODO lo que tienen los usuarios**, más:
- Gestión de usuarios (crear, editar, eliminar)
- Panel de administración
- Logs del sistema
- Gestión de comisiones (todos los usuarios)
- Configuración global del sistema
- Reportes globales
- Monitoreo de salud del sistema
- Credenciales globales (compartidas)

---

## 🎯 FLUJO COMPLETO DE USO

### Flujo Básico de Usuario:

```
1. LOGIN
   ↓
2. DASHBOARD (ver estado general)
   ↓
3. OPPORTUNITIES (buscar productos rentables)
   ↓
4. IMPORTAR PRODUCTO (crear desde oportunidad)
   ↓
5. PUBLISHER (aprobar y publicar producto)
   ↓
6. PRODUCTOS PUBLICADOS (monitorear)
   ↓
7. VENTA RECIBIDA (registrar venta)
   ↓
8. COMISIONES (ver comisión generada)
   ↓
9. FINANCE (ver ganancias)
   ↓
10. REPORTES (analizar rendimiento)
```

### Flujo Autopilot:

```
1. CONFIGURAR AUTOPILOT (queries, márgenes, etc.)
   ↓
2. INICIAR AUTOPILOT
   ↓
3. SISTEMA BUSCA OPORTUNIDADES AUTOMÁTICAMENTE
   ↓
4. SISTEMA CREA PRODUCTOS AUTOMÁTICAMENTE
   ↓
5. SISTEMA PUBLICA (si está configurado)
   ↓
6. USUARIO MONITOREA EN DASHBOARD
   ↓
7. SISTEMA NOTIFICA DE VENTAS
   ↓
8. USUARIO REGISTRA VENTAS
   ↓
9. SISTEMA CALCULA COMISIONES
   ↓
10. PAGO AUTOMÁTICO DE COMISIONES
```

---

## 🔐 SEGURIDAD Y PERMISOS

### Autenticación:
- **JWT Tokens** (JSON Web Tokens)
- **Refresh Tokens** (renovación automática)
- **Sesiones persistentes** (localStorage)
- **Rate Limiting** (límite de requests)

### Autorización:
- **Roles:** ADMIN, USER
- **Middleware de autorización** en todas las rutas
- **Validación de propiedad** (usuarios solo acceden a sus recursos)
- **CSRF Protection** (Cross-Site Request Forgery)

### Datos Sensibles:
- **Encriptación de contraseñas** (bcrypt)
- **Encriptación de credenciales** de APIs (en base de datos)
- **HTTPS** obligatorio en producción
- **CORS** configurado (solo dominios permitidos)

---

## 📈 ESCALABILIDAD Y RENDIMIENTO

### Optimizaciones:
- **Caché Redis** (para datos frecuentes)
- **Paginación** en listados (no carga todo de una vez)
- **Lazy Loading** en frontend (carga componentes bajo demanda)
- **Jobs en segundo plano** (tareas pesadas no bloquean UI)
- **Compresión** de respuestas (gzip)
- **CDN** para assets estáticos (futuro)

### Límites:
- **Rate Limiting:** 100 requests/minuto por usuario
- **Max productos pendientes:** Configurable por usuario
- **Tamaño de archivos:** 10MB máximo por imagen
- **Tiempo de scraping:** 30 segundos máximo por búsqueda

---

## 🔮 FUNCIONALIDADES FUTURAS

### En Desarrollo:
- [ ] Compra automática en AliExpress
- [ ] Integración con más marketplaces (Walmart, Etsy)
- [ ] Sistema de reviews automático
- [ ] Chat con soporte en tiempo real
- [ ] App móvil (iOS/Android)
- [ ] Marketplace propio de Ivan Reseller

### Planificado:
- [ ] IA para optimización de títulos
- [ ] Análisis predictivo de ventas
- [ ] Sistema de afiliados
- [ ] Multi-proveedor (no solo AliExpress)
- [ ] Dropshipping internacional automatizado

---

## 📞 SOPORTE Y CONTACTO

### Documentación:
- **Help Center:** `/help` en la aplicación
- **Logs:** `/logs` (solo admin)
- **Status:** `/health` endpoint

### Para Usuarios:
- **Email:** support@ivanreseller.com (futuro)
- **Chat:** En aplicación (futuro)
- **Documentación:** Help Center

### Para Administradores:
- **Logs del sistema:** `/logs`
- **Health checks:** `/health`
- **Monitoreo:** Dashboard de administración

---

## 📝 NOTAS FINALES

Este documento describe **todas las funcionalidades actuales** del sistema Ivan Reseller. El sistema está en constante evolución, por lo que esta documentación se actualiza regularmente.

**Última actualización:** 2025-11-20  
**Versión del sistema:** 1.0  
**Estado:** ✅ Producción

---

**Ivan Reseller** - Plataforma de Dropshipping Automatizado con IA  
🌐 www.ivanreseller.com

