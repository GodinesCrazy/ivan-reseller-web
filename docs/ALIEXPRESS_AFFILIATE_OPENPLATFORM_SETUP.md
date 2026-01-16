# 🔗 ALIEXPRESS AFFILIATE + OPEN PLATFORM SETUP

**Fecha:** 2025-01-26  
**Versión:** v1.0.0  
**Estado:** En proceso de aprobación

---

## 🎯 OBJETIVO

Habilitar AliExpress Affiliate API (Open Platform) para IvanReseller.

**Contexto:**
- La API Dropshipping ya existe en otra cuenta (AppName: IvanReseller / Category: Drop Shipping / AppKey: 522578)
- AliExpress confirmó por correo que **NO se pueden usar Dropshipping API y Affiliate API en la misma cuenta Open Platform**

---

## ✅ CONFIRMACIÓN OFICIAL DE ALIEXPRESS

**Respuesta del AliExpress Affiliates Team:**
> "It is not able to use both Dropshipping API and Affiliate API in the same Open platform account."

**Solución indicada por AliExpress:**
1. Crear **NUEVA cuenta Affiliate** en `portals.aliexpress.com` con otro correo
2. Luego entrar a `openservice.aliexpress.com` usando **quick access** (AliExpress logo)
3. Crear perfil de desarrollador tipo **Affiliate**

---

## 📋 DATOS CLAVE DEFINIDOS (OBLIGATORIOS)

| Campo | Valor | Notas |
|-------|-------|-------|
| **Email afiliado principal** | `goldenkeystudios0@gmail.com` | Cuenta dedicada para Affiliate API |
| **Tracking ID** | `ivanreseller` | Configurado en Portals (Tracking links) |
| **Sitio afiliado principal** | `https://www.ivanreseller.com` | URL del sitio principal |
| **Canal promocional** | `Non-network` | Tipo de canal configurado |
| **Tipo canal** | `content > vertical sites` | O equivalente definido durante registro |

---

## 📊 ESTADO ACTUAL DEL PROCESO

### ✅ Pasos Completados

1. [x] **Registro completado en AliExpress Affiliate Portals**
   - Email: `goldenkeystudios0@gmail.com`
   - Portal: `portals.aliexpress.com`
   - Tracking ID creado: `ivanreseller`

2. [x] **Tracking ID configurado en Portals**
   - Tracking ID: `ivanreseller`
   - Configurado en: Tracking links
   - Estado: Activo

3. [x] **Perfil de desarrollador creado en Open Platform**
   - Portal: `openservice.aliexpress.com`
   - Acceso: Quick access (AliExpress logo)
   - Collaborator type: **Affiliates (individual)**
   - Perfil enviado con documentos

### ⏳ Paso en Proceso

4. [ ] **Aprobación del perfil de desarrollador**
   - Estado actual: **Under Review**
   - Tiempo estimado: **2-5 working days**
   - Portal: `openservice.aliexpress.com/profile`

---

## 🔜 PRÓXIMOS PASOS (CUANDO SEA APROBADO)

Cuando el estado cambie a **"Review Approved"**:

### Paso 1: Crear Aplicación en App Console

1. Entrar a `https://openservice.aliexpress.com/`
2. Ir a **App Console** → **Create App**
3. Seleccionar categoría: **Affiliates API**
4. Completar formulario de creación de aplicación
5. Obtener **AppKey** y **AppSecret** del Affiliate API

### Paso 2: Integrar Credenciales

1. **Variables de entorno del proyecto:**
   ```env
   ALIEXPRESS_AFFILIATE_EMAIL=goldenkeystudios0@gmail.com
   ALIEXPRESS_TRACKING_ID=ivanreseller
   ALIEXPRESS_AFFILIATE_APP_KEY=<obtenido del App Console>
   ALIEXPRESS_AFFILIATE_APP_SECRET=<obtenido del App Console>
   ```

2. **Endpoint de callback OAuth** (si aplica):
   - Verificar si Affiliate API requiere OAuth
   - Configurar callback URL si es necesario

3. **Módulo de generación de deeplinks / tracking:**
   - Integrar `trackingId=ivanreseller` en todos los enlaces de afiliado
   - Implementar generación de tracking links con Affiliate API

### Paso 3: Validación

1. Probar conexión con Affiliate API
2. Validar generación de tracking links
3. Verificar que `trackingId=ivanreseller` se incluye correctamente
4. Ejecutar smoke test si aplica

---

## ⚠️ REGLAS / ADVERTENCIAS IMPORTANTES

### ❌ NO HACER

