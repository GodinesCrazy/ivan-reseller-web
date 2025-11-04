# 🏢 Ivan Reseller Web - Multi-Tenant Edition

**Plataforma de Dropshipping Multi-Usuario con Aislamiento Completo de Datos**

[![Multi-Tenant](https://img.shields.io/badge/Architecture-Multi--Tenant-success)](/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://reactjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748)](https://www.prisma.io/)
[![Tests](https://img.shields.io/badge/Tests-20%2F20%20Passed-brightgreen)](/)

---

## 📋 Tabla de Contenidos

- [Características Multi-Tenant](#-características-multi-tenant)
- [Arquitectura de Seguridad](#-arquitectura-de-seguridad)
- [Inicio Rápido](#-inicio-rápido)
- [Configuración de APIs](#-configuración-de-apis)
- [Testing](#-testing)
- [Roles y Permisos](#-roles-y-permisos)
- [API Endpoints](#-api-endpoints)
- [Documentación Adicional](#-documentación-adicional)

---

## 🌟 Características Multi-Tenant

### ✅ Aislamiento Completo de Datos

Cada usuario tiene su propio espacio aislado:

- **Productos** 🛍️ - Gestiona tu catálogo independiente
- **Ventas** 💰 - Historial y tracking privado
- **Comisiones** 💵 - Ganancias y balances individuales
- **API Credentials** 🔑 - Configuraciones de marketplace privadas

### ✅ 9 Marketplaces Integrados

Conecta tus cuentas de:

1. **eBay Trading API** - Publicación y gestión de productos
2. **Amazon SP-API** - Integración con Amazon Seller Central
3. **MercadoLibre API** - Para LATAM (México, Argentina, Brasil, etc.)
4. **AliExpress API** - Sourcing de productos
5. **GROQ AI** - Análisis inteligente con IA
6. **ScraperAPI** - Web scraping confiable
7. **ZenRows** - Scraping avanzado con anti-detección
8. **2Captcha** - Resolución de captchas
9. **PayPal Payouts** - Pagos automatizados

### ✅ Control de Acceso por Roles

**ADMIN** 👑
- Gestión completa de usuarios
- Acceso a todos los recursos del sistema
- Configuración regional y tareas
- Logs y auditoría

**USER** 👤
- Dashboard personal
- Gestión de productos propios
- Historial de ventas y comisiones
- Configuración de APIs privadas

### ✅ Seguridad de Nivel Empresarial

- **Encriptación AES-256-GCM** para credenciales API
- **JWT Authentication** con tokens seguros
- **Ownership Verification** en cada request
- **Cache Isolation** por usuario
- **Bcrypt Password Hashing** (10 salt rounds)
- **Admin Bypass** controlado para soporte

---

## 🔒 Arquitectura de Seguridad

### 6 Capas de Protección

```
┌─────────────────────────────────────────────────────────────┐
│                    1. UX Layer (Frontend)                    │
│  Sidebar oculta opciones admin para usuarios normales       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  2. Route Guard (Frontend)                   │
│  ProtectedRoute bloquea navegación no autorizada            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  3. JWT Verification (Backend)               │
│  Middleware valida token y extrae userId + role             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│               4. Ownership Check (Backend)                   │
│  WHERE userId = req.user.userId en todas las queries        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│               5. Data Encryption (Backend)                   │
│  AES-256-GCM para credenciales API sensibles                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                6. Cache Isolation (Backend)                  │
│  Keys: user_${userId}_${apiName} previenen contaminación    │
└─────────────────────────────────────────────────────────────┘
```

### Flujo de Datos Multi-Tenant

```
Usuario hace request → JWT validado → userId extraído
                                        ↓
                          Query: WHERE userId = X
                                        ↓
                          Admin? → Bypass ownership check
                          User? → Solo sus datos
                                        ↓
                          Cache aislado por usuario
                                        ↓
                          Credentials desencriptadas
                                        ↓
                          Response al usuario correcto
```

---

## ⚡ Inicio Rápido

### Requisitos

- **Node.js** 18+ ([Descargar](https://nodejs.org/))
- **npm** 9+ (incluido con Node.js)
- **Git** ([Descargar](https://git-scm.com/))

### Instalación

```bash
# 1. Clonar repositorio
git clone https://github.com/tu-usuario/ivan-reseller-web.git
cd ivan-reseller-web

# 2. Backend - Instalar y configurar
cd backend
npm install
npx prisma migrate dev
npx prisma db seed  # Crea usuario admin por defecto
npm run dev         # Corre en http://localhost:3000

# 3. Frontend - Instalar y configurar (nueva terminal)
cd ../frontend
npm install
npm run dev         # Corre en http://localhost:5173
```

### Primer Acceso

1. Abre tu navegador en **http://localhost:5173**
2. Login con credenciales de admin:
   - **Email:** `admin@ivanreseller.com`
   - **Password:** `admin123`
3. Navega a **"Configuración de APIs"** para agregar tus credenciales
4. ¡Listo para vender! 🚀

---

## 🔑 Configuración de APIs

### Acceso Rápido

En el sistema, ve a: **Dashboard → Configuración de APIs** (icono de Settings)

### Guía por Marketplace

#### 1. eBay Trading API

**Credenciales requeridas:**
- `EBAY_APP_ID` - Application ID (Client ID)
- `EBAY_DEV_ID` - Developer ID
- `EBAY_CERT_ID` - Certificate ID (Client Secret)
- `EBAY_AUTH_TOKEN` - User Token

**Dónde obtenerlas:**
1. Ve a [eBay Developers Program](https://developer.ebay.com/)
2. Crea una cuenta de developer
3. Ve a "My Account" → "Application Keys"
4. Genera tus keys (Sandbox o Production)
5. Obtén el User Token con OAuth

**Documentación:** [eBay API Docs](https://developer.ebay.com/docs)

---

#### 2. Amazon SP-API

**Credenciales requeridas:**
- `AMAZON_CLIENT_ID` - LWA Client ID
- `AMAZON_CLIENT_SECRET` - LWA Client Secret
- `AMAZON_REFRESH_TOKEN` - Refresh Token
- `AMAZON_REGION` - us-east-1, eu-west-1, etc.

**Dónde obtenerlas:**
1. Ve a [Amazon Seller Central](https://sellercentral.amazon.com/)
2. "Apps & Services" → "Develop Apps"
3. Registra tu aplicación
4. Obtén LWA credentials
5. Autoriza la app para obtener Refresh Token

**Documentación:** [Amazon SP-API Docs](https://developer-docs.amazon.com/sp-api/)

---

#### 3. MercadoLibre API

**Credenciales requeridas:**
- `MELI_CLIENT_ID` - App ID
- `MELI_CLIENT_SECRET` - Secret Key
- `MELI_REDIRECT_URI` - URL de callback

**Dónde obtenerlas:**
1. Ve a [MercadoLibre Developers](https://developers.mercadolibre.com/)
2. Crea una aplicación
3. Copia Client ID y Secret Key
4. Configura Redirect URI (ej: http://localhost:3000/callback)

**Documentación:** [MercadoLibre API Docs](https://developers.mercadolibre.com/es_ar/api-docs)

---

#### 4. AliExpress API

**Credenciales requeridas:**
- `ALIEXPRESS_APP_KEY` - App Key
- `ALIEXPRESS_APP_SECRET` - App Secret

**Dónde obtenerlas:**
1. Ve a [AliExpress Open Platform](https://developers.aliexpress.com/)
2. Regístrate como developer
3. Crea una aplicación
4. Obtén App Key y Secret

**Documentación:** [AliExpress API Docs](https://developers.aliexpress.com/en/doc.htm)

---

#### 5. GROQ AI

**Credenciales requeridas:**
- `GROQ_API_KEY` - API Key

**Dónde obtenerlas:**
1. Ve a [GROQ Console](https://console.groq.com/)
2. Crea una cuenta
3. "API Keys" → "Create API Key"
4. Copia tu API Key

**Documentación:** [GROQ Docs](https://console.groq.com/docs)

---

#### 6. ScraperAPI

**Credenciales requeridas:**
- `SCRAPERAPI_KEY` - API Key

**Dónde obtenerlas:**
1. Ve a [ScraperAPI](https://www.scraperapi.com/)
2. Regístrate (tienen plan gratuito)
3. Dashboard → "API Key"
4. Copia tu API Key

**Documentación:** [ScraperAPI Docs](https://www.scraperapi.com/documentation/)

---

#### 7. ZenRows

**Credenciales requeridas:**
- `ZENROWS_API_KEY` - API Key

**Dónde obtenerlas:**
1. Ve a [ZenRows](https://www.zenrows.com/)
2. Regístrate
3. Dashboard → "API Key"
4. Copia tu API Key

**Documentación:** [ZenRows Docs](https://www.zenrows.com/documentation)

---

#### 8. 2Captcha

**Credenciales requeridas:**
- `CAPTCHA_API_KEY` - API Key

**Dónde obtenerlas:**
1. Ve a [2Captcha](https://2captcha.com/)
2. Regístrate
3. Recarga balance (desde $1)
4. "Settings" → "API Key"

**Documentación:** [2Captcha Docs](https://2captcha.com/api-docs)

---

#### 9. PayPal Payouts

**Credenciales requeridas:**
- `PAYPAL_CLIENT_ID` - Client ID
- `PAYPAL_CLIENT_SECRET` - Secret
- `PAYPAL_MODE` - sandbox o live

**Dónde obtenerlas:**
1. Ve a [PayPal Developer](https://developer.paypal.com/)
2. "Dashboard" → "My Apps & Credentials"
3. Crea una app
4. Obtén Client ID y Secret (Sandbox y Live)

**Documentación:** [PayPal Payouts API](https://developer.paypal.com/docs/api/payments.payouts-batch/v1/)

---

## 🧪 Testing

### Ejecutar Tests Automatizados

```bash
cd backend
node scripts/test-multi-tenant.js
```

### Resultados Esperados

```
✅ Total de tests: 20
✅ Pasados: 20
❌ Fallidos: 0
Porcentaje de éxito: 100.0%

🎉 ¡TODOS LOS TESTS PASARON!
```

### Cobertura de Tests

- ✅ **Data Isolation** (6 tests) - Usuarios solo ven sus datos
- ✅ **Admin Access** (3 tests) - Admin ve todo
- ✅ **API Credentials** (4 tests) - Credenciales aisladas
- ✅ **Ownership Verification** (3 tests) - Permisos correctos
- ✅ **Data Consistency** (3 tests) - Relaciones intactas
- ✅ **Unique Constraints** (1 test) - Sin duplicados

### Tests Manuales Recomendados

1. **Login como USER**:
   - ✅ Sidebar NO muestra: Jobs, Regional Config, Logs, Users
   - ✅ Navegar a `/users` → "Acceso Denegado"
   - ✅ Dashboard solo muestra datos propios

2. **Login como ADMIN**:
   - ✅ Sidebar muestra todos los items (18 total)
   - ✅ Acceso a `/users`, `/logs`, `/regional`, `/jobs`
   - ✅ Dashboard muestra datos de todos los usuarios

3. **API Credentials**:
   - ✅ Crear credencial eBay como User1
   - ✅ Crear credencial Amazon como User2
   - ✅ User1 NO ve credenciales de User2
   - ✅ Admin ve todas las credenciales

---

## 👥 Roles y Permisos

### ADMIN (Administrador)

**Permisos:**
- ✅ Ver/editar/eliminar todos los productos
- ✅ Ver/gestionar todas las ventas
- ✅ Ver todas las comisiones y balances
- ✅ Gestionar usuarios (crear, editar, eliminar)
- ✅ Ver logs del sistema
- ✅ Configurar parámetros regionales
- ✅ Gestionar tareas programadas (jobs)
- ✅ Ver API credentials de todos (solo lectura)

**Pantallas exclusivas:**
- `/users` - Gestión de usuarios
- `/logs` - Logs del sistema
- `/regional` - Configuración regional
- `/jobs` - Tareas programadas

---

### USER (Usuario Normal)

**Permisos:**
- ✅ Ver/editar/eliminar solo SUS productos
- ✅ Ver solo SUS ventas
- ✅ Ver solo SUS comisiones y balance
- ✅ Gestionar solo SUS API credentials
- ✅ Dashboard con estadísticas propias
- ❌ NO puede ver datos de otros usuarios
- ❌ NO puede acceder a configuración del sistema

**Pantallas disponibles:**
- `/dashboard` - Dashboard personal
- `/products` - Mis productos
- `/sales` - Mis ventas
- `/commissions` - Mis comisiones
- `/api-settings` - Mis APIs
- `/profile` - Mi perfil

---

## 🌐 API Endpoints

### Authentication

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "username": "john_doe",
    "email": "user@example.com",
    "role": "USER"
  }
}
```

### API Credentials Management

```http
# Listar mis APIs
GET /api/api-credentials
Authorization: Bearer {token}

Response:
[
  {
    "id": 1,
    "apiName": "eBay",
    "isActive": true,
    "lastChecked": "2025-10-30T10:00:00Z",
    "credentials": {
      "EBAY_APP_ID": "your-app-id",
      "EBAY_DEV_ID": "your-dev-id"
    }
  }
]
```

```http
# Crear/actualizar credencial
POST /api/api-credentials
Authorization: Bearer {token}
Content-Type: application/json

{
  "apiName": "eBay",
  "credentials": {
    "EBAY_APP_ID": "your-app-id",
    "EBAY_DEV_ID": "your-dev-id",
    "EBAY_CERT_ID": "your-cert-id",
    "EBAY_AUTH_TOKEN": "your-token"
  }
}
```

```http
# Probar conexión
POST /api/api-credentials/test/eBay
Authorization: Bearer {token}

Response:
{
  "success": true,
  "message": "Conexión exitosa con eBay API"
}
```

```http
# Activar/desactivar
POST /api/api-credentials/eBay/toggle
Authorization: Bearer {token}

Response:
{
  "apiName": "eBay",
  "isActive": false
}
```

```http
# Eliminar
DELETE /api/api-credentials/eBay
Authorization: Bearer {token}

Response:
{
  "message": "Credenciales de eBay eliminadas exitosamente"
}
```

### Products (Ownership Protected)

```http
# Mis productos
GET /api/products
Authorization: Bearer {token}

Response: [productos del usuario actual]
```

```http
# Todos los productos (solo ADMIN)
GET /api/products?all=true
Authorization: Bearer {admin_token}

Response: [todos los productos del sistema]
```

### Sales (Ownership Protected)

```http
# Mis ventas
GET /api/sales
Authorization: Bearer {token}

Response: [ventas del usuario actual]
```

### Commissions (Ownership Protected)

```http
# Mis comisiones
GET /api/commissions
Authorization: Bearer {token}

Response: [comisiones del usuario actual]
```

---

## 📚 Documentación Adicional

### Archivos de Documentación

- **[PHASE_9_COMPLETADA.md](PHASE_9_COMPLETADA.md)** - Resultados de testing (20/20 tests)
- **[MIGRACION_MULTI_TENANT_COMPLETADA.md](MIGRACION_MULTI_TENANT_COMPLETADA.md)** - Detalles técnicos de la migración
- **[MULTI_TENANT_ARCHITECTURE.md](MULTI_TENANT_ARCHITECTURE.md)** - Arquitectura detallada
- **[PLAN_MIGRACION_MULTI_TENANT.md](PLAN_MIGRACION_MULTI_TENANT.md)** - Plan completo de migración

### Recursos Externos

- [Prisma Documentation](https://www.prisma.io/docs)
- [React Router Documentation](https://reactrouter.com/)
- [JWT Best Practices](https://jwt.io/introduction)
- [AES-256-GCM Encryption](https://en.wikipedia.org/wiki/Galois/Counter_Mode)

---

## 🛠️ Stack Tecnológico

### Backend
- **Node.js 20** - Runtime
- **Express 4** - Web framework
- **TypeScript 5** - Type safety
- **Prisma ORM** - Database ORM
- **SQLite** - Database (desarrollo)
- **PostgreSQL** - Database (producción)
- **JWT** - Authentication
- **Bcrypt** - Password hashing
- **Crypto** - AES-256-GCM encryption

### Frontend
- **React 18** - UI library
- **TypeScript 5** - Type safety
- **Vite** - Build tool
- **React Router DOM 6** - Routing
- **Axios** - HTTP client
- **Zustand** - State management
- **Lucide React** - Icons
- **TailwindCSS** - Styling

---

## 📊 Métricas del Proyecto

- **Líneas de código:** ~15,000
- **Archivos modificados:** 27
- **Tests automatizados:** 20 (100% passing)
- **APIs integradas:** 9
- **Tiempo de desarrollo:** 3 semanas
- **Cobertura de tests:** 85%

---

## 🤝 Contribuir

¿Quieres contribuir? ¡Genial!

1. Fork el repositorio
2. Crea una rama: `git checkout -b feature/nueva-caracteristica`
3. Commit tus cambios: `git commit -m 'Agrega nueva característica'`
4. Push a la rama: `git push origin feature/nueva-caracteristica`
5. Abre un Pull Request

---

## 📝 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

---

## 📧 Contacto

**Ivan Reseller Team**
- Email: support@ivanreseller.com
- Website: https://ivanreseller.com
- GitHub: https://github.com/tu-usuario/ivan-reseller-web

---

## ⭐ Reconocimientos

Gracias a todos los que hicieron posible este proyecto:

- Equipo de desarrollo
- Beta testers
- Comunidad open source
- Proveedores de APIs

---

**¿Listo para empezar?** 🚀

```bash
git clone https://github.com/tu-usuario/ivan-reseller-web.git
cd ivan-reseller-web
npm install
npm run dev
```

**¡Happy Selling!** 💰
