# 📘 Guía Rápida de Uso - Ivan Reseller

**Para Usuarios Finales**

Esta guía te ayudará a comenzar a usar Ivan Reseller, desde el primer acceso hasta publicar tus primeros productos.

**Última actualización:** 2025-01-27  
**Versión del Sistema:** 1.0  
**URL:** www.ivanreseller.com

---

## 🚀 Inicio Rápido

### 1. Acceso al Sistema

1. **Obtener credenciales del administrador:**
   - El administrador crea tu usuario y te proporciona:
     - Email de acceso
     - Contraseña temporal (debes cambiarla en tu primer login)
   - **Nota:** El registro público está deshabilitado. Solo el administrador puede crear cuentas.

2. **Hacer login:**
   - Ve a `www.ivanreseller.com` o `ivanreseller.com`
   - Haz clic en "Iniciar Sesión" o "Login"
   - Ingresa tu email y contraseña
   - Si es tu primer login, se recomienda cambiar la contraseña después

3. **Primeros pasos:**
   - Al entrar, verás el Dashboard principal con métricas en tiempo real
   - **IMPORTANTE:** Configura tus APIs antes de empezar (ver siguiente sección)
   - Explora el menú lateral para familiarizarte con las opciones disponibles

---

## ⚙️ Configuración de APIs

**IMPORTANTE:** Debes configurar tus credenciales de APIs antes de poder publicar productos. Sin embargo, el sistema funciona parcialmente sin todas las APIs configuradas (funcionalidad básica disponible).

### Pasos para Configurar APIs

1. **Ir a Settings → Configuración de APIs:**
   - Desde el menú lateral, haz clic en "Settings"
   - Luego "Configuración de APIs" o "API Settings"
   - Verás tarjetas para cada API disponible

2. **Seleccionar ambiente:**
   - Cada marketplace (eBay, Amazon, MercadoLibre) permite seleccionar:
     - **Sandbox:** Para pruebas (recomendado al inicio)
     - **Production:** Para operación real con ventas reales
   - **Nota:** Puedes tener credenciales en ambos ambientes y el sistema usará el apropiado según tu configuración de workflow