- ❌ **NO intentar habilitar Affiliate API dentro de la cuenta Dropshipping existente**
  - AliExpress no permite ambas APIs en la misma cuenta
  - Se requiere cuenta separada

- ❌ **NO mezclar credenciales Dropshipping con Affiliate**
  - Mantener credenciales completamente separadas
  - No usar AppKey de Dropshipping para Affiliate API

- ❌ **NO usar el mismo email para ambas cuentas**
  - Dropshipping: (cuenta existente)
  - Affiliate: `goldenkeystudios0@gmail.com`

### ✅ HACER

- ✅ **Mantener separación de cuentas y AppKeys**
  - Cuenta Dropshipping: (existente, AppKey: 522578)
  - Cuenta Affiliate: `goldenkeystudios0@gmail.com` (pendiente aprobación)

- ✅ **Incluir trackingId en toda lógica de affiliate link**
  - Siempre usar: `trackingId=ivanreseller`
  - Validar que se incluye en todos los enlaces generados

- ✅ **Usar quick access para login en Open Platform**
  - NO usar email directamente
  - Usar quick access desde `portals.aliexpress.com`

---

## 🔧 VARIABLES DE ENTORNO RECOMENDADAS

```env
# AliExpress Affiliate API Configuration
ALIEXPRESS_AFFILIATE_EMAIL=goldenkeystudios0@gmail.com
ALIEXPRESS_TRACKING_ID=ivanreseller
ALIEXPRESS_AFFILIATE_APP_KEY=<pending>
ALIEXPRESS_AFFILIATE_APP_SECRET=<pending>
ALIEXPRESS_AFFILIATE_SITE_URL=https://www.ivanreseller.com
```

### Notas sobre Variables de Entorno

- `ALIEXPRESS_AFFILIATE_EMAIL`: Email de la cuenta afiliado principal
- `ALIEXPRESS_TRACKING_ID`: Tracking ID configurado en Portals (`ivanreseller`)
- `ALIEXPRESS_AFFILIATE_APP_KEY`: Se obtendrá del App Console cuando sea aprobado
- `ALIEXPRESS_AFFILIATE_APP_SECRET`: Se obtendrá del App Console cuando sea aprobado
- `ALIEXPRESS_AFFILIATE_SITE_URL`: URL del sitio principal

**Estado actual:** 2 de 5 variables configuradas (email y tracking_id)

---

## 🐛 TROUBLESHOOTING

### Problema 1: Open Platform Login - "Incorrect Password"

**Síntomas:**
- Al intentar login en `openservice.aliexpress.com` con email afiliado directamente
- Error: "incorrect password" o "account not found"

**Causa:**
- El email de afiliado no tiene acceso directo a Open Platform
- Se requiere usar **quick access** desde Portals

**Solución:**
1. Ir a `portals.aliexpress.com`
2. Iniciar sesión con `goldenkeystudios0@gmail.com`
3. Usar **quick access** (AliExpress logo) para entrar a `openservice.aliexpress.com`
4. NO intentar login directo en Open Platform

---

### Problema 2: Recuperación de Password - "No Account"

**Síntomas:**
- Al intentar recuperar password en Open Platform
- Error: "no account" o "account not found"
- Depende del dominio/tipo de login (buyer vs open platform)

**Causa:**
- El sistema de recuperación de password puede no reconocer cuentas de afiliado
- Diferentes dominios tienen diferentes bases de datos de usuarios

**Solución:**
1. **NO usar recuperación de password en Open Platform directamente**
2. Usar `portals.aliexpress.com` para gestionar la cuenta afiliado
3. Luego usar **quick access** para entrar a Open Platform
4. Si es necesario cambiar password, hacerlo desde Portals

---

### Problema 3: Acceso a Open Platform

**Flujo Correcto:**
1. ✅ Ir a `portals.aliexpress.com`
2. ✅ Iniciar sesión con `goldenkeystudios0@gmail.com`
3. ✅ Usar **quick access** (AliExpress logo) para `openservice.aliexpress.com`
4. ✅ NO intentar login directo en Open Platform

**Flujo Incorrecto:**
1. ❌ Ir directamente a `openservice.aliexpress.com`
2. ❌ Intentar login con email afiliado
3. ❌ Intentar recuperar password en Open Platform

---

## ✅ CHECKLIST DE APROBACIÓN E INTEGRACIÓN

### Fase 1: Registro y Configuración Inicial

- [x] **Registro en AliExpress Affiliate Portals**
  - [x] Crear cuenta en `portals.aliexpress.com`
  - [x] Email: `goldenkeystudios0@gmail.com`
  - [x] Cuenta activa y verificada

