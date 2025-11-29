# Guía Completa: APIs Oficiales de AliExpress

## 📋 Índice

1. [Introducción](#introducción)
2. [AliExpress Affiliate API (Portals API)](#aliexpress-affiliate-api)
3. [AliExpress Dropshipping API](#aliexpress-dropshipping-api)
4. [Comparación de Métodos](#comparación-de-métodos)
5. [Configuración Paso a Paso](#configuración-paso-a-paso)
6. [Límites y Políticas](#límites-y-políticas)
7. [Solución de Problemas](#solución-de-problemas)

---

## Introducción

Ivan Reseller Web integra **dos APIs oficiales de AliExpress** para optimizar el proceso de dropshipping:

1. **Affiliate API (Portals API)**: Para extraer datos de productos, precios e imágenes
2. **Dropshipping API**: Para crear órdenes automatizadas

Estas APIs son **gratuitas**, **oficiales** y más **rápidas y confiables** que el scraping tradicional.

---

## AliExpress Affiliate API

### ¿Qué es?

API oficial de AliExpress para afiliados que permite extraer información de productos de forma oficial y gratuita.

### Ventajas

✅ **Más rápido** que scraping (respuestas instantáneas)  
✅ **Datos oficiales** directamente de AliExpress  
✅ **No requiere navegador** ni cookies  
✅ **Sin riesgo de bloqueos** o CAPTCHAs  
✅ **Incluye información de comisiones** de afiliado  
✅ **Gratis** para desarrolladores aprobados

### Métodos Disponibles

1. **`aliexpress.affiliate.product.query`** - Buscar productos por keyword
2. **`aliexpress.affiliate.productdetail.get`** - Obtener detalles completos de producto
3. **`aliexpress.affiliate.product.sku.detail.get`** - Obtener variantes (SKUs)

### Datos Extraíbles

- Título del producto
- Precios (sale_price, original_price)
- Imágenes principales y secundarias
- Rating y número de ventas
- Descripción
- Categorías
- Información de envío
- Comisiones de afiliado
- Enlaces de promoción

### Requisitos

- Cuenta en AliExpress Portals (afiliado)
- Cuenta de desarrollador en AliExpress Open Platform
- Aplicación tipo "Affiliate API" aprobada
- **No requiere OAuth** (solo app_key y app_secret)

---

## AliExpress Dropshipping API

### ¿Qué es?

API oficial de AliExpress para dropshippers que permite crear órdenes automatizadas y gestionar pedidos.

### Ventajas

✅ **Creación automática de órdenes** sin intervención manual  
✅ **Más rápido y confiable** que automatización con navegador  
✅ **No requiere mantener sesión** activa ni cookies  
✅ **Acceso a información de tracking** y estado de pedidos  
✅ **Verificación de stock** y precios antes de crear la orden  
✅ **Gratis** para desarrolladores aprobados

### Métodos Disponibles

1. **Get Product Info** - Obtener información de producto para dropshipping
2. **Place Order** - Crear orden automatizada en AliExpress
3. **Get Tracking Info** - Consultar estado de envío y tracking

### Requisitos

- Cuenta de AliExpress (comprador o vendedor)
- Cuenta de desarrollador en AliExpress Open Platform
- Aplicación tipo "Dropshipping" aprobada
- **Requiere OAuth** (access_token necesario)

### ⚠️ Importante sobre el Flujo de Pago

- La API permite **crear órdenes**, pero el **pago se realiza en AliExpress**
- Las órdenes quedan en estado `WAIT_BUYER_PAY` (pendiente de pago)
- Debes pagar manualmente en AliExpress o usar automatización adicional
- El sistema muestra un panel de "Pedidos pendientes de pago"
- Esto es el estándar - incluso herramientas como DSers funcionan así

---

## Comparación de Métodos

| Característica | Affiliate API | Dropshipping API | Puppeteer (Fallback) |
|----------------|---------------|------------------|---------------------|
| **Velocidad** | ⚡⚡⚡ Muy rápido | ⚡⚡⚡ Muy rápido | ⚡⚡ Medio |
| **Confiabilidad** | ✅✅✅ Alta | ✅✅✅ Alta | ✅✅ Media |
| **Requiere navegador** | ❌ No | ❌ No | ✅ Sí |
| **Requiere cookies** | ❌ No | ❌ No | ✅ Sí |
| **Riesgo de bloqueo** | ❌ Muy bajo | ❌ Muy bajo | ⚠️ Medio |
| **Requiere OAuth** | ❌ No | ✅ Sí | ❌ No |
| **Costo** | 🆓 Gratis | 🆓 Gratis | 🆓 Gratis |
| **Uso en el sistema** | Scraping/Búsqueda | Compras automáticas | Fallback |

---

## Configuración Paso a Paso

### 1. AliExpress Affiliate API

#### Paso 1: Crear cuenta en AliExpress Portals
1. Ve a [portals.aliexpress.com](https://portals.aliexpress.com/)
2. Crea una cuenta de afiliado (si aún no la tienes)

#### Paso 2: Registrarse como desarrollador
1. Ve a [console.aliexpress.com](https://console.aliexpress.com/)
2. Regístrate como desarrollador
3. Acepta el Open Platform Agreement
4. Completa la información de empresa y objetivos de integración

#### Paso 3: Crear aplicación
1. En la consola, ve a **"App Management"** → **"Create App"**
2. Selecciona el tipo: **"Affiliate API"**
3. Completa el formulario con información de tu aplicación
4. Describe tu caso de uso: "Comparador de precios y sistema de dropshipping automatizado"

#### Paso 4: Esperar aprobación
- AliExpress revisará tu solicitud (1-2 días hábiles típicamente)
- Recibirás una notificación cuando sea aprobada o denegada

#### Paso 5: Obtener credenciales
1. Una vez aprobada, ve a **"App Management"** → Tu aplicación
2. Copia el **App Key** y el **App Secret**
3. También verás el límite de flujo aprobado (típicamente ~5000 llamadas)

#### Paso 6: Obtener Tracking ID (opcional)
1. Desde tu cuenta de AliExpress Portals
2. En la sección de configuración, encuentra tu **Tracking ID**
3. Úsalo para generar enlaces de afiliado (si deseas monetizar)

#### Paso 7: Configurar en Ivan Reseller
1. Ve a **Settings → Configuración de APIs**
2. Busca la tarjeta **"AliExpress Affiliate API"**
3. Ingresa:
   - **App Key**: Pega el App Key copiado
   - **App Secret**: Pega el App Secret copiado
   - **Tracking ID**: (Opcional) Tu Tracking ID de afiliado
   - **Sandbox**: Marca solo si estás usando ambiente de pruebas
4. Haz clic en **"Guardar Configuración"**
5. El estado cambiará a **"Configurada"** ✅

---

### 2. AliExpress Dropshipping API

#### Paso 1: Requisitos previos
- Necesitas una cuenta de AliExpress (de comprador o vendedor)
- La cuenta debe estar verificada y activa

#### Paso 2: Registrarse como desarrollador
1. Ve a [console.aliexpress.com](https://console.aliexpress.com/)
2. Si aún no eres desarrollador, regístrate
3. Acepta el Open Platform Agreement
4. Completa la información de empresa y objetivos de integración

#### Paso 3: Crear aplicación
1. En la consola, ve a **"App Management"** → **"Create App"**
2. Selecciona el tipo: **"Dropshipping"**
3. Completa el formulario con información de tu aplicación
4. Describe tu caso de uso: "Sistema de dropshipping automatizado para crear órdenes vía API"

#### Paso 4: Esperar aprobación
- AliExpress revisará tu solicitud (1-2 días hábiles típicamente)
- Recibirás una notificación cuando sea aprobada o denegada
- ⚠️ **Importante**: Asegúrate de que tu caso de uso esté bien justificado

#### Paso 5: Obtener credenciales básicas
1. Una vez aprobada, ve a **"App Management"** → Tu aplicación
2. Copia el **App Key** y el **App Secret**
3. Guarda estas credenciales de forma segura

#### Paso 6: Obtener Access Token (OAuth)
1. La Dropshipping API requiere autenticación OAuth
2. Necesitas autorizar la aplicación con tu cuenta de AliExpress
3. El sistema proporcionará un flujo OAuth (similar a eBay/MercadoLibre)
4. Después de autorizar, recibirás el **Access Token** y **Refresh Token**
5. ⚠️ **Nota**: El Access Token expira periódicamente y debe renovarse usando el Refresh Token

#### Paso 7: Configurar en Ivan Reseller
1. Ve a **Settings → Configuración de APIs**
2. Busca la tarjeta **"AliExpress Dropshipping API"**
3. Ingresa:
   - **App Key**: Pega el App Key copiado
   - **App Secret**: Pega el App Secret copiado
   - **Access Token**: Token OAuth obtenido después de autorizar
   - **Refresh Token**: (Opcional) Para renovar automáticamente el Access Token
   - **Sandbox**: Marca solo si estás usando ambiente de pruebas
4. Haz clic en **"Guardar Configuración"**
5. El estado cambiará a **"Configurada"** ✅

---

## Límites y Políticas

### Límites de Uso

- **Affiliate API**: Típicamente ~5000 llamadas por período (según aprobación)
- **Dropshipping API**: Límites similares según el tipo de operación
- Si excedes el límite, las peticiones se bloquean temporalmente (~1 segundo)

### Políticas Importantes

1. **No scraping masivo**: AliExpress prohíbe el scraping - solo usar APIs autorizadas
2. **Tracking ID único**: Cada usuario del SaaS debería tener su propio Tracking ID
3. **Uso legítimo**: Los datos solo pueden usarse en el contexto del programa oficial
4. **No redistribuir**: No redistribuir datos masivamente fuera del contexto de la integración
5. **Términos de servicio**: Respeta siempre los términos de servicio de AliExpress

---

## Solución de Problemas

### Problema: La aplicación no es aprobada

**Soluciones:**
- Asegúrate de proporcionar información completa y veraz sobre tu caso de uso
- Describe claramente cómo usarás la API
- Espera 1-2 días hábiles (puede tomar más tiempo)
- Contacta al soporte de AliExpress Developer si pasa mucho tiempo

### Problema: Access Token expirado (Dropshipping API)

**Soluciones:**
- El sistema intentará renovar automáticamente usando el Refresh Token
- Si no funciona, vuelve a autorizar la aplicación (flujo OAuth)
- Verifica que el Refresh Token esté configurado correctamente

### Problema: Límite de llamadas excedido

**Soluciones:**
- Espera un momento antes de hacer más llamadas
- El sistema implementa rate limiting automático
- Considera aumentar el límite solicitándolo a AliExpress (si es posible)

### Problema: Error de firma (sign)

**Soluciones:**
- Verifica que el App Secret sea correcto
- Asegúrate de que el timestamp esté en el formato correcto
- Revisa que los parámetros estén ordenados alfabéticamente antes de calcular la firma

---

## Enlaces Útiles

- **Portal de Desarrolladores**: [developer.alibaba.com](https://developer.alibaba.com/)
- **Console de AliExpress**: [console.aliexpress.com](https://console.aliexpress.com/)
- **AliExpress Portals**: [portals.aliexpress.com](https://portals.aliexpress.com/)
- **Documentación Open Platform**: [developer.alibaba.com/help/en/portal](https://developer.alibaba.com/help/en/portal)

---

## Notas Finales

1. **Las APIs son opcionales**: El sistema funciona sin ellas usando el método de fallback (Puppeteer)
2. **Fallback automático**: Si las APIs fallan, el sistema automáticamente usa el método alternativo
3. **Sin cambios breaking**: La integración es completamente retrocompatible
4. **Mejor rendimiento**: Las APIs son significativamente más rápidas que el scraping tradicional

---

**Última actualización**: Diciembre 2024  
**Versión del documento**: 1.0

