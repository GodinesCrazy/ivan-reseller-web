# 🔧 Guía de Solución de Problemas - IvanReseller

**Versión:** 2.0  
**Última actualización:** 2025-01-28

---

## 📑 Índice

1. [Problemas Comunes de Usuario](#1-problemas-comunes-de-usuario)
2. [Problemas de Configuración](#2-problemas-de-configuración)
3. [Problemas de Automatización](#3-problemas-de-automatización)
4. [Problemas de APIs](#4-problemas-de-apis)
5. [Problemas de Rendimiento](#5-problemas-de-rendimiento)
6. [Problemas de Base de Datos](#6-problemas-de-base-de-datos)

---

## 1. Problemas Comunes de Usuario

### 1.1. No Puedo Iniciar Sesión

#### ❌ Síntomas
```
Error: "Credenciales incorrectas"
Error: "Usuario no encontrado"
Error: "Cuenta deshabilitada"
```

#### 🔍 Diagnóstico

| Situación | Causa | Solución |
|-----------|-------|----------|
| **Credenciales incorrectas** | Email/password incorrectos | Verifica que escribiste correctamente. Usa "Mostrar contraseña" si es necesario. |
| **Usuario no existe** | No te has registrado | Contacta al administrador para crear tu cuenta. |
| **Cuenta deshabilitada** | Admin deshabilitó tu cuenta | Contacta al administrador para reactivar tu cuenta. |

#### ✅ Solución Paso a Paso

1. **Verifica Credenciales:**
   ```
   - Email: ¿Está escrito correctamente? (sin espacios)
   - Password: ¿Mayúsculas/minúsculas correctas?
   - Caps Lock: ¿Está activado accidentalmente?
   ```

2. **Intenta Recuperar Contraseña:**
   ```
   - Si hay opción "Olvidé mi contraseña", úsala
   - Si no, contacta al administrador
   ```

3. **Contacta Soporte:**
   ```
   - Email: soporte@ivanreseller.com
   - Incluye: Tu email de registro
   ```

### 1.2. No Veo Mis Productos

#### ❌ Síntomas
```
La página de productos está vacía
"No se encontraron productos"
Filtros no funcionan
```

#### 🔍 Diagnóstico

| Situación | Causa | Solución |
|-----------|-------|----------|
| **Filtros activos** | Tienes filtros que ocultan productos | Limpia todos los filtros y recarga |
| **Productos de otro usuario** | Estás viendo productos de otro usuario | Verifica que estés en tu cuenta |
| **Productos eliminados** | Los productos fueron eliminados | Verifica en la base de datos (si tienes acceso) |
| **Error de carga** | Problema de red o servidor | Recarga la página (F5) |

#### ✅ Solución Paso a Paso

1. **Limpia Filtros:**
   ```
   - Ve a la página de Productos
   - Haz clic en "Limpiar filtros"
   - Verifica que no haya filtros activos
   ```

2. **Verifica Estado:**
   ```
   - Verifica que los productos no estén en estado "ELIMINADO"
   - Cambia el filtro de estado a "Todos"
   ```

3. **Recarga la Página:**
   ```
   - Presiona F5 o Ctrl+R
   - Si persiste, recarga forzada: Ctrl+Shift+R
   ```

### 1.3. Error al Crear Producto

#### ❌ Síntomas
```
"Límite de productos pendientes alcanzado"
"Error de validación de imagen"
"Capital insuficiente"
```

#### 🔍 Diagnóstico y Soluciones

**Error: "Límite de productos pendientes alcanzado"**

| Causa | Solución |
|-------|----------|
| Has creado demasiados productos pendientes | **Solución:** Publica o elimina productos existentes. Límite por defecto: 100 productos. |

**Pasos:**
1. Ve a la lista de productos
2. Filtra por estado "PENDING"
3. Publica los productos aprobados o elimina los que no necesites
4. Intenta crear el producto nuevamente

**Error: "Error de validación de imagen"**

| Causa | Solución |
|-------|----------|
| Imagen muy pequeña (< 500x500px) | **Solución:** Usa imágenes de al menos 500x500px |
| Formato no permitido | **Solución:** Solo JPEG, PNG, WebP |
| Tamaño muy grande (> 10MB) | **Solución:** Comprime la imagen |
| URL inválida | **Solución:** Verifica que la URL comience con `https://` |

**Pasos:**
1. Verifica la URL de la imagen (debe ser `https://...`)
2. Abre la URL en tu navegador para confirmar que carga
3. Si es muy pequeña, busca una versión más grande
4. Si es muy grande, comprímela (usa herramientas online)
5. Intenta crear el producto nuevamente

---

## 2. Problemas de Configuración

### 2.1. APIs No Funcionan

#### ❌ Síntomas
```
"API no configurada"
"Credenciales inválidas"
"Test falló"
```

#### 🔍 Diagnóstico por API

**eBay API:**

| Error | Causa | Solución |
|-------|-------|----------|
| `"API no configurada"` | Falta configurar credenciales | Ve a Settings → API Configuration → eBay y configura |
| `"Credenciales inválidas"` | Credenciales incorrectas o expiradas | Verifica en eBay Developer Dashboard. Regenera si es necesario |
| `"Token expirado"` | Token de acceso expirado | Renueva el token en eBay Developer Dashboard |

**PayPal API:**

| Error | Causa | Solución |
|-------|-------|----------|
| `"Saldo PayPal no disponible"` | API de balance no configurada | Esto es normal. El sistema usa validación de capital de trabajo |
| `"Permiso denegado"` | Falta permiso `wallet:read` | Solicita este permiso en PayPal Developer Dashboard |
| `"Mode incorrecto"` | Sandbox vs Production | Verifica que el modo coincida con tus credenciales |

**Google Trends API:**

| Error | Causa | Solución |
|-------|-------|----------|
| `"API Key inválida"` | API Key incorrecta | Verifica en SerpAPI Dashboard |
| `"Límite excedido"` | Has usado todas las búsquedas del plan | Espera al siguiente mes o actualiza tu plan |
| `"API no configurada"` | Opcional, no es error | El sistema funciona sin esta API usando análisis interno |

#### ✅ Pasos de Solución General

1. **Verifica Configuración:**
   ```
   - Ve a Settings → API Configuration
   - Verifica que todas las credenciales estén completas
   - Haz clic en "Test" para cada API
   ```

2. **Revisa Credenciales:**
   ```
   - Verifica en el portal del desarrollador de cada API
   - Asegúrate de que las credenciales sean válidas
   - Regenera si es necesario
   ```

3. **Verifica Permisos:**
   ```
   - Algunas APIs requieren permisos específicos
   - Verifica en la documentación de cada API
   ```

### 2.2. Capital de Trabajo Incorrecto

#### ❌ Síntomas
```
"No se puede comprar: capital insuficiente"
"Capital disponible: $0" (pero debería haber más)
```

#### 🔍 Diagnóstico

| Situación | Causa | Solución |
|-----------|-------|----------|
| **Capital comprometido alto** | Muchas ventas pendientes de compra | Completa las compras pendientes o cancela órdenes |
| **Buffer de 20%** | El sistema requiere 20% más del costo | Esto es normal. Aumenta tu capital en un 25% más |
| **Capital no configurado** | No has configurado capital de trabajo | Ve a Settings → Workflow Config y configura capital |

#### ✅ Solución Paso a Paso

1. **Verifica Capital Configurado:**
   ```
   - Ve a Settings → Workflow Configuration
   - Verifica el campo "Working Capital"
   - Debe ser un número > 0
   ```

2. **Calcula Capital Disponible:**
   ```
   Capital Disponible = Capital Total - Capital Comprometido
   
   Ejemplo:
   - Capital Total: $500
   - Ventas Pendientes: $320
   - Capital Disponible: $180
   ```

3. **Considera el Buffer:**
   ```
   Para comprar un producto de $100:
   - Necesitas: $100 × 1.20 = $120 disponible
   - Si tienes $119 disponible → Error
   - Si tienes $120+ disponible → ✅ OK
   ```

4. **Aumenta Capital si es Necesario:**
   ```
   - Ve a Settings → Workflow Configuration
   - Aumenta "Working Capital"
   - Recomendación: 3x tu venta promedio + 25% buffer
   ```

---

## 3. Problemas de Automatización

### 3.1. Compra Automática No Funciona

#### ❌ Síntomas
```
"Puppeteer automation failed"
"Error en compra automática"
"No se puede iniciar sesión en AliExpress"
```

#### 🔍 Diagnóstico

| Error | Causa | Solución |
|-------|-------|----------|
| `"Puppeteer automation failed"` | Error técnico en automatización | Revisa logs. Cambia a modo manual temporalmente |
| `"Credenciales de AliExpress inválidas"` | Credenciales incorrectas o expiradas | Actualiza credenciales en Settings → API Configuration |
| `"Producto no encontrado"` | URL del producto cambió o producto eliminado | Verifica manualmente la URL. Actualiza el producto si es necesario |
| `"2FA requerido"` | AliExpress requiere autenticación de dos factores | Deshabilita 2FA temporalmente o configura TOTP secret |

#### ✅ Solución Paso a Paso

1. **Verifica Credenciales de AliExpress:**
   ```
   - Ve a Settings → API Configuration → AliExpress
   - Verifica que email y password sean correctos
   - Prueba iniciar sesión manualmente en AliExpress
   ```

2. **Verifica 2FA:**
   ```
   - Si tienes 2FA activado, configura "2FA Secret" en las credenciales
   - O deshabilita 2FA temporalmente para automatización
   ```

3. **Revisa Logs:**
   ```
   - Si tienes acceso a logs, busca errores de Puppeteer
   - Los logs mostrarán el error específico
   ```

4. **Cambia a Modo Manual:**
   ```
   - Ve a Settings → Workflow Configuration
   - Cambia "Stage Purchase" a "MANUAL"
   - Esto permite que recibas notificaciones para compra manual
   ```

### 3.2. Productos No Se Publican Automáticamente

#### ❌ Síntomas
```
Productos quedan en estado "PENDING"
No se publican aunque Autopilot está activo
```

#### 🔍 Diagnóstico

| Causa | Solución |
|-------|----------|
| **Autopilot desactivado** | Activa Autopilot en Settings → Workflow Configuration |
| **Stage Publish en manual** | Cambia "Stage Publish" a "AUTOMATIC" |
| **Falta configuración de marketplace** | Configura credenciales de eBay/Amazon/MercadoLibre |
| **Productos no aprobados** | El sistema solo publica productos aprobados |

#### ✅ Solución Paso a Paso

1. **Verifica Configuración de Workflow:**
   ```
   - Ve a Settings → Workflow Configuration
   - Verifica:
     * Workflow Mode: AUTOMATIC
     * Stage Publish: AUTOMATIC
   ```

2. **Verifica Credenciales de Marketplace:**
   ```
   - Ve a Settings → API Configuration
   - Verifica que tengas configuradas las credenciales del marketplace donde quieres publicar
   - Haz clic en "Test" para verificar
   ```

3. **Verifica Estado de Productos:**
   ```
   - Los productos deben estar en estado "APPROVED" o "PENDING"
   - Si están en "REJECTED", revisa los errores
   ```

---

## 4. Problemas de APIs

### 4.1. eBay API - Errores Comunes

#### ❌ Error: "Invalid App ID"

**Causa:** App ID incorrecto o no existe

**Solución:**
1. Ve a https://developer.ebay.com/my/keys
2. Verifica que el App ID sea correcto
3. Copia el App ID completo (incluye guiones)
4. Pega en Settings → API Configuration → eBay

#### ❌ Error: "Token expired"

**Causa:** Token de acceso expirado

**Solución:**
1. Ve a eBay Developer Dashboard
2. Genera un nuevo token
3. Actualiza el token en Settings → API Configuration → eBay

#### ❌ Error: "Rate limit exceeded"

**Causa:** Demasiadas peticiones a la API

**Solución:**
1. Espera 1 hora antes de hacer más peticiones
2. Reduce la frecuencia de búsquedas
3. Contacta eBay para aumentar límite (si es plan pagado)

### 4.2. PayPal API - Errores Comunes

#### ❌ Error: "Unauthorized"

**Causa:** Client ID o Client Secret incorrectos

**Solución:**
1. Ve a https://developer.paypal.com/dashboard/applications
2. Verifica que copiaste correctamente Client ID y Client Secret
3. Asegúrate de que el "Mode" coincida (sandbox vs production)

#### ❌ Error: "Insufficient permissions"

**Causa:** Falta permiso `wallet:read` para validar saldo

**Solución:**
1. Ve a PayPal Developer Dashboard
2. Solicita permisos adicionales para tu app
3. Específicamente solicita: `wallet:read`

**Nota:** Este permiso es opcional. El sistema funciona sin él usando validación de capital de trabajo.

### 4.3. Google Trends API - Errores Comunes

#### ❌ Error: "Invalid API key"

**Causa:** API Key de SerpAPI incorrecta

**Solución:**
1. Ve a https://serpapi.com/dashboard
2. Copia tu API Key
3. Pega en Settings → API Configuration → Google Trends

#### ❌ Error: "Quota exceeded"

**Causa:** Has usado todas las búsquedas del plan gratuito (100/mes)

**Solución:**
1. Espera al siguiente mes (el límite se reinicia)
2. O actualiza a un plan pagado

**Nota:** Este error no afecta el funcionamiento básico. El sistema usa análisis interno como fallback.

---

## 5. Problemas de Rendimiento

### 5.1. La Página Carga Lento

#### ❌ Síntomas
```
La página tarda mucho en cargar
Spinner de carga infinita
Timeout errors
```

#### 🔍 Diagnóstico

| Causa | Solución |
|-------|----------|
| **Muchos productos** | Usa filtros para limitar resultados |
| **Conexión lenta** | Verifica tu conexión a internet |
| **Servidor sobrecargado** | Contacta al administrador |
| **Cache del navegador** | Limpia cache: Ctrl+Shift+Delete |

#### ✅ Solución

1. **Limpia Cache:**
   ```
   - Presiona Ctrl+Shift+Delete
   - Selecciona "Cached images and files"
   - Haz clic en "Clear data"
   ```

2. **Usa Filtros:**
   ```
   - Limita el número de productos mostrados
   - Usa filtros de fecha, estado, etc.
   ```

3. **Recarga la Página:**
   ```
   - Presiona Ctrl+Shift+R (recarga forzada)
   ```

### 5.2. Búsqueda de Oportunidades Lenta

#### ❌ Síntomas
```
La búsqueda tarda más de 2 minutos
"No se encontraron resultados" (pero debería haber)
```

#### 🔍 Diagnóstico

| Causa | Solución |
|-------|----------|
| **Muchos resultados** | Usa filtros más específicos (margen mínimo, precio, etc.) |
| **Scraping lento** | Esto es normal. AliExpress puede tardar en responder |
| **Proxies lentos** | Si usas proxies, verifica que funcionen correctamente |

#### ✅ Solución

1. **Especifica Filtros:**
   ```
   - Aumenta el margen mínimo (ej: 40%+)
   - Limita el rango de precios
   - Selecciona categoría específica
   ```

2. **Espera un Poco Más:**
   ```
   - Las búsquedas pueden tardar 2-5 minutos
   - No recargues la página mientras busca
   ```

---

## 6. Problemas de Base de Datos

### 6.1. Errores de Validación

#### ❌ Error: "Foreign key constraint failed"

**Causa:** Intento de eliminar o modificar registro relacionado

**Solución:**
1. No elimines registros que tengan relaciones
2. Si necesitas eliminar, elimina primero los relacionados
3. Contacta al administrador si persiste

### 6.2. Datos No Se Guardan

#### ❌ Síntomas
```
"Error al guardar"
Los cambios no persisten
Datos desaparecen después de guardar
```

#### 🔍 Diagnóstico

| Causa | Solución |
|-------|----------|
| **Error de validación** | Revisa los mensajes de error y corrige los campos |
| **Problema de conexión** | Verifica tu conexión a internet |
| **Servidor sobrecargado** | Espera unos minutos e intenta de nuevo |

#### ✅ Solución

1. **Revisa Mensajes de Error:**
   ```
   - Los mensajes indican qué campo tiene problema
   - Corrige el campo y guarda de nuevo
   ```

2. **Verifica Conexión:**
   ```
   - Verifica que tengas internet
   - Intenta recargar la página
   ```

---

## 📞 Contactar Soporte

### Cuándo Contactar

Contacta soporte si:
- ❌ Los problemas persisten después de intentar las soluciones
- ❌ Encuentras un bug que no está documentado
- ❌ Necesitas ayuda con configuración avanzada
- ❌ Tienes preguntas sobre funcionalidades

### Información a Incluir

Cuando contactes soporte, incluye:

1. **Descripción del Problema:**
   - ¿Qué estabas haciendo cuando ocurrió?
   - ¿Qué error específico viste?

2. **Pasos para Reproducir:**
   - ¿Cómo puedes reproducir el problema?
   - ¿Ocurre siempre o solo a veces?

3. **Capturas de Pantalla:**
   - Captura del error
   - Captura de la configuración relevante

4. **Información del Sistema:**
   - Tu ID de usuario (visible en Settings)
   - Navegador que usas (Chrome, Firefox, etc.)
   - Sistema operativo (Windows, Mac, Linux)

### Canales de Soporte

- **Email:** soporte@ivanreseller.com
- **Chat en Vivo:** Disponible en el dashboard (si está habilitado)
- **Centro de Ayuda:** `/help`

---

**Última actualización:** 2025-01-28  
**Versión del documento:** 2.0