- [x] **Configuración de Tracking ID**
  - [x] Crear Tracking ID en Portals
  - [x] Tracking ID: `ivanreseller`
  - [x] Configurar en Tracking links
  - [x] Verificar que Tracking ID está activo

- [x] **Configuración de Sitio Afiliado**
  - [x] Sitio principal: `https://www.ivanreseller.com`
  - [x] Canal promocional: `Non-network`
  - [x] Tipo canal: `content > vertical sites`

---

### Fase 2: Perfil de Desarrollador en Open Platform

- [x] **Acceso a Open Platform**
  - [x] Usar quick access desde Portals
  - [x] Entrar a `openservice.aliexpress.com`
  - [x] Verificar acceso exitoso

- [x] **Creación de Perfil de Desarrollador**
  - [x] Seleccionar Collaborator type: **Affiliates (individual)**
  - [x] Completar formulario de perfil
  - [x] Subir documentos requeridos
  - [x] Enviar perfil para revisión

- [ ] **Aprobación del Perfil**
  - [ ] Estado actual: **Under Review**
  - [ ] Tiempo estimado: 2-5 working days
  - [ ] Verificar estado en `openservice.aliexpress.com/profile`
  - [ ] Esperar cambio a **"Review Approved"**

---

### Fase 3: Creación de Aplicación (Pendiente Aprobación)

- [ ] **Crear Aplicación en App Console**
  - [ ] Entrar a `openservice.aliexpress.com`
  - [ ] Ir a **App Console** → **Create App**
  - [ ] Seleccionar categoría: **Affiliates API**
  - [ ] Completar formulario de creación
  - [ ] Enviar aplicación para revisión

- [ ] **Obtener Credenciales**
  - [ ] AppKey obtenido
  - [ ] AppSecret obtenido
  - [ ] Verificar que credenciales están activas
  - [ ] Documentar credenciales (sin exponer secretos)

---

### Fase 4: Integración en Proyecto (Pendiente Aprobación)

- [ ] **Configurar Variables de Entorno**
  - [ ] `ALIEXPRESS_AFFILIATE_EMAIL` configurado
  - [ ] `ALIEXPRESS_TRACKING_ID` configurado
  - [ ] `ALIEXPRESS_AFFILIATE_APP_KEY` configurado
  - [ ] `ALIEXPRESS_AFFILIATE_APP_SECRET` configurado
  - [ ] `ALIEXPRESS_AFFILIATE_SITE_URL` configurado

- [ ] **Integrar en Código**
  - [ ] Actualizar servicio de Affiliate API (`backend/src/services/aliexpress-affiliate-api.service.ts`)
  - [ ] Configurar credenciales en servicio
  - [ ] Verificar que `trackingId=ivanreseller` se incluye en requests
  - [ ] Probar conexión con API

- [ ] **Validación Funcional**
  - [ ] Probar búsqueda de productos con Affiliate API
  - [ ] Verificar generación de tracking links
  - [ ] Validar que `trackingId=ivanreseller` está presente
  - [ ] Ejecutar smoke test si aplica

- [ ] **Documentación**
  - [ ] Actualizar documentación de APIs
  - [ ] Documentar proceso de configuración
  - [ ] Actualizar guías de usuario si aplica

---

## 📝 NOTAS ADICIONALES

### Separación de Cuentas

**Cuenta Dropshipping (Existente):**
- AppName: IvanReseller
- Category: Drop Shipping
- AppKey: 522578
- Propósito: Gestión de órdenes Dropshipping

**Cuenta Affiliate (En Proceso):**
- Email: `goldenkeystudios0@gmail.com`
- Category: Affiliates API
- AppKey: (pendiente aprobación)
- Tracking ID: `ivanreseller`
- Propósito: Búsqueda de productos y generación de tracking links

### Mantenimiento

- **NO mezclar credenciales entre cuentas**
- **NO usar AppKey de Dropshipping para Affiliate API**
- **Mantener documentación actualizada**
- **Revisar periódicamente estado de aprobación**

---

## 🔗 REFERENCIAS

- **AliExpress Affiliate Portals:** https://portals.aliexpress.com/
- **AliExpress Open Platform:** https://openservice.aliexpress.com/
- **Documentación técnica del proyecto:** `docs/API_CONFIGURATION_GUIDE.md`
- **Servicio de Affiliate API:** `backend/src/services/aliexpress-affiliate-api.service.ts`

---

**Fecha de creación:** 2025-01-26  
**Última actualización:** 2025-01-26  
**Versión:** v1.0.0  
**Estado:** En proceso de aprobación (2-5 working days)

