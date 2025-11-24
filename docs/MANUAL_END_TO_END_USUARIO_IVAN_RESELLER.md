# 📖 Manual End-to-End para el Usuario - Ivan Reseller

**Guía Completa Paso a Paso desde el Primer Acceso hasta Obtener Utilidad Real**

**Última actualización:** 2025-01-27  
**Versión del Sistema:** 1.0  
**URL:** www.ivanreseller.com

---

## 📋 Tabla de Contenidos

1. [Introducción](#introducción)
2. [Crear y Activar el Usuario (Vista Admin)](#crear-y-activar-el-usuario-vista-admin)
3. [Primer Acceso del Usuario a www.ivanreseller.com](#primer-acceso-del-usuario-a-wwwivanresellercom)
4. [Configuración de APIs y Credenciales (PASO A PASO)](#configuración-de-apis-y-credenciales-paso-a-paso)
5. [Configuración de Workflow y Autopilot](#configuración-de-workflow-y-autopilot)
6. [Búsqueda de Oportunidades y Creación de Productos](#búsqueda-de-oportunidades-y-creación-de-productos)
7. [Publicación en Marketplaces (Ejemplo Real)](#publicación-en-marketplaces-ejemplo-real)
8. [Registro y Seguimiento de Ventas](#registro-y-seguimiento-de-ventas)
9. [Revisión de Ganancias y Comisiones](#revisión-de-ganancias-y-comisiones)
10. [Resumen del Flujo Completo y Buenas Prácticas](#resumen-del-flujo-completo-y-buenas-prácticas)

---

## Introducción

Este manual te guiará paso a paso en un **ejemplo práctico completo** de cómo usar Ivan Reseller para hacer dropshipping desde cero hasta obtener tu primera ganancia.

### Escenario Práctico

A lo largo de este manual, seguiremos el caso de **Ana**, una emprendedora en Estados Unidos que quiere vender productos de AliExpress en eBay.

**Producto de ejemplo:** Auriculares Bluetooth con cancelación de ruido  
**Precio en AliExpress:** $25.00 USD  
**Precio de venta objetivo:** $45.00 USD  
**Marketplace:** eBay (empezando en Sandbox, luego Production)

### Requisitos Previos

Antes de empezar, necesitas:

- ✅ Una cuenta de usuario creada por el administrador
- ✅ Acceso a internet
- ✅ Cuenta de eBay Seller (para publicar productos)
- ✅ Cuenta de AliExpress (para comprar productos)
- ✅ Cuenta de GROQ (gratis, para IA)
- ✅ (Opcional) Cuenta de ScraperAPI o ZenRows (para scraping avanzado)

---

## Crear y Activar el Usuario (Vista Admin)

**Nota:** Esta sección es para administradores. Si ya tienes una cuenta, salta a la siguiente sección.

### Paso 1: Acceso como Administrador

1. El administrador accede a `www.ivanreseller.com`
2. Hace login con sus credenciales de administrador
3. Ve al menú lateral y hace clic en **"Users"** o **"Usuarios"**

### Paso 2: Crear Nuevo Usuario

1. En la página de usuarios, hace clic en **"Create User"** o **"Nuevo Usuario"**
2. Completa el formulario:
   - **Email:** `ana@ejemplo.com` (debe ser único)
   - **Username:** `ana_reseller`
   - **Password:** `TempPass123!` (contraseña temporal segura)
   - **Full Name:** `Ana Martínez` (opcional)
   - **Role:** `USER` (usuario normal)
   - **Commission Rate:** `0.20` (20% de comisión sobre gross profit)
   - **Fixed Monthly Cost:** `17.00` (costo fijo mensual en USD)
3. Hace clic en **"Create User"**
4. El sistema creará automáticamente:
   - La cuenta de usuario
   - Una configuración de workflow por defecto
   - Un registro de actividad

### Paso 3: Compartir Credenciales con el Usuario

El administrador debe compartir con Ana:
- **Email de acceso:** `ana@ejemplo.com`
- **Contraseña temporal:** `TempPass123!`
- **URL del sistema:** `www.ivanreseller.com`
- **Instrucciones:** "Debes cambiar tu contraseña en el primer login"

---

## Primer Acceso del Usuario a www.ivanreseller.com

### Paso 1: Acceder al Sistema

1. Ana abre su navegador web (Chrome, Firefox, Edge, Safari)
2. Navega a `www.ivanreseller.com` o `ivanreseller.com`
3. Ve la página de inicio con el logo de Ivan Reseller

### Paso 2: Hacer Login

1. Ana hace clic en el botón **"Iniciar Sesión"** o **"Login"** (generalmente en la esquina superior derecha)
2. Se abre el formulario de login
3. Ingresa:
   - **Email:** `ana@ejemplo.com`
   - **Password:** `TempPass123!`
4. Hace clic en **"Iniciar Sesión"** o presiona Enter

**Si las credenciales son incorrectas:**
- El sistema mostrará un mensaje: "Email o contraseña incorrectos"
- Ana debe verificar que escribió correctamente el email y la contraseña
- Si olvidó la contraseña, puede usar "Forgot password" (si está disponible) o contactar al administrador

**Si las credenciales son correctas:**
- El sistema autenticará a Ana
- Se generará un token JWT que se guarda en cookies (httpOnly) y localStorage (fallback)
- Ana será redirigida automáticamente al Dashboard

### Paso 3: Dashboard Inicial

Al entrar por primera vez, Ana verá el **Dashboard Principal** con:

**Métricas Principales (Tarjetas):**
- **Balance Actual:** $0.00 USD (inicial)
- **Ventas Totales:** 0
- **Ingresos Totales:** $0.00 USD
- **Ganancias Totales:** $0.00 USD
- **Comisiones Pendientes:** $0.00 USD
- **Productos Activos:** 0
- **Productos Pendientes:** 0

**Gráficas (si están disponibles):**
- Ventas por período (vacía inicialmente)
- Ganancias por período (vacía inicialmente)
- Performance de marketplaces (vacía inicialmente)

**Menú Lateral:**
- Dashboard (actual)
- Opportunities
- Products
- Publisher
- Sales
- Commissions
- Autopilot
- Settings
- Finance
- Reports
- Help Center

**Notificaciones:**
- Puede haber una notificación de bienvenida
- Icono de campana en la parte superior para ver notificaciones

### Paso 4: Cambiar Contraseña (Recomendado)

1. Ana hace clic en su perfil (esquina superior derecha) o va a **Settings → Perfil de Usuario**
2. Busca la opción **"Cambiar Contraseña"**
3. Ingresa:
   - **Contraseña actual:** `TempPass123!`
   - **Nueva contraseña:** `MiNuevaPassSegura2025!`
   - **Confirmar nueva contraseña:** `MiNuevaPassSegura2025!`
4. Hace clic en **"Guardar"** o **"Cambiar Contraseña"**
5. El sistema confirmará que la contraseña fue cambiada exitosamente

---

## Configuración de APIs y Credenciales (PASO A PASO)

**IMPORTANTE:** Esta es la sección más crítica. Sin APIs configuradas, no podrás publicar productos ni usar muchas funcionalidades avanzadas.

### Cómo Acceder a la Configuración de APIs

1. Desde el Dashboard, Ana hace clic en **Settings** en el menú lateral
2. Luego hace clic en **"Configuración de APIs"** o **"API Settings"**
3. Verá una página con tarjetas para cada API disponible

### API 1: GROQ AI (Recomendado - Gratis)

**¿Por qué es importante?** GROQ AI se usa para generar títulos y descripciones optimizadas automáticamente.

#### Paso 1: Obtener API Key de GROQ

1. Ana abre una nueva pestaña en su navegador
2. Navega a [console.groq.com](https://console.groq.com/)
3. Si no tiene cuenta:
   - Hace clic en **"Sign Up"** o **"Crear Cuenta"**
   - Completa el formulario (email, contraseña)
   - Confirma su email si es necesario
   - **Nota:** GROQ es gratis y no requiere tarjeta de crédito
4. Una vez dentro del dashboard de GROQ:
   - Hace clic en **"API Keys"** en el menú lateral (o busca "API Keys" en la interfaz)
   - Hace clic en **"Create API Key"** o **"Crear API Key"**
   - Ingresa un nombre descriptivo (ej: "Ivan Reseller - Ana")
   - Hace clic en **"Create"** o **"Crear"**
   - **IMPORTANTE:** Copia la API Key inmediatamente (formato: `gsk_...`)
   - **Nota:** Solo se muestra una vez. Si la pierdes, deberás crear una nueva.

#### Paso 2: Configurar GROQ en Ivan Reseller

1. Ana vuelve a la pestaña de Ivan Reseller (Settings → Configuración de APIs)
2. Busca la tarjeta de **"GROQ AI API"**
3. Hace clic en la tarjeta para expandirla (si está colapsada)
4. En el campo **"API Key"**, pega la API Key que copió: `gsk_...`
5. Hace clic en el botón **"Guardar Configuración"** o **"Save"**
6. El sistema:
   - Encriptará la API Key con AES-256-GCM
   - La guardará en la base de datos
   - Mostrará un mensaje: "GROQ AI API configurada exitosamente"
7. El estado cambiará a **"Configurada"** ✅

**Validación:**
- Ana puede hacer clic en **"Probar Conexión"** o **"Test Connection"** para verificar que funciona
- Si hay un error, verifica que la API Key sea correcta y que no haya espacios extra

---

### API 2: eBay (Sandbox - Para Pruebas)

**¿Por qué es importante?** eBay es uno de los marketplaces principales donde Ana publicará productos.

#### Paso 1: Crear Cuenta de eBay Developer

1. Ana abre una nueva pestaña
2. Navega a [developer.ebay.com](https://developer.ebay.com/)
3. Si no tiene cuenta:
   - Hace clic en **"Sign In"** o **"Register"**
   - Crea una cuenta de eBay Developer (puede usar su cuenta de eBay existente)
   - Completa el proceso de registro
4. Una vez dentro del dashboard:
   - Hace clic en **"My Account"** → **"Keys"** o navega directamente a [developer.ebay.com/my/keys](https://developer.ebay.com/my/keys)

#### Paso 2: Obtener Credenciales de Sandbox

1. En la página de Keys, Ana ve dos secciones:
   - **Sandbox Keys** (para pruebas)
   - **Production Keys** (para operación real)
2. Para empezar, usa **Sandbox Keys**:
   - Hace clic en la sección **"Sandbox"**
   - Verá tres valores importantes:
     - **App ID (Client ID):** Ejemplo: `YourAppI-YourApp-SBX-abc123def456`
     - **Dev ID:** Ejemplo: `Your-DevI-SBX-xyz789`
     - **Cert ID (Client Secret):** Ejemplo: `SBX-abc123def456ghi789`
3. **Copia estos tres valores** y guárdalos temporalmente en un lugar seguro

#### Paso 3: Registrar Redirect URI (RuName)

1. En la misma página de Keys de eBay Developer, Ana busca la sección **"User Tokens"** o **"OAuth Tokens"**
2. Dentro de **"Your eBay Sign-in Settings"**, busca **"Redirect URL name (RuName)"**
3. Hace clic en **"Add"** o **"Create"** para crear un nuevo RuName
4. Ingresa:
   - **Redirect URI:** `https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay`
   - **Nota:** Si el sistema está en otro dominio, usa ese dominio
5. eBay generará un **RuName** (ejemplo: `IvMart_IvanRese-IvanMart-SBX-abc123def456`)
6. **Copia el RuName** generado

#### Paso 4: Configurar eBay en Ivan Reseller (Sandbox)

1. Ana vuelve a Ivan Reseller (Settings → Configuración de APIs)
2. Busca la tarjeta de **"eBay Trading API"**
3. Hace clic para expandirla
4. Selecciona el ambiente **"Sandbox"** (si hay un selector)
5. Completa los campos:
   - **App ID (Client ID):** Pega el App ID copiado de eBay
   - **Dev ID:** Pega el Dev ID copiado
   - **Cert ID (Client Secret):** Pega el Cert ID copiado
   - **Redirect URI (RuName):** Pega el RuName generado
6. Hace clic en **"Guardar Configuración"**
7. El sistema guardará las credenciales (encriptadas)

#### Paso 5: Autorizar con OAuth (Obtener Tokens)

1. Después de guardar, Ana verá un botón **"OAuth"** o **"Autorizar con eBay"**
2. Hace clic en el botón
3. Se abrirá una nueva ventana/pestaña con la página oficial de eBay Sandbox
4. Ana:
   - Inicia sesión con su cuenta de eBay Sandbox (o crea una si no tiene)
   - Revisa los permisos que la aplicación solicita
   - Hace clic en **"I Agree"** o **"Aceptar"** para autorizar
5. eBay redirigirá automáticamente de vuelta a Ivan Reseller
6. El sistema:
   - Capturará el código de autorización
   - Intercambiará el código por Access Token y Refresh Token
   - Guardará los tokens automáticamente (encriptados)
7. La tarjeta de eBay mostrará: **"Sesión activa"** ✅

**Validación:**
- Ana puede hacer clic en **"Probar Conexión"** para verificar
- Si ve el mensaje "Falta token OAuth de eBay", significa que el OAuth no se completó correctamente. Debe repetir el paso 5.

#### Paso 6: Configurar eBay Production (Para Operación Real)

**Nota:** Repite los mismos pasos pero usando **Production Keys** de eBay Developer:

1. En eBay Developer, ve a la sección **"Production Keys"**
2. Copia App ID, Dev ID y Cert ID de Production
3. Crea un RuName para Production (puede usar el mismo Redirect URI)
4. En Ivan Reseller, selecciona ambiente **"Production"** y completa los campos
5. Autoriza con OAuth usando tu cuenta de eBay real (no Sandbox)

---

### API 3: MercadoLibre (Opcional - Para Mercado Latinoamericano)

**¿Por qué es importante?** Si Ana quiere vender en Latinoamérica, MercadoLibre es esencial.

#### Paso 1: Crear Aplicación en MercadoLibre

1. Ana navega a [developers.mercadolibre.cl](https://developers.mercadolibre.cl/) e inicia sesión con su cuenta de MercadoLibre
2. Ana va a [developers.mercadolibre.cl/devcenter/create-app](https://developers.mercadolibre.cl/devcenter/create-app) (enlace directo para crear nueva aplicación)
3. **PANTALLA 1 - Información básica:** Completa el primer formulario "¿Qué solución planeas desarrollar?":
   - **Nombre*:** "Ivan Reseller - Ana" (nombre completo de la aplicación)
   - **Nombre corto*:** "ivan-reseller-ana" (sin espacios, solo letras, números y guiones)
   - **Descripción*:** "Aplicación para gestión de productos y ventas en MercadoLibre mediante dropshipping"
   - **Logo:** Opcional - Puede subir un logo PNG (máximo 1MB) o dejarlo vacío
   - Hace clic en **"Continuar"** (botón azul en la parte inferior derecha)
4. **PANTALLA 2 - Configuración y scopes:** En la siguiente pantalla, completa:
   - **Redirect URI*:** 
     - Haz clic en el campo "Redirect URI"
     - Ingresa exactamente: `https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre`
     - ⚠️ **CRÍTICO:** Debe ser exactamente `www.ivanreseller.com` (NO uses vercel.app ni otros dominios)
     - Si hay un campo vacío adicional, puedes dejarlo vacío o eliminarlo con el ícono de basura
   - **Integración*:** 
     - Marca al menos: ☑️ **Mercado Libre** (obligatorio)
     - ☐ Vtex (opcional, solo si lo necesitas)
     - ⚠️ Si no marcas "Mercado Libre", verás error: "Selecciona mínimo una unidad de negocio"
   - **Permisos*:** Para cada categoría, selecciona el nivel de acceso en el dropdown:
     - **Usuarios:** "Lectura y escritura" (para gestionar perfil)
     - **Publicaciones y ofertas/ventas:** "Lectura y escritura" (para publicar productos)
     - **Ventas y envíos de un producto:** "Lectura y escritura" (para gestionar pedidos)
     - **Comunicaciones y preguntas:** "Lectura y escritura" (para responder mensajes)
     - **Publicidad de un producto:** "De solo lectura" (opcional)
     - **Facturación de una cuenta:** "De solo lectura" (opcional)
     - **Métricas del negocio:** "De solo lectura" (recomendado para ver estadísticas)
     - **Promociones, cupones y descuentos:** "Lectura y escritura" (opcional)
     - ⚠️ Debes seleccionar al menos una opción para cada permiso, o verás error: "Selecciona al menos una opción para cada permiso"
   - **Topics (Notificaciones):** Puedes dejar los valores por defecto o expandir y configurar según necesites
   - **Notificaciones callback URL:** Opcional - Puedes dejarlo vacío por ahora
   - Hace clic en **"Continuar"** o **"Crear aplicación"** (botón azul)

#### Paso 2: Obtener Credenciales

1. Después de crear la aplicación, Ana verá:
   - **App ID (Client ID):** Ejemplo: `1234567890123456`
   - **Secret Key (Client Secret):** Ejemplo: `abcdefghijklmnopqrstuvwxyz123456`
2. **Copia ambos valores**

#### Paso 3: Configurar en Ivan Reseller

1. En Ivan Reseller, busca la tarjeta **"MercadoLibre API"**
2. Completa:
   - **Client ID (App ID):** Pega el App ID
   - **Client Secret:** Pega el Secret Key
3. Hace clic en **"Guardar Configuración"**

#### Paso 4: Autorizar con OAuth

1. Hace clic en **"Autorizar con MercadoLibre"** o **"OAuth"**
2. Se abrirá una ventana de MercadoLibre
3. Ana autoriza la aplicación
4. El sistema obtendrá automáticamente Access Token y Refresh Token
5. El estado cambiará a **"Sesión activa"** ✅

---

### API 4: AliExpress (Sesión Manual)

**¿Por qué es importante?** AliExpress es la fuente de productos. Necesitas una sesión activa para que el sistema pueda buscar productos y comprar automáticamente.

#### Paso 1: Abrir Login de AliExpress

1. En Ivan Reseller, Ana busca la tarjeta **"AliExpress Auto-Purchase"**
2. Hace clic en **"Abrir login de AliExpress"** o botón similar
3. Se abrirá una nueva ventana/pestaña con AliExpress

#### Paso 2: Iniciar Sesión en AliExpress

1. En la ventana de AliExpress, Ana:
   - Inicia sesión con su cuenta de AliExpress (o crea una si no tiene)
   - Asegúrate de que la sesión esté activa (no cerrar la ventana todavía)

#### Paso 3: Capturar Cookies con Snippet

1. Ana vuelve a la pestaña de Ivan Reseller
2. En la tarjeta de AliExpress, verá un botón **"Guardar cookies manualmente"** o similar
3. Hace clic y se mostrará un **"Snippet automático"** (código JavaScript)
4. Ana:
   - Copia todo el snippet (Ctrl+C / Cmd+C)
   - Vuelve a la pestaña de AliExpress (donde está iniciada sesión)
   - Abre la consola del navegador: Presiona `F12` → Pestaña **"Console"**
   - Si el navegador bloquea el pegado, escribe primero: `allow pasting` (o `void 0` en Edge) y presiona Enter
   - Pega el snippet completo en la consola (Ctrl+V / Cmd+V)
   - Presiona Enter
5. La consola mostrará: `✅ Cookies enviadas. Vuelve a la plataforma para confirmar.`
6. Ana vuelve a la pestaña de Ivan Reseller
7. El sistema actualizará automáticamente el estado a **"Sesión activa"** ✅

**Nota:** Si ves "No se encontraron cookies en esta pestaña", significa que ejecutaste el snippet en la pestaña incorrecta. Debe ejecutarse en la pestaña de AliExpress donde estás iniciado sesión.

---

### API 5: ScraperAPI o ZenRows (Opcional pero Recomendado)

**¿Por qué es importante?** Estos servicios evitan que AliExpress bloquee las búsquedas automáticas.

#### Paso 1: Crear Cuenta en ScraperAPI

1. Ana navega a [www.scraperapi.com](https://www.scraperapi.com/)
2. Hace clic en **"Sign Up"** o **"Crear Cuenta"**
3. Completa el registro (plan gratuito disponible para pruebas)
4. Una vez dentro del dashboard:
   - Va a **"Dashboard"** → **"API Keys"**
   - Copia su **API Key**

#### Paso 2: Configurar en Ivan Reseller

1. En Ivan Reseller, busca la tarjeta **"ScraperAPI"**
2. Pega la API Key en el campo correspondiente
3. Hace clic en **"Guardar Configuración"**
4. El estado cambiará a **"Configurada"** ✅

**Alternativa - ZenRows:**
- Mismo proceso pero en [www.zenrows.com](https://www.zenrows.com/)

---

### Resumen de APIs Configuradas

Después de configurar todas las APIs, Ana debería ver:

- ✅ **GROQ AI API:** Configurada
- ✅ **eBay (Sandbox):** Sesión activa
- ✅ **eBay (Production):** Sesión activa (opcional al inicio)
- ✅ **MercadoLibre:** Sesión activa (opcional)
- ✅ **AliExpress:** Sesión activa
- ✅ **ScraperAPI:** Configurada (opcional)

**Nota:** No es necesario configurar todas las APIs al inicio. Ana puede empezar con GROQ y eBay Sandbox, y agregar las demás según las necesite.

---

## Configuración de Workflow y Autopilot

### Paso 1: Acceder a Configuración de Workflow

1. Ana hace clic en **Settings** en el menú lateral
2. Luego hace clic en **"Workflow Config"** o **"Configuración de Workflow"**

### Paso 2: Configurar Ambiente

1. Ana ve la sección **"Environment"** o **"Ambiente"**
2. Selecciona:
   - **Sandbox:** Para pruebas (recomendado al inicio)
   - **Production:** Para operación real (solo cuando esté lista)

### Paso 3: Configurar Modo de Workflow

1. Ana ve la sección **"Workflow Mode"** o **"Modo de Workflow"**
2. Selecciona:
   - **Manual:** Requiere aprobación en cada etapa (recomendado para principiantes)
   - **Automatic:** Ejecuta todo automáticamente (avanzado)
   - **Hybrid:** Algunas etapas automáticas, otras manuales

**Para el ejemplo de Ana, selecciona "Manual"** para tener control total.

### Paso 4: Configurar Etapas Individuales

Ana puede configurar cada etapa del workflow:

1. **SCRAPE - Búsqueda de Oportunidades:**
   - Selecciona: **"Automatic"** (el sistema buscará automáticamente)
   - Descripción: Búsqueda automática de productos en AliExpress

2. **ANALYZE - Análisis IA:**
   - Selecciona: **"Automatic"** (el sistema analizará con IA)
   - Descripción: Análisis inteligente de oportunidades

3. **PUBLISH - Publicación:**
   - Selecciona: **"Manual"** (Ana quiere revisar antes de publicar)
   - Descripción: Publicación de productos en marketplaces

4. **PURCHASE - Compra Automática:**
   - Selecciona: **"Manual"** (Ana quiere controlar las compras)
   - Descripción: Compra automática al proveedor

5. **FULFILLMENT - Cumplimiento:**
   - Selecciona: **"Manual"** (Ana gestionará envíos manualmente)
   - Descripción: Gestión de envíos y tracking

6. **CUSTOMER SERVICE - Atención al Cliente:**
   - Selecciona: **"Manual"** (Ana atenderá clientes manualmente)
   - Descripción: Gestión de consultas y soporte

### Paso 5: Configurar Capital de Trabajo

1. Ana ve la sección **"Working Capital"** o **"Capital de Trabajo"**
2. Ingresa el monto disponible en USD (ejemplo: `500.00`)
3. **Explicación:** Este es el dinero que Ana tiene disponible para invertir en productos. El sistema usará esto para calcular cuántos productos puede procesar simultáneamente.

### Paso 6: Configurar Umbrales de Auto-Aprobación

1. **Auto-Approve Threshold:** `70` (confianza mínima 0-100% para auto-aprobar)
2. **Auto-Publish Threshold:** `80` (confianza mínima para auto-publicar)
3. **Max Auto-Investment:** `50.00` (inversión máxima por operación automática en USD)

**Nota:** Como Ana está en modo Manual, estos umbrales no se aplicarán todavía, pero están configurados para cuando cambie a modo Automatic.

### Paso 7: Guardar Configuración

1. Ana hace clic en **"Guardar Configuración"** o **"Save Configuration"**
2. El sistema confirmará: "Configuración de workflow guardada exitosamente"
3. La configuración se aplicará inmediatamente

---

## Búsqueda de Oportunidades y Creación de Productos

### Paso 1: Acceder a Oportunidades

1. Ana hace clic en **"Opportunities"** en el menú lateral
2. Ve la página de búsqueda de oportunidades

### Paso 2: Buscar Oportunidades

1. Ana ve un formulario de búsqueda con los siguientes campos:
   - **Search Term:** Campo de texto para término de búsqueda
   - **Region:** Dropdown para seleccionar región (US, UK, MX, DE, ES, BR, etc.)
   - **Max Items:** Número de resultados (1-10)
   - **Marketplaces:** Checkboxes para seleccionar marketplaces (eBay, Amazon, MercadoLibre)

2. Ana completa:
   - **Search Term:** `auriculares bluetooth cancelación ruido`
   - **Region:** `US` (Estados Unidos)
   - **Max Items:** `5` (quiere ver 5 resultados)
   - **Marketplaces:** Marca `eBay` (para buscar competencia en eBay)

3. Hace clic en **"Search Opportunities"** o **"Buscar Oportunidades"**

### Paso 3: Revisar Resultados

El sistema mostrará una lista de oportunidades encontradas. Cada oportunidad muestra:

- **Imagen del producto:** Foto del producto de AliExpress
- **Título:** Nombre del producto
- **Costo en AliExpress:** `$25.00 USD` (precio de compra)
- **Precio Sugerido:** `$45.00 USD` (precio de venta sugerido)
- **Margen de Ganancia:** `80%` (diferencia entre venta y costo)
- **ROI:** `80%` (Retorno de Inversión)
- **Nivel de Competencia:** `Medium` (baja/media/alta)
- **Score de Confianza:** `85%` (0-100%, probabilidad de éxito)
- **Enlace a AliExpress:** Botón para ver el producto original

**Interpretación para Ana:**
- ✅ **BUENA OPORTUNIDAD:** Margen >30%, ROI >50%, Competencia baja/media, Confianza >70%
- ❌ **EVITAR:** Margen <20%, ROI <30%, Competencia alta, Confianza <60%

En este caso, el producto tiene:
- Margen: 80% ✅ (excelente)
- ROI: 80% ✅ (excelente)
- Competencia: Medium ✅ (manejable)
- Confianza: 85% ✅ (muy alta)

**Conclusión:** Es una excelente oportunidad.

### Paso 4: Importar Producto

1. Ana encuentra el producto que le interesa (auriculares bluetooth)
2. Hace clic en el botón **"Import"** o **"Importar"** en la tarjeta del producto
3. El sistema:
   - Crea un nuevo producto en la base de datos
   - Pre-llena los datos desde AliExpress
   - Asigna estado **"PENDING"** (pendiente de aprobación)
4. Ana ve un mensaje: "Producto importado exitosamente"

### Paso 5: Ver Producto Importado

1. Ana hace clic en **"Products"** en el menú lateral
2. Ve la lista de productos
3. Filtra por estado **"PENDING"** para ver productos pendientes
4. Encuentra el producto recién importado: "Auriculares Bluetooth con Cancelación de Ruido"

### Paso 6: Editar Producto (Opcional)

1. Ana hace clic en el producto para ver detalles
2. Puede editar:
   - **Título:** Puede optimizarlo (ej: "Auriculares Bluetooth Premium con Cancelación de Ruido Activa - Inalámbricos")
   - **Descripción:** Puede mejorarla o usar la generada por IA
   - **Precio Sugerido:** `$45.00` (puede ajustarlo)
   - **Categoría:** Selecciona la categoría apropiada
   - **Imágenes:** Puede agregar más imágenes si las tiene
3. Hace clic en **"Guardar"** o **"Save"**

### Paso 7: Aprobar Producto

1. Ana vuelve a la lista de productos
2. Encuentra el producto en estado **"PENDING"**
3. Hace clic en el botón **"Approve"** o **"Aprobar"**
4. El sistema:
   - Cambia el estado a **"APPROVED"**
   - El producto queda listo para publicación
5. Ana ve un mensaje: "Producto aprobado exitosamente"

---

## Publicación en Marketplaces (Ejemplo Real)

### Paso 1: Acceder al Intelligent Publisher

1. Ana hace clic en **"Publisher"** o **"Intelligent Publisher"** en el menú lateral
2. Ve la página del publicador inteligente

### Paso 2: Seleccionar Producto para Publicar

1. Ana ve una lista de productos en estado **"APPROVED"** pendientes de publicación
2. Encuentra el producto: "Auriculares Bluetooth con Cancelación de Ruido"
3. Hace clic en el producto o en el botón **"Publish"** asociado

### Paso 3: Seleccionar Marketplaces

1. El sistema muestra un formulario de publicación
2. Ana ve checkboxes para seleccionar marketplaces:
   - ☑️ **eBay (Sandbox)** - Marcado (tiene credenciales configuradas)
   - ☐ **eBay (Production)** - Desmarcado (puede marcarlo si quiere)
   - ☐ **Amazon** - Desmarcado (no tiene credenciales)
   - ☐ **MercadoLibre** - Desmarcado (puede marcarlo si tiene credenciales)

3. Para el ejemplo, Ana marca solo **eBay (Sandbox)** (para pruebas)

### Paso 4: Revisar Contenido Generado

El sistema genera automáticamente (usando GROQ AI si está configurado):

**Título Generado:**
```
Auriculares Bluetooth Premium con Cancelación de Ruido Activa - Inalámbricos - Alta Calidad
```

**Descripción Generada:**
```
¡Experimenta el sonido perfecto con estos auriculares Bluetooth de alta calidad!

CARACTERÍSTICAS PRINCIPALES:
✅ Cancelación de ruido activa para una experiencia auditiva inmersiva
✅ Tecnología Bluetooth 5.0 para conexión estable y rápida
✅ Batería de larga duración (hasta 30 horas de uso)
✅ Diseño ergonómico y cómodo para uso prolongado
✅ Compatible con todos los dispositivos Bluetooth

IDEAL PARA:
- Trabajo desde casa
- Viajes y desplazamientos
- Ejercicio y deporte
- Música y entretenimiento

GARANTÍA DE CALIDAD Y ENVÍO RÁPIDO
```

**Precio Sugerido:** `$45.00 USD`

**Categoría:** Electrónica > Audio > Auriculares

Ana puede:
- Editar el título si quiere
- Editar la descripción si quiere
- Ajustar el precio si quiere
- Cambiar la categoría si es necesario

Para el ejemplo, Ana deja todo como está (el contenido generado es bueno).

### Paso 5: Publicar

1. Ana hace clic en **"Publish"** o **"Publicar"**
2. El sistema muestra: "Publicando producto..."
3. El sistema:
   - Valida las credenciales de eBay (Sandbox)
   - Prepara los datos del producto
   - Llama a la API de eBay para crear el listing
   - Espera la respuesta de eBay

### Paso 6: Revisar Resultado de Publicación

Después de unos segundos, el sistema muestra el resultado:

**Si la publicación fue exitosa:**
```
✅ Publicación exitosa en eBay (Sandbox)

Listing ID: 123456789012
Listing URL: https://sandbox.ebay.com/itm/123456789012

El producto ha sido publicado correctamente y está disponible en eBay Sandbox.
```

**Si hubo un error parcial:**
```
⚠️ Publicación parcial

✅ eBay (Sandbox): Publicado exitosamente
❌ MercadoLibre: Error - Credenciales inválidas

El producto está publicado en algunos marketplaces pero no en todos.
```

**Si hubo un error completo:**
```
❌ Error en la publicación

❌ eBay (Sandbox): Error - Token OAuth expirado

Por favor, verifica tus credenciales y vuelve a intentar.
```

**Para el ejemplo de Ana, asumimos éxito:**
- ✅ eBay (Sandbox): Publicado exitosamente
- Listing ID: `123456789012`
- Listing URL: `https://sandbox.ebay.com/itm/123456789012`

### Paso 7: Verificar Publicación

1. Ana puede hacer clic en el **Listing URL** para ver el producto publicado en eBay Sandbox
2. Verifica que:
   - El título se vea correctamente
   - La descripción esté completa
   - El precio sea correcto ($45.00)
   - Las imágenes se muestren
   - La categoría sea correcta

### Paso 8: Estado del Producto

1. Ana vuelve a **"Products"** en Ivan Reseller
2. Busca el producto publicado
3. El estado ahora es **"PUBLISHED"** ✅
4. Puede ver:
   - **Marketplace:** eBay (Sandbox)
   - **Listing ID:** 123456789012
   - **Listing URL:** (enlace clickeable)
   - **Fecha de publicación:** (fecha y hora)

### Paso 9: Publicar en Production (Cuando Esté Lista)

Cuando Ana esté lista para operación real:

1. Repite los pasos 1-5 pero selecciona **eBay (Production)** en lugar de Sandbox
2. Asegúrate de tener credenciales de Production configuradas
3. El producto se publicará en eBay real (no Sandbox)
4. Los clientes reales podrán comprar el producto

---

## Registro y Seguimiento de Ventas

### Escenario: Ana Recibe una Venta

**Situación:** Un cliente compra los auriculares en eBay Sandbox por $45.00 USD.

### Paso 1: Registrar Venta Manualmente

**Nota:** En producción, las ventas pueden registrarse automáticamente mediante webhooks si están configurados. Para este ejemplo, Ana registra la venta manualmente.

1. Ana hace clic en **"Sales"** o **"Ventas"** en el menú lateral
2. Hace clic en **"Add Sale"** o **"Nueva Venta"** o **"Registrar Venta"**
3. Completa el formulario:
   - **Producto:** Selecciona "Auriculares Bluetooth con Cancelación de Ruido"
   - **Marketplace:** Selecciona "eBay"
   - **Marketplace Order ID:** `123456789012-001` (ID de la orden de eBay)
   - **Sale Price:** `45.00` (precio de venta)
   - **Fecha de Venta:** (selecciona la fecha actual)
   - **Cliente (opcional):** Puede ingresar información del cliente si la tiene
4. Hace clic en **"Save"** o **"Guardar"**

### Paso 2: Sistema Calcula Automáticamente

El sistema calcula automáticamente:

- **Sale Price:** $45.00 USD
- **AliExpress Cost:** $25.00 USD (precio de compra)
- **Marketplace Fee (12.5%):** $5.63 USD (fee de eBay)
- **Total Costos:** $30.63 USD
- **Gross Profit (Utilidad Bruta):** $14.37 USD
- **Commission Rate (20%):** 20% de gross profit
- **Comisión Admin:** $2.87 USD (20% de $14.37)
- **Net Profit (Ganancia Neta):** $11.50 USD (para Ana)

Ana ve estos cálculos en la página de detalles de la venta.

### Paso 3: Actualizar Estado de la Venta

La venta inicia en estado **"PENDING"** (pendiente de procesar).

**Flujo de Estados:**
1. **PENDING:** Venta registrada, compra pendiente
2. **PROCESSING:** Compra realizada en AliExpress, envío pendiente
3. **SHIPPED:** Producto enviado, tracking disponible
4. **DELIVERED:** Producto entregado al cliente

**Ana actualiza el estado:**

1. **Cuando compra en AliExpress:**
   - Va a la venta en **"Sales"**
   - Hace clic en **"Update Status"** o **"Actualizar Estado"**
   - Selecciona **"PROCESSING"**
   - Opcionalmente, ingresa el **Tracking Number** de AliExpress
   - Hace clic en **"Save"**

2. **Cuando recibe tracking de AliExpress:**
   - Actualiza el estado a **"SHIPPED"**
   - Ingresa el **Tracking Number** completo
   - El sistema notificará al cliente (si está configurado)

3. **Cuando el cliente recibe el producto:**
   - Actualiza el estado a **"DELIVERED"**
   - La venta se marca como completada

### Paso 4: Ver Detalles de la Venta

Ana puede ver en **"Sales"** → Detalles de la venta:

- **Información de la Venta:**
  - Producto vendido
  - Precio de venta
  - Fecha de venta
  - Estado actual
  - Marketplace

- **Cálculos Financieros:**
  - Ingresos: $45.00
  - Costos: $30.63
  - Gross Profit: $14.37
  - Comisión: $2.87
  - Net Profit: $11.50

- **Tracking:**
  - Tracking Number (si está disponible)
  - Estado de envío

---

## Revisión de Ganancias y Comisiones

### Paso 1: Ver Dashboard Financiero

1. Ana hace clic en **"Finance"** o **"Finanzas"** en el menú lateral
2. Ve el Dashboard Financiero con:

**Métricas Principales:**
- **Balance Actual:** $11.50 USD (ganancia neta acumulada)
- **Ventas Totales:** 1
- **Ingresos Totales:** $45.00 USD
- **Ganancias Totales:** $11.50 USD (net profit acumulado)
- **Comisiones Pendientes:** $2.87 USD (comisión que debe pagar al admin)

**Gráficas (si están disponibles):**
- Ventas por período
- Ganancias por período
- Tendencias

### Paso 2: Ver Comisiones

1. Ana hace clic en **"Commissions"** o **"Comisiones"** en el menú lateral
2. Ve la lista de comisiones:

**Comisión de la Venta:**
- **ID:** COM-001
- **Venta Asociada:** Venta #1 (Auriculares Bluetooth)
- **Monto:** $2.87 USD
- **Estado:** PENDING (pendiente de pago)
- **Fecha de Creación:** (fecha actual)
- **Fecha Programada de Pago:** (si está programada)

**Nota:** Ana no puede pagar comisiones directamente. El administrador las marca como pagadas cuando las recibe.

### Paso 3: Ver Reportes

1. Ana hace clic en **"Reports"** o **"Reportes"** en el menú lateral
2. Puede generar reportes:
   - **Reporte de Ventas:** Lista todas las ventas con detalles
   - **Reporte de Ganancias:** Resumen de ganancias por período
   - **Reporte de Productos:** Performance de productos
   - **Reporte de Comisiones:** Historial de comisiones

3. Puede exportar en:
   - JSON
   - CSV
   - Excel (si está disponible)
   - PDF (si está disponible)

### Paso 4: Proyección de Ganancias

Ana puede calcular proyecciones:

**Escenario Conservador (10 ventas/mes):**
- Ventas: 10 × $45.00 = $450.00
- Costos: 10 × $30.63 = $306.30
- Gross Profit: $143.70
- Comisiones (20%): $28.74
- **Net Profit:** $114.96 USD/mes
- **Menos Costo Fijo:** $17.00
- **Ganancia Neta Final:** $97.96 USD/mes

**Escenario Realista (30 ventas/mes):**
- **Ganancia Neta Final:** $414.10 USD/mes

**Escenario Optimista (100 ventas/mes):**
- **Ganancia Neta Final:** $1,430.00 USD/mes

---

## Resumen del Flujo Completo y Buenas Prácticas

### Resumen del Flujo Completo

1. ✅ **Admin crea usuario** → Ana recibe credenciales
2. ✅ **Ana hace login** → Accede al Dashboard
3. ✅ **Ana configura APIs** → GROQ, eBay, AliExpress, ScraperAPI
4. ✅ **Ana configura workflow** → Modo Manual, Capital $500
5. ✅ **Ana busca oportunidades** → Encuentra auriculares bluetooth
6. ✅ **Ana importa producto** → Crea producto PENDING
7. ✅ **Ana aprueba producto** → Estado APPROVED
8. ✅ **Ana publica en eBay** → Estado PUBLISHED, Listing ID obtenido
9. ✅ **Ana registra venta** → Venta $45.00 registrada
10. ✅ **Ana ve ganancias** → Net Profit $11.50, Comisión $2.87

### Buenas Prácticas

#### Configuración Inicial

1. **Empieza en Sandbox:**
   - Configura eBay Sandbox primero
   - Prueba publicaciones en Sandbox
   - Solo pasa a Production cuando estés seguro

2. **Configura APIs gradualmente:**
   - Empieza con GROQ (gratis y fácil)
   - Luego eBay Sandbox
   - Luego AliExpress
   - Agrega las demás según las necesites

3. **Capital de Trabajo Realista:**
   - No pongas más capital del que realmente tienes
   - Empieza con $500-$1,000 si eres principiante
   - Aumenta gradualmente según tu volumen

#### Búsqueda de Oportunidades

1. **Usa términos específicos:**
   - ❌ Mal: "productos"
   - ✅ Bien: "auriculares bluetooth cancelación ruido"

2. **Revisa métricas cuidadosamente:**
   - Margen mínimo recomendado: 30%
   - ROI mínimo recomendado: 50%
   - Confianza mínima recomendada: 70%

3. **Evita competencia alta:**
   - Si la competencia es "High", es difícil destacar
   - Prefiere "Low" o "Medium"

#### Gestión de Productos

1. **Revisa productos pendientes regularmente:**
   - Aproba productos con alta confianza rápidamente
   - Rechaza productos con baja confianza o márgenes bajos

2. **Optimiza títulos y descripciones:**
   - Usa la IA (GROQ) para generar contenido
   - Revisa y ajusta si es necesario
   - Incluye palabras clave relevantes

3. **Mantén precios competitivos:**
   - Revisa precios de competidores
   - Ajusta precios según sea necesario
   - No bajes demasiado (afecta márgenes)

#### Publicación

1. **Publica en múltiples marketplaces:**
   - eBay, Amazon, MercadoLibre (si tienes credenciales)
   - Aumenta tus oportunidades de venta

2. **Revisa resultados de publicación:**
   - Si hay errores, revisa credenciales
   - Si es parcial, publica en los marketplaces faltantes manualmente

3. **Monitorea listings:**
   - Verifica que los productos se vean correctamente
   - Actualiza precios si es necesario
   - Responde preguntas de clientes

#### Ventas

1. **Procesa ventas rápidamente:**
   - Compra en AliExpress inmediatamente después de recibir la venta
   - Actualiza el estado a PROCESSING

2. **Actualiza tracking:**
   - Cuando recibas tracking de AliExpress, actualízalo en el sistema
   - El cliente podrá rastrear su pedido

3. **Comunícate con clientes:**
   - Responde preguntas rápidamente
   - Informa sobre retrasos si los hay
   - Marca como DELIVERED cuando el cliente reciba

#### Finanzas

1. **Revisa balance semanalmente:**
   - Verifica que los cálculos sean correctos
   - Identifica productos más rentables

2. **Paga comisiones puntualmente:**
   - Las comisiones se calculan automáticamente
   - El admin las marca como pagadas cuando las recibe

3. **Reinvierte ganancias:**
   - Usa las ganancias para aumentar tu capital de trabajo
   - Escala productos exitosos
   - Prueba nuevos productos

### Limitaciones y "Próximamente"

**Lo que el sistema hace hoy:**
- ✅ Búsqueda de oportunidades en AliExpress
- ✅ Análisis con IA (si GROQ está configurado)
- ✅ Publicación en eBay, Amazon, MercadoLibre
- ✅ Cálculo automático de ganancias y comisiones
- ✅ Gestión de productos y ventas
- ✅ Autopilot básico y workflows personalizados
- ✅ Notificaciones en tiempo real

**Lo que está en beta o requiere configuración externa:**
- ⚠️ **Sincronización de precios:** Actualiza BD pero no siempre actualiza APIs de marketplaces (depende del marketplace)
- ⚠️ **Webhooks de ventas:** Requieren configuración externa en cada marketplace
- ⚠️ **Compra automática en AliExpress:** Requiere sesión activa y puede requerir intervención manual
- ⚠️ **Email notifications:** Requiere configuración SMTP (opcional)

**Lo que está "próximamente":**
- 🔜 Sincronización bidireccional completa de precios
- 🔜 Integración con más marketplaces
- 🔜 Dashboard financiero avanzado con más gráficas
- 🔜 Búsqueda IA avanzada completamente integrada

---

## Conclusión

Este manual te ha guiado paso a paso desde el primer acceso hasta obtener tu primera ganancia real. El sistema Ivan Reseller está diseñado para ser intuitivo pero poderoso, permitiéndote escalar tu negocio de dropshipping de manera eficiente.

**Recuerda:**
- Empieza en Sandbox para pruebas
- Configura APIs gradualmente
- Revisa métricas cuidadosamente
- Procesa ventas rápidamente
- Reinvierte ganancias para escalar

**Para soporte adicional:**
- Revisa el **Help Center** en el sistema
- Consulta las otras guías en `docs/`
- Contacta al administrador si tienes problemas

**¡Éxito en tu negocio de dropshipping!** 🚀

---

**Última actualización:** 2025-01-27  
**Versión del Sistema:** 1.0  
**URL:** www.ivanreseller.com