3. **Configurar cada API según necesites:**

   #### **eBay (OAuth 2.0)**
   - **Campos requeridos:**
     - App ID (Client ID)
     - Dev ID
     - Cert ID (Client Secret)
     - Redirect URI (RuName) - Debes registrarlo en eBay Developer primero
   - **Pasos:**
     1. Obtén tus credenciales desde [developer.ebay.com](https://developer.ebay.com/my/keys)
     2. Registra un RuName en eBay Developer apuntando a: `https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay`
     3. Ingresa App ID, Dev ID, Cert ID y RuName en el sistema
     4. Haz clic en el botón **"OAuth"** para autorizar
     5. Se abrirá una ventana de eBay para autorizar la aplicación
     6. El sistema guardará automáticamente los tokens (Access Token y Refresh Token)
   - **Nota:** Los tokens expiran periódicamente. El sistema los renueva automáticamente usando el Refresh Token.

   #### **Amazon SP-API**
   - **Campos requeridos:**
     - Client ID (LWA)
     - Client Secret (LWA)
     - Refresh Token (obtenido después de autorizar)
     - AWS Access Key ID
     - AWS Secret Access Key
     - Seller ID
     - Marketplace ID
     - Region
   - **Pasos:**
     1. Crea una aplicación en [Amazon Developer Central](https://developer.amazon.com/)
     2. Autoriza la aplicación para obtener el Refresh Token (el sistema tiene un botón OAuth)
     3. Crea un usuario IAM en AWS Console con acceso programático
     4. Ingresa todas las credenciales en el sistema
     5. Haz clic en "Guardar Configuración"
   - **Nota:** Amazon SP-API requiere aprobación y puede tomar varios días.

   #### **MercadoLibre (OAuth 2.0)**
   - **Campos requeridos:**
     - Client ID (App ID)
     - Client Secret
   - **Pasos:**
     1. Inicia sesión en [developers.mercadolibre.cl](https://developers.mercadolibre.cl/)
     2. **Crear aplicación directamente:** Ve a [developers.mercadolibre.cl/devcenter/create-app](https://developers.mercadolibre.cl/devcenter/create-app) (enlace directo)
     3. **O ver aplicaciones primero:** Ve a [developers.mercadolibre.cl/applications](https://developers.mercadolibre.cl/applications) y luego "Crear nueva aplicación"
     4. Configura el Redirect URI: `https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre`
     5. Ingresa Client ID y Client Secret en el sistema
     6. Haz clic en **"Autorizar con MercadoLibre"** o **"OAuth"**
     7. Serás redirigido a MercadoLibre para autorizar
     8. El sistema obtendrá automáticamente Access Token y Refresh Token

   #### **AliExpress (Sesión Manual)**
   - **Campos requeridos:**
     - Email / Username
     - Password
     - Cookies de sesión (se capturan automáticamente)
   - **Pasos:**
     1. En la tarjeta AliExpress, haz clic en **"Abrir login de AliExpress"**
     2. Inicia sesión en AliExpress en la ventana que se abre
     3. En la consola del navegador (F12 → Console), ejecuta el snippet que proporciona el sistema
     4. Las cookies se enviarán automáticamente al sistema
     5. El estado cambiará a "Sesión activa" cuando esté configurado

   #### **GROQ AI (Recomendado - Gratis)**
   - **Campo requerido:**
     - API Key
   - **Pasos:**
     1. Ve a [console.groq.com](https://console.groq.com/) y crea una cuenta (gratis)
     2. Ve a "API Keys" → "Create API Key"
     3. Copia tu API Key (formato: `gsk_...`)
     4. Pégala en el sistema en la sección GROQ AI API
     5. Haz clic en "Guardar Configuración"
   - **Nota:** GROQ ofrece generosas cuotas gratuitas y es muy rápida.

   #### **ScraperAPI o ZenRows (Recomendado para Autopilot)**
   - **Campo requerido:**
     - API Key
   - **Pasos:**
     1. Crea una cuenta en [scraperapi.com](https://www.scraperapi.com/) o [zenrows.com](https://www.zenrows.com/)
     2. Obtén tu API Key desde el dashboard
     3. Pégala en el sistema
     4. Haz clic en "Guardar Configuración"

4. **Validar credenciales:**
   - Cada API tiene un botón **"Probar Conexión"** o **"Test Connection"**
   - Haz clic para verificar que las credenciales funcionan
   - Cada API mostrará un indicador de estado:
     - 🟢 **Activo / Sesión activa:** Credenciales válidas y funcionando
     - 🟡 **Advertencia:** Hay algún problema menor o requiere acción
     - 🔴 **Error / No configurada:** Credenciales inválidas o faltantes
   - **Nota:** Todas las credenciales se encriptan con AES-256-GCM antes de guardarse

---

## 📦 Dropshipping Manual

### Flujo Completo Manual

#### **1. Buscar Oportunidades**

1. Ve a **"Opportunities"** en el menú
2. Ingresa un término de búsqueda (ej: "auriculares bluetooth")
3. Selecciona:
   - Región (país)
   - Cantidad de resultados (1-10)
   - Marketplaces donde buscar competencia
4. Haz clic en **"Search Opportunities"**
5. Revisa los resultados:
   - Título, precio, margen, ROI
   - Score de confianza (0-100)
   - Imagen del producto
   - Link a AliExpress

#### **2. Importar Producto**

1. En los resultados, encuentra el producto que te interesa
2. Haz clic en **"Import"** o **"Importar"**
3. El producto se creará con estado **"PENDING"**
4. Puedes verlo en **"Products"**

#### **3. Aprobar Producto**

1. Ve a **"Products"** → **"Pending"**
2. Revisa el producto importado:
   - Verifica precio sugerido
   - Ajusta si es necesario
   - Revisa imágenes y descripción
3. Haz clic en **"Approve"** o **"Aprobar"**
   - El producto pasa a estado **"APPROVED"**

#### **4. Publicar Producto**

**Opción A: Desde Intelligent Publisher**
1. Ve a **"Publisher"** o **"Intelligent Publisher"** en el menú
2. Verás la lista de productos aprobados pendientes de publicación
3. Selecciona el producto que quieres publicar
4. Elige los marketplaces donde publicar (eBay, Amazon, MercadoLibre)
   - **Nota:** Solo aparecerán los marketplaces para los que tengas credenciales configuradas
5. El sistema generará automáticamente:
   - Título optimizado (con IA si GROQ está configurado)
   - Descripción mejorada (con IA si GROQ está configurado)
   - Precio sugerido
   - Categoría
6. Revisa y ajusta si es necesario
7. Haz clic en **"Publish"** o **"Publicar"**
8. Espera a que termine la publicación (puede tomar unos segundos)
9. Verás el resultado detallado:
   - ✅ **Éxito:** Producto publicado con `listingId` y `listingUrl` para cada marketplace
   - ⚠️ **Parcial:** Algunos marketplaces tuvieron éxito, otros fallaron (ver detalles)
   - ❌ **Error:** Todos los marketplaces fallaron (revisa credenciales y logs)
10. El producto cambiará a estado **"PUBLISHED"** si al menos un marketplace tuvo éxito

**Opción B: Desde Products**
1. Ve a **"Products"** en el menú
2. Filtra por estado **"Approved"** o busca el producto específico
3. Haz clic en el producto para ver detalles
4. Haz clic en **"Publish"** o **"Publicar"**
5. Sigue los mismos pasos que en Opción A (seleccionar marketplaces, revisar, publicar)

#### **5. Registrar Ventas (Manual)**

1. Cuando recibas una venta en el marketplace:
2. Ve a **"Sales"** → **"Add Sale"** o **"Nueva Venta"**
3. Completa:
   - Producto vendido
   - Precio de venta
   - Fecha de venta
   - Cliente (opcional)
4. Haz clic en **"Save"**
5. El sistema calculará automáticamente:
   - Ganancia bruta
   - Comisión (10% + costo fijo)
   - Ganancia neta

#### **6. Gestionar Ventas**

1. Ve a **"Sales"** para ver todas tus ventas
2. Estados disponibles:
   - **PENDING:** Venta registrada, compra pendiente
   - **PROCESSING:** Compra realizada, envío pendiente
   - **SHIPPED:** Producto enviado
   - **DELIVERED:** Producto entregado
3. Actualiza el estado según avance el proceso

---

## 🤖 Autopilot y Workflows Personalizados

### Configurar Autopilot Básico

1. Ve a **"Settings"** → **"Workflow Config"**
2. Configura:
   - **Environment:** Sandbox o Production
   - **Workflow Mode:** Manual, Automatic, o Hybrid
   - **Capital de Trabajo:** Cantidad disponible para inversión
   - **Etapas:** Configura cada etapa (scrape, analyze, publish, etc.) como manual o automática
3. Guarda la configuración

### Usar Autopilot Básico

1. Ve a **"Autopilot"**
2. Revisa la configuración actual
3. Haz clic en **"Start Autopilot"**
4. El sistema comenzará a:
   - Buscar oportunidades automáticamente
   - Filtrar por reglas de negocio (margen mínimo, ROI, etc.)
   - Crear productos según tu configuración
   - Publicar automáticamente si está configurado

### Crear Workflows Personalizados

1. Ve a **"Autopilot"** en el menú
2. Haz clic en la pestaña **"Custom Workflows"** o **"Workflows Personalizados"**
3. Haz clic en **"Create Workflow"** o **"Nuevo Workflow"**
4. Configura:
   - **Nombre:** Nombre descriptivo (ej: "Búsqueda diaria de auriculares")
   - **Descripción:** Descripción opcional del workflow
   - **Tipo:** 
     - `search`: Buscar oportunidades automáticamente
     - `analyze`: Analizar productos existentes
     - `publish`: Publicar productos aprobados
     - `reprice`: Actualizar precios
     - `custom`: Workflow personalizado con acciones específicas
   - **Schedule:** 
     - **Manual:** Solo se ejecuta cuando lo inicias manualmente
     - **Cron Expression:** Para ejecución automática
       - Ejemplos predefinidos: "Every 15 minutes", "Every hour", "Daily at 9 AM"
       - **Custom:** Ingresa tu propia expresión cron (ej: `0 8 * * *` = cada día a las 8 AM)
       - **Nota:** El sistema valida el formato cron y muestra un preview de próximas ejecuciones
   - **Condiciones:** Reglas que deben cumplirse antes de ejecutar (opcional)
   - **Acciones:** Qué hacer cuando se ejecuta (depende del tipo)
   - **Enabled:** Activa o desactiva el workflow
5. Haz clic en **"Save"** o **"Guardar"**
6. El workflow aparecerá en la lista y se ejecutará según el schedule configurado

### Ejecutar Workflows

**Ejecución Manual:**
1. En la lista de workflows, haz clic en **"Run"** o **"Ejecutar"** en el workflow deseado
2. Espera a que termine
3. Revisa los logs para ver qué ocurrió

**Ejecución Programada:**
1. Asegúrate de que el workflow tenga un **Schedule** configurado
2. El workflow debe estar **Enabled** (habilitado)
3. El sistema lo ejecutará automáticamente según el cron expression
4. Revisa los logs después de cada ejecución

---

## 📊 Dashboards y Métricas

### Dashboard Principal

Al iniciar sesión, verás el **Dashboard** con:

- **Resumen de Productos:**
  - Total de productos
  - Pendientes de aprobación
  - Aprobados
  - Publicados
  - Inactivos

- **Resumen de Ventas:**
  - Total de ventas
  - Ventas del mes
  - Ganancia total
  - Ganancia del mes

- **Métricas Clave:**
  - ROI promedio
  - Margen promedio
  - Tasa de éxito de publicaciones

### Dashboard Financiero

Ve a **"Finance"** o **"Finanzas"** para ver:

- **Ganancias:**
  - Brutas (antes de comisiones)
  - Netas (después de comisiones)
  - Por período

- **Comisiones:**
  - Total acumulado
  - Pendientes de pago
  - Pagadas

- **Capital:**
  - Capital de trabajo disponible
  - Capital invertido
  - Capital disponible

### Qué Significan los Datos

- **ROI (Return on Investment):** Porcentaje de retorno sobre la inversión
  - Ejemplo: ROI 50% = Por cada $100 invertidos, ganas $50

- **Margen:** Diferencia entre precio de venta y costo
  - Ejemplo: Costo $10, Venta $20 = Margen $10 (100%)

- **Score de Confianza:** Probabilidad de éxito estimada (0-100)
  - 80-100: Muy alta probabilidad
  - 60-79: Buena probabilidad
  - 40-59: Probabilidad media
  - 0-39: Baja probabilidad

---

## 🔔 Notificaciones

El sistema te enviará notificaciones cuando:

- ✅ Un producto se publique exitosamente
- ⚠️ Hay problemas con tus credenciales de API
- 📦 Se recibe una nueva venta (si webhooks están configurados)
- 💰 Hay una comisión pendiente
- 🔄 El autopilot completa un ciclo

Revisa las notificaciones en el ícono de campana (🔔) en la parte superior.

---

## ❓ Problemas Comunes

### "Falta token OAuth de eBay"
- **Solución:** Ve a Settings → API Settings y autoriza eBay nuevamente

### "No puedo publicar productos"
- **Solución:** Verifica que:
  1. Tengas credenciales configuradas para el marketplace
  2. Las credenciales estén activas (indicador verde)
  3. El producto esté en estado "APPROVED"

### "El autopilot no está funcionando"
- **Solución:** Verifica que:
  1. Tengas capital de trabajo configurado
  2. Tengas credenciales de scraping configuradas
  3. El autopilot esté iniciado (botón "Start")

### "No veo imágenes en los productos"
- **Solución:** Esto debería estar resuelto. Si persiste, contacta al administrador.

---

## 📞 Soporte

Si tienes problemas o preguntas:

1. Revisa esta guía primero
2. Contacta al administrador del sistema
3. Revisa los logs si tienes acceso a ellos

---

**Última actualización:** 2025-01-27

