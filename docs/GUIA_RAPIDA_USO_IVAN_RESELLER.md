# 📘 Guía Rápida de Uso - Ivan Reseller

**Para Usuarios Finales**

Esta guía te ayudará a comenzar a usar Ivan Reseller, desde el primer acceso hasta publicar tus primeros productos.

---

## 🚀 Inicio Rápido

### 1. Acceso al Sistema

1. **Obtener credenciales del administrador:**
   - El administrador crea tu usuario y te proporciona:
     - Email de acceso
     - Contraseña temporal (debes cambiarla en tu primer login)

2. **Hacer login:**
   - Ve a `www.ivanreseller.com`
   - Ingresa tu email y contraseña
   - Si es tu primer login, se te pedirá cambiar la contraseña

3. **Primeros pasos:**
   - Al entrar, verás el Dashboard principal
   - Configura tus APIs antes de empezar (ver siguiente sección)

---

## ⚙️ Configuración de APIs

**IMPORTANTE:** Debes configurar tus credenciales de APIs antes de poder publicar productos.

### Pasos para Configurar APIs

1. **Ir a Settings → API Settings:**
   - Desde el menú lateral, haz clic en "Settings"
   - Luego "API Settings"

2. **Seleccionar ambiente:**
   - **Sandbox:** Para pruebas (recomendado al inicio)
   - **Production:** Para operación real con ventas reales

3. **Configurar cada API según necesites:**

   #### **eBay (OAuth)**
   - Haz clic en "Authorize" o "Connect" en la sección eBay
   - Se abrirá una ventana para autorizar la aplicación
   - Autoriza y cierra la ventana
   - El sistema guardará automáticamente tus tokens

   #### **Amazon SP-API**
   - Ingresa:
     - AWS Access Key ID
     - AWS Secret Access Key
     - Seller ID
     - Marketplace ID
   - Haz clic en "Save"

   #### **MercadoLibre**
   - Similar a eBay, usarás OAuth
   - Haz clic en "Authorize" y completa el flujo

   #### **AliExpress (Manual Login)**
   - Ve a AliExpress y haz login manualmente
   - Luego vuelve al sistema y haz clic en "Continue Search"
   - El sistema usará tu sesión activa

   #### **GROQ AI (Opcional pero recomendado)**
   - Ingresa tu API Key de GROQ
   - Se usará para generar títulos y descripciones automáticas

4. **Validar credenciales:**
   - Cada API mostrará un indicador de estado:
     - 🟢 **Activo:** Credenciales válidas y funcionando
     - 🟡 **Advertencia:** Hay algún problema menor
     - 🔴 **Error:** Credenciales inválidas o faltantes

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
1. Ve a **"Publisher"** o **"Intelligent Publisher"**
2. Verás la lista de productos aprobados pendientes de publicación
3. Selecciona el producto
4. Elige los marketplaces donde publicar (eBay, Amazon, MercadoLibre)
5. Haz clic en **"Publish"** o **"Publicar"**
6. Espera a que termine la publicación
7. Verás el resultado:
   - ✅ **Éxito:** Producto publicado con `listingId` y `listingUrl`
   - ⚠️ **Parcial:** Algunos marketplaces tuvieron éxito, otros fallaron
   - ❌ **Error:** Todos los marketplaces fallaron

**Opción B: Desde Products**
1. Ve a **"Products"** → **"Approved"**
2. Selecciona el producto
3. Haz clic en **"Publish"**
4. Sigue los mismos pasos que en Opción A

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

1. Ve a **"Autopilot"** → **"Custom Workflows"**
2. Haz clic en **"Create Workflow"** o **"Nuevo Workflow"**
3. Configura:
   - **Nombre:** Nombre descriptivo
   - **Tipo:** search, analyze, publish, reprice, o custom
   - **Schedule:** 
     - **Manual:** Solo se ejecuta cuando lo inicias manualmente
     - **Cron Expression:** Para ejecución automática (ej: `0 8 * * *` = cada día a las 8 AM)
   - **Condiciones:** Reglas que deben cumplirse antes de ejecutar
   - **Acciones:** Qué hacer cuando se ejecuta
4. Guarda el workflow

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

