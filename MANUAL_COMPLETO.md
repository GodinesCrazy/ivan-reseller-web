# 📘 MANUAL COMPLETO - IVAN RESELLER SYSTEM

**Sistema de Dropshipping con IA - Documentación Oficial Completa**

---

## 📋 ÍNDICE

1. [Instalación y Configuración Inicial](#instalación)
2. [Port Forwarding Automático](#port-forwarding)
3. [Guía para Administradores](#administradores)
4. [Guía para Usuarios](#usuarios)
5. [Solución de Problemas](#troubleshooting)
6. [Preguntas Frecuentes](#faq)
7. [Soporte Técnico](#soporte)

---

<a name="instalación"></a>
# 1️⃣ INSTALACIÓN Y CONFIGURACIÓN INICIAL

## 📥 Requisitos Previos

- ✅ **Windows 10/11** (64-bit)
- ✅ **Node.js 18+** - [Descargar aquí](https://nodejs.org/)
- ✅ **Conexión a Internet** estable
- ✅ **Permisos de Administrador**
- ✅ **4GB RAM mínimo** (8GB recomendado)
- ✅ **2GB espacio en disco**

---

## 🚀 Instalación en 3 Pasos

### Paso 1: Descargar el Sistema

```
1. Descarga la carpeta "Ivan_Reseller_Web"
2. Colócala en una ubicación permanente (ej: C:\Ivan_Reseller_Web)
3. NO la muevas después de configurarla
```

### Paso 2: Ejecutar el Instalador

```
1. Abre la carpeta "Ivan_Reseller_Web"
2. Busca el archivo: "iniciar-sistema.bat"
3. Click DERECHO sobre el archivo
4. Selecciona: "Ejecutar como administrador"
5. Espera 2-3 minutos (primera vez instala todo)
```

### Paso 3: Verificar Instalación

El sistema mostrará:
```
✅ SISTEMA INICIADO CORRECTAMENTE

URLs de acceso:
  LOCAL:    http://localhost:5173
  LAN:      http://192.168.X.X:5173
  INTERNET: http://XXX.XXX.XXX.XXX:5173

Abriendo navegador...
```

**Si ves esto, ¡LA INSTALACIÓN FUE EXITOSA!** 🎉

---

## 🌐 Archivo de URLs Generado

El sistema crea automáticamente: **`URLS_ACCESO.txt`**

**Contiene:**
- ✅ URL local (solo tu PC)
- ✅ URL LAN (tu red WiFi)
- ✅ URL Internet (compartir al mundo)
- ✅ Credenciales de admin
- ✅ Instrucciones de uso

**Ubicación:** Misma carpeta que `iniciar-sistema.bat`

---

<a name="port-forwarding"></a>
# 2️⃣ PORT FORWARDING (Acceso desde Internet)

## ⚠️ ¿Cuándo Necesitas Esto?

**SÍ necesitas Port Forwarding si:**
- ✅ Quieres que usuarios de otros países accedan
- ✅ Quieres acceder desde fuera de tu red WiFi
- ✅ Vas a compartir el link con clientes/colaboradores

**NO necesitas Port Forwarding si:**
- ❌ Solo lo usas en tu PC
- ❌ Solo lo usan personas en tu misma WiFi

---

## 🔧 Configuración Automática (Recomendada)

### Opción A: UPnP (Universal Plug and Play)

**Si tu router tiene UPnP habilitado, el sistema puede configurarse solo:**

1. **Habilita UPnP en tu Router:**
   ```
   1. Accede a tu router: http://192.168.1.1
   2. Usuario/Password: admin/admin (o ver etiqueta del router)
   3. Busca: "UPnP" o "Universal Plug and Play"
   4. Actívalo: ON/Enable
   5. Guarda cambios
   6. Reinicia router
   ```

2. **Ejecuta el Script de Configuración:**
   ```powershell
   # Abre PowerShell como Administrador y ejecuta:
   cd C:\Ivan_Reseller_Web
   .\scripts\configure-upnp.ps1
   ```

3. **Verifica que funcionó:**
   ```
   El script mostrará:
   ✅ Puerto 3000 configurado automáticamente
   ✅ Puerto 5173 configurado automáticamente
   ✅ Port Forwarding activo
   ```

---

## 🔨 Configuración Manual (Si UPnP no funciona)

### Paso 1: Obtener tu IP Local

**Ya la tienes en `URLS_ACCESO.txt`**, pero también puedes:

```cmd
1. Presiona: Windows + R
2. Escribe: cmd
3. Escribe: ipconfig
4. Busca: "Dirección IPv4"
5. Ejemplo: 192.168.4.43
```

### Paso 2: Acceder al Router

**Direcciones comunes:**
- http://192.168.1.1
- http://192.168.0.1
- http://192.168.100.1
- http://10.0.0.1

**Credenciales comunes:**
```
Usuario: admin | Password: admin
Usuario: admin | Password: password
Usuario: admin | Password: (vacío)
```

💡 **Si no sabes:** Mira la etiqueta en tu router físico

### Paso 3: Buscar "Port Forwarding"

**Nombres comunes del menú:**
- "Port Forwarding"
- "NAT Forwarding"
- "Virtual Server"
- "Redirección de Puertos"
- "Servidor Virtual"

### Paso 4: Crear las Reglas

**Regla 1: Frontend**
```
Nombre/Servicio:     Ivan Reseller Frontend
Puerto Externo:      5173
Puerto Interno:      5173
IP Interna:          [Tu IP Local del Paso 1]
Protocolo:           TCP (o TCP/UDP)
Estado:              Habilitado/Enabled
```

**Regla 2: Backend**
```
Nombre/Servicio:     Ivan Reseller Backend
Puerto Externo:      3000
Puerto Interno:      3000
IP Interna:          [Tu IP Local del Paso 1]
Protocolo:           TCP (o TCP/UDP)
Estado:              Habilitado/Enabled
```

### Paso 5: Guardar y Reiniciar

```
1. Click en "Guardar" o "Apply"
2. Espera 30 segundos
3. Si el router lo pide, reinícialo
4. Espera 2 minutos a que reinicie
```

---

## ✅ Verificar Port Forwarding

### Método 1: Herramienta Online

```
1. Ve a: https://www.yougetsignal.com/tools/open-ports/
2. Ingresa tu IP Pública (ver URLS_ACCESO.txt)
3. Ingresa puerto: 5173
4. Click: "Check"
5. Debe decir: "Port 5173 is OPEN"
6. Repite con puerto: 3000
```

### Método 2: Desde otro dispositivo

```
1. Desconéctate de tu WiFi (usa datos móviles)
2. Abre navegador
3. Ve a: http://[TU_IP_PUBLICA]:5173
4. Si carga el login, ¡FUNCIONA! ✅
```

---

## 🔒 Seguridad del Port Forwarding

**Riesgos:**
- ⚠️ Expones tu red local a Internet
- ⚠️ Pueden intentar ataques si no tienes seguridad

**Protecciones Implementadas:**
- ✅ Sistema requiere login (autenticación)
- ✅ Tokens JWT encriptados
- ✅ CORS configurado (solo orígenes permitidos)
- ✅ Rate limiting (previene fuerza bruta)
- ✅ Logs de acceso

**Recomendaciones Adicionales:**
1. **Cambia contraseña de admin** inmediatamente
2. **Usa contraseñas fuertes** (12+ caracteres)
3. **Revisa logs** regularmente en: Menu → System Logs
4. **Cierra Port Forwarding** cuando no lo uses
5. **Considera VPN** para acceso personal

---

## 🌐 Alternativas al Port Forwarding

### Opción 1: Cloudflare Tunnel (Gratis, Seguro)

**Ventajas:**
- ✅ No necesitas Port Forwarding
- ✅ Tu IP pública queda oculta
- ✅ HTTPS gratis
- ✅ Protección DDoS

**Configuración:**
```bash
# 1. Instala Cloudflare Tunnel
# Descarga: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

# 2. Autentica
cloudflared tunnel login

# 3. Crea tunnel
cloudflared tunnel create ivan-reseller

# 4. Configura
cloudflared tunnel route dns ivan-reseller ivanreseller.tudominio.com

# 5. Inicia
cloudflared tunnel run ivan-reseller
```

### Opción 2: ngrok (Rápido, Temporal)

**Para pruebas rápidas:**
```bash
# 1. Descarga: https://ngrok.com/download
# 2. Ejecuta:
ngrok http 5173

# Te da un link tipo: https://abc123.ngrok.io
```

### Opción 3: Servicio DynDNS

**Si tu IP pública cambia constantemente:**
```
1. Registra cuenta en: https://www.noip.com/ (gratis)
2. Crea hostname: ivanreseller.ddns.net
3. Instala su cliente: mantiene IP actualizada
4. Usa: http://ivanreseller.ddns.net:5173
```

---

<a name="administradores"></a>
# 3️⃣ GUÍA PARA ADMINISTRADORES

## 👑 Acceso Inicial

**Credenciales por defecto:**
```
URL:      http://localhost:5173
Email:    admin@ivanreseller.com
Password: admin123
```

⚠️ **IMPORTANTE:** Cambia esta contraseña inmediatamente

---

## 🛠️ Primer Uso - Checklist

### ✅ Paso 1: Cambiar Contraseña

```
1. Login con credenciales por defecto
2. Ve a: Menu → Settings → Profile
3. Click: "Cambiar Contraseña"
4. Usa contraseña segura (12+ caracteres)
5. Guarda en un lugar seguro
```

### ✅ Paso 2: Configurar APIs Maestras (Opcional)

**Si quieres ofrecer APIs compartidas a usuarios:**

```
1. Ve a: Menu → Settings → API Keys
2. Configura:
   - AliExpress API Key/Secret
   - eBay App ID/Cert ID
   - Amazon Access/Secret Key
3. Click: "Guardar"
4. Marca: "Permitir uso compartido" (opcional)
```

💡 **Nota:** Usuarios también pueden usar sus propias APIs

### ✅ Paso 3: Configurar Sistema

```
1. Ve a: Menu → Settings → System
2. Ajusta:
   - Moneda por defecto (USD, EUR, etc.)
   - Idioma (Español, English)
   - Zona horaria
   - Tasa de comisión global
3. Guarda cambios
```

---

## 👥 Gestión de Usuarios

### Crear Nuevo Usuario

```
1. Menu → Users → "Nuevo Usuario"
2. Completa:
   - Nombre completo
   - Email (será su username)
   - Contraseña inicial
   - Rol: USER o ADMIN
   - Tasa de comisión: 0.00 a 1.00 (ej: 0.10 = 10%)
3. Click: "Crear"
4. Envía credenciales al usuario por email/WhatsApp
```

### Roles Disponibles

**ADMIN:**
- ✅ Acceso total al sistema
- ✅ Crear/editar/eliminar usuarios
- ✅ Ver todos los reportes
- ✅ Configurar sistema
- ✅ Ver logs

**USER:**
- ✅ Buscar oportunidades
- ✅ Gestionar sus productos
- ✅ Ver sus comisiones
- ✅ Configurar sus APIs
- ❌ No puede crear usuarios
- ❌ No ve datos de otros usuarios

### Editar Usuario

```
1. Menu → Users
2. Busca el usuario
3. Click en el ícono de lápiz (editar)
4. Modifica datos
5. Guarda cambios
```

### Desactivar Usuario

```
1. Menu → Users
2. Busca el usuario
3. Click en toggle "Activo/Inactivo"
4. Confirma acción
```

💡 **Nota:** Usuario desactivado no puede hacer login pero sus datos persisten

### Eliminar Usuario

```
1. Menu → Users
2. Busca el usuario
3. Click en ícono de basura (eliminar)
4. Confirma: "¿Estás seguro?"
5. Se eliminan: usuario, productos, comisiones
```

⚠️ **PRECAUCIÓN:** Esta acción es IRREVERSIBLE

---

## 💰 Gestión de Comisiones

### Ver Comisiones Globales

```
1. Menu → Commissions
2. Verás:
   - Comisiones pendientes (todos los usuarios)
   - Comisiones pagadas
   - Comisiones programadas
   - Total adeudado
3. Filtra por:
   - Usuario
   - Estado (Pending, Paid, Cancelled)
   - Fecha
```

### Aprobar Pagos

```
1. Menu → Commissions → Pending
2. Selecciona comisiones a pagar
3. Click: "Marcar como Pagado"
4. Confirma acción
5. Se actualiza balance del usuario
```

### Configurar Tasa de Comisión Individual

```
1. Menu → Users
2. Edita usuario
3. Campo: "Commission Rate"
4. Ingresa: 0.10 (10%), 0.15 (15%), etc.
5. Guarda
```

💡 **Ejemplo:**
```
Venta: $100
Costo: $60
Ganancia bruta: $40
Comisión admin (20%): $8  // ✅ D10: Corregido según cálculo real del sistema
Ganancia neta usuario: $32  // ✅ $40 - $8 = $32
```

---

## 📊 Reportes y Análisis

### Dashboard Administrativo

```
1. Menu → Dashboard
2. Verás KPIs:
   - Total ventas (todos los usuarios)
   - Comisiones generadas
   - Usuarios activos
   - Productos publicados
   - Oportunidades encontradas
3. Gráficas:
   - Ventas por día/semana/mes
   - Top usuarios
   - Top productos
   - Márgenes promedio
```

### Reportes Detallados

```
1. Menu → Reports
2. Selecciona tipo:
   - Reporte de Ventas
   - Reporte de Comisiones
   - Reporte de Usuarios
   - Reporte de Performance
3. Filtra por:
   - Rango de fechas
   - Usuario específico
   - Marketplace
4. Click: "Generar Reporte"
5. Exporta: PDF o Excel
```

### Logs del Sistema

```
1. Menu → System Logs
2. Verás:
   - Accesos al sistema (logins)
   - Acciones de usuarios
   - Errores del sistema
   - Cambios de configuración
3. Filtra por:
   - Tipo de evento
   - Usuario
   - Fecha/hora
4. Busca anomalías o errores
```

---

## ⚙️ Configuración Avanzada

### Regional Config

```
1. Menu → Settings → Regional Config
2. Configura:
   - País por defecto
   - Moneda
   - Formato de fecha
   - Formato de números
   - Impuestos aplicables
3. Guarda cambios
```

### Automatización Global

```
1. Menu → Autopilot → Global Settings
2. Configura límites:
   - Máximo búsquedas/día por usuario
   - Margen mínimo aceptable
   - Categorías permitidas
   - Presupuesto máximo por compra
3. Activa/desactiva features:
   - Auto-posting (publicación automática)
   - Auto-ordering (compra automática)
   - Notificaciones
4. Guarda
```

---

## 🔧 Mantenimiento del Sistema

### Iniciar el Sistema

```
1. Doble click en: iniciar-sistema.bat
2. Espera mensaje: "SISTEMA INICIADO CORRECTAMENTE"
3. NO cierres la ventana del script
4. Mantén PC encendida mientras usuarios trabajen
```

### Detener el Sistema

```
1. En la ventana del script, presiona cualquier tecla
2. O simplemente cierra la ventana
3. Esto detiene backend y frontend
4. Usuarios perderán acceso inmediatamente
```

### Reiniciar el Sistema

```
1. Cierra el script actual
2. Espera 10 segundos
3. Vuelve a ejecutar: iniciar-sistema.bat
4. Espera mensaje de confirmación
```

### Actualizar el Sistema

```
1. Detén el sistema
2. Reemplaza archivos nuevos
3. Ejecuta: iniciar-sistema.bat
4. El script actualiza dependencias automáticamente
```

### Backup de Datos

```
1. Detén el sistema
2. Copia toda la carpeta: C:\Ivan_Reseller_Web\backend\database
3. Guarda en lugar seguro (Dropbox, USB, etc.)
4. Frecuencia recomendada: Semanal
```

**Restaurar Backup:**
```
1. Detén el sistema
2. Reemplaza carpeta database con el backup
3. Inicia el sistema
```

---

<a name="usuarios"></a>
# 4️⃣ GUÍA PARA USUARIOS

## 🚀 Acceso al Sistema

### Obtener Credenciales

**El administrador te enviará:**
1. Link de acceso (ej: http://201.186.232.242:5173)
2. Email para login
3. Contraseña inicial

### Primer Acceso

```
1. Abre el link en tu navegador
2. Verás pantalla de login
3. Ingresa email y contraseña
4. Click: "Iniciar Sesión"
5. ¡Listo! Estás dentro
```

### Cambiar Contraseña

```
1. Menu → Settings → Profile
2. Campo: "Nueva Contraseña"
3. Ingresa contraseña segura
4. Confirma contraseña
5. Click: "Guardar"
```

---

## 🔑 Configurar tus APIs (OBLIGATORIO)

**⚠️ Sin APIs configuradas, el sistema NO funcionará para ti**

### ¿Qué necesitas?

**Cuentas de desarrollador en:**
- 🛒 AliExpress - https://portals.aliexpress.com/
- 🏪 eBay - https://developer.ebay.com/
- 📦 Amazon - https://developer.amazonservices.com/

### Paso 1: Obtener APIs de AliExpress

```
1. Regístrate en: https://portals.aliexpress.com/
2. Ve a: "My Apps" → "Create App"
3. Completa formulario
4. Espera aprobación (1-3 días)
5. Una vez aprobado:
   - Copia: App Key
   - Copia: App Secret
6. Guárdalos en lugar seguro
```

### Paso 2: Obtener APIs de eBay

```
1. Regístrate en: https://developer.ebay.com/
2. Ve a: "My Account" → "Application Keys"
3. Click: "Create a keyset"
4. Selecciona: "Production" (o Sandbox para pruebas)
5. Copia:
   - App ID (Client ID)
   - Cert ID (Client Secret)
6. Guárdalos
```

### Paso 3: Obtener APIs de Amazon

```
1. Regístrate en: https://developer.amazonservices.com/
2. Ve a: "App Management"
3. Click: "Create new app"
4. Completa formulario
5. Copia:
   - Access Key ID
   - Secret Access Key
6. Guárdalos
```

### Paso 4: Configurar en Ivan Reseller

```
1. Login en el sistema
2. Menu → Settings → API Keys
3. Ingresa tus credenciales:
   
   [AliExpress]
   API Key: [Pega tu App Key]
   Secret Key: [Pega tu App Secret]
   
   [eBay]
   App ID: [Pega tu App ID]
   Cert ID: [Pega tu Cert ID]
   
   [Amazon]
   Access Key: [Pega tu Access Key ID]
   Secret Key: [Pega tu Secret Access Key]

4. Click: "Guardar"
5. Verás: "✅ APIs configuradas correctamente"
```

---

## 🔍 Buscar Oportunidades

### Búsqueda Manual

```
1. Menu → Opportunities
2. Campo de búsqueda: Ingresa producto (ej: "wireless headphones")
3. Filtros (opcional):
   - Margen mínimo: 30%
   - Precio máximo: $50
   - Categoría: Electronics
   - Rating mínimo: 4.5 estrellas
4. Click: "Buscar"
5. Espera 10-30 segundos
```

**El sistema mostrará:**
- ✅ Productos encontrados en AliExpress
- 💰 Precio de costo
- 📊 Precio sugerido de venta
- 💵 Margen de ganancia
- ⭐ Rating y reviews
- 🔥 Nivel de competencia
- 📈 Tendencia de demanda

### Analizar Oportunidad

```
1. Click en un producto
2. Verás detalles:
   - Imágenes del producto
   - Descripción completa
   - Especificaciones
   - Precios en diferentes marketplaces
   - Análisis de competencia
   - Proyección de ganancias
3. Decide si publicar
```

### Publicar Producto

```
1. Desde detalle de oportunidad
2. Click: "Publicar en Marketplace"
3. Selecciona destino:
   - eBay
   - Amazon
   - Ambos
4. Revisa/edita:
   - Título
   - Descripción
   - Precio
   - Imágenes
5. Click: "Publicar"
6. Espera confirmación
```

---

## 🤖 Modo Autopilot (Automatización)

### Activar Autopilot

```
1. Menu → Autopilot
2. Click: "Configurar Autopilot"
3. Establece parámetros:
   
   [Búsqueda Automática]
   - Frecuencia: Cada 6 horas
   - Categorías: Electronics, Home, Fashion
   - Margen mínimo: 35%
   - Presupuesto diario: $500
   
   [Publicación Automática]
   - Auto-publicar: Activado
   - Marketplaces: eBay, Amazon
   - Revisar antes: Desactivado
   
   [Gestión de Pedidos]
   - Compra automática: Activado
   - Notificar en: Email, WhatsApp
   
4. Click: "Activar Autopilot"
5. Sistema trabaja solo
```

**Autopilot hará:**
- 🔍 Busca oportunidades cada X horas
- 📋 Publica productos rentables
- 🛒 Compra automáticamente cuando hay venta
- 📦 Actualiza tracking
- 💰 Calcula comisiones

### Monitorear Autopilot

```
1. Menu → Autopilot → Activity
2. Verás:
   - Búsquedas realizadas
   - Productos publicados
   - Ventas gestionadas
   - Errores (si hay)
3. Puedes pausar/reactivar en cualquier momento
```

---

## 💰 Ver tus Ganancias

### Dashboard Personal

```
1. Menu → Dashboard
2. Verás:
   - Balance actual
   - Comisiones pendientes
   - Comisiones pagadas
   - Total ganado (histórico)
   - Gráficas de performance
```

### Sugerencias IA - Cómo Funciona

**¿Qué son las Sugerencias IA?**

El sistema analiza automáticamente tus datos y genera recomendaciones inteligentes para ayudarte a tomar mejores decisiones de negocio.

**¿Cómo la IA obtiene y evalúa las sugerencias?**

#### 1. Fuentes de Datos

La IA analiza:

- **Oportunidades recientes (últimos 14-30 días):**
  - Qué productos has buscado
  - Títulos de productos encontrados
  - Márgenes, ROI y confianza de cada oportunidad
  - Marketplaces donde se encontraron

- **Operaciones exitosas (últimos 90 días):**
  - Productos que vendiste exitosamente
  - Ganancia real obtenida
  - ROI real alcanzado
  - Marketplace donde se vendió

- **Datos de tu negocio:**
  - Productos importados y publicados
  - Ventas totales y ganancias
  - Categorías más rentables
  - Tendencias de mercado

#### 2. Proceso de Análisis

**Paso 1: Extracción de Keywords**
- La IA lee los títulos de productos que has buscado
- Extrae palabras clave importantes (ej: "wireless", "earbuds", "bluetooth")
- Genera frases de 1-3 palabras (ej: "wireless earbuds", "bluetooth headphones")
- Filtra palabras comunes sin valor (stop words)

**Paso 2: Agrupación y Análisis**
- Agrupa oportunidades por keyword o segmento
- Calcula métricas promedio: margen, ROI, confianza
- Detecta tendencias temporales (creciente/estable/decreciente)
- Analiza distribución por marketplace

**Paso 3: Cálculo de Score**
- **Para keywords:** `score = (cantidad × 0.3) + (margen × 0.3) + (ROI × 0.2) + (tendencia × 0.2)`
- **Para segmentos:** `score = (margen × 120) + ROI + (confianza × 80) + bonus`
- Ordena por score descendente (mejores primero)

**Paso 4: Priorización**
- **High:** Margen ≥40% Y ROI ≥50% (y tendencia creciente para keywords)
- **Medium:** Margen 30-40% O ROI 40-50%
- **Low:** Margen <20% O ROI <30%

#### 3. Tipos de Sugerencias Generadas

**🔍 Búsqueda de Oportunidades (SEARCH):**
- **Qué hace:** Te sugiere keywords concretas para buscar
- **Ejemplo:** "wireless earbuds" - porque detectó 15 oportunidades con margen 42% y ROI 55%
- **Cómo usarla:** Click en "Buscar oportunidades" → Se abre Oportunidades con keyword precargada

**📦 Expansión de Catálogo (INVENTORY):**
- **Qué hace:** Te sugiere expandir en segmentos rentables
- **Ejemplo:** "Expandir catálogo en Gaming & Esports" - porque detectó 25 oportunidades con margen 45%
- **Cómo usarla:** Sigue los pasos indicados en la sugerencia

**💰 Optimización de Precios (PRICING):**
- **Qué hace:** Te sugiere ajustar precios de productos existentes
- **Ejemplo:** "Optimizar pricing para 'Smart Watch'" - porque tiene margen 45% y ROI 65%
- **Cómo usarla:** Ve a Products → Editar → Ajusta precio según sugerencia

**🤖 Automatización (AUTOMATION):**
- **Qué hace:** Te sugiere automatizar relanzamiento de productos exitosos
- **Ejemplo:** "Automatizar relanzamiento de 'Wireless Earbuds'" - porque completó con ROI 75%
- **Cómo usarla:** Ve a Autopilot → Crea regla según pasos indicados

**📢 Campañas Promocionales (MARKETING):**
- **Qué hace:** Te sugiere impulsar visibilidad en marketplaces con demanda creciente
- **Ejemplo:** "Impulsar visibilidad en mercadolibre" - porque incrementó demanda 28.5%
- **Cómo usarla:** Crea campaña promocional en el marketplace indicado

**⚙️ Optimización General (OPTIMIZATION):**
- **Qué hace:** Te sugiere actualizar estrategia con señales recientes
- **Ejemplo:** Resumen de segmentos destacados y tendencias detectadas
- **Cómo usarla:** Revisa el resumen y ajusta tu estrategia

**📝 Optimización de Listados (LISTING):**
- **Qué hace:** Te sugiere mejorar títulos y descripciones para SEO
- **Ejemplo:** Solo aparece si tienes pocas ventas (<20)
- **Cómo usarla:** Mejora títulos y descripciones según sugerencia

#### 4. Cómo Usar las Sugerencias IA

**Acceder:**
```
1. Menu → Dashboard
2. Pestaña "Sugerencias IA"
```

**Generar nuevas:**
```
1. Click en "Nueva sugerencia"
2. Espera unos segundos
3. Verás nuevas recomendaciones
```

**Usar sugerencias de keywords:**
```
1. Revisa la tarjeta de keyword
2. Lee la razón y métricas
3. Click en "Buscar oportunidades con esta keyword"
4. Se abre Oportunidades con keyword precargada
5. La búsqueda se ejecuta automáticamente
6. Revisa resultados e importa productos
```

**Filtrar sugerencias:**
```
- Usa los filtros: Todas, Búsquedas, Pricing, Inventory, etc.
```

**Ver detalles:**
```
1. Click en "Ver detalles" en cualquier tarjeta
2. Verás requerimientos y pasos a seguir
```

**Métricas mostradas:**
- **Sugerencias activas:** Cantidad de sugerencias no implementadas
- **Impacto potencial:** Suma estimada de ganancias (formateado: $X.XXM, $X.XXK, $X,XXX)
- **Tiempo ahorrado:** Horas estimadas que ahorrarías
- **Automatizaciones:** Reglas de automatización activas

#### 5. Ejemplo Completo

**Situación:** Ana ha buscado varios productos relacionados con audio en las últimas 2 semanas.

**Lo que la IA detecta:**
- 15 oportunidades con keyword "wireless earbuds"
- Margen promedio: 42%
- ROI promedio: 55%
- Tendencia: +35% más oportunidades que período anterior
- Marketplaces: eBay (10), Amazon (5)

**Cálculo de score:**
```
score = (15 × 0.3) + (42 × 0.3) + (55 × 0.2) + (35 × 0.2)
     = 4.5 + 12.6 + 11 + 7
     = 35.1 (alto score)
```

**Priorización:**
- Margen 42% ≥ 40% ✅
- ROI 55% ≥ 50% ✅
- Tendencia creciente ✅
- **Priority: HIGH**

**Sugerencia generada:**
```
🔍 Buscar oportunidades: "wireless earbuds"
Razón: Tendencia creciente: 35% más oportunidades. Alto margen promedio: 42%. ROI atractivo: 55%.
Marketplaces: eBay, Amazon
Oportunidades estimadas: 15
Confianza: 85%
Impacto estimado: $180
```

**Ana usa la sugerencia:**
1. Click en "Buscar oportunidades con esta keyword"
2. Se abre Oportunidades con "wireless earbuds" precargado
3. Búsqueda automática ejecutada
4. Ve 12 resultados con márgenes 35-50%
5. Importa 3 productos con mejor margen
6. Los publica en eBay y Amazon

**Resultado:** Ana encuentra productos rentables más rápido usando la sugerencia de la IA.

#### 6. Notas Importantes

- **Las sugerencias mejoran con el tiempo:** Cuanto más uses el sistema, más datos tiene la IA
- **Si no hay suficientes datos:** Verás sugerencias genéricas basadas en categorías populares
- **El "Impacto potencial" es una estimación:** No es una garantía, es una proyección conservadora
- **Las sugerencias se actualizan automáticamente:** Cada vez que generas nuevas, se recalculan
- **No todas las sugerencias son iguales:** Prioriza las marcadas como "High" primero

### Detalle de Comisiones

```
1. Menu → Commissions
2. Tabla con:
   - Fecha
   - Venta asociada
   - Monto
   - Estado (Pending, Paid)
3. Filtra por periodo
4. Exporta a Excel si necesitas
```

### Solicitar Pago

```
1. Menu → Commissions
2. Verás: "Balance disponible: $XXX"
3. Click: "Solicitar Pago"
4. Ingresa:
   - Método: PayPal, Banco, etc.
   - Datos de cuenta
5. Click: "Enviar Solicitud"
6. Admin aprobará pago
```

---

## 📦 Gestión de Productos

### Ver tus Productos

```
1. Menu → Products
2. Lista de todos tus productos:
   - En venta
   - Vendidos
   - Pausados
3. Filtra por marketplace
```

### Editar Producto

```
1. Menu → Products
2. Click en producto
3. Edita: precio, descripción, stock
4. Click: "Guardar"
```

### Pausar/Reactivar Producto

```
1. Menu → Products
2. Toggle: "Activo/Pausado"
3. Producto pausado no aparece en marketplace
```

---

## 📱 Notificaciones

### Configurar Notificaciones

```
1. Menu → Settings → Notifications
2. Activa/desactiva:
   - Nueva oportunidad encontrada
   - Venta realizada
   - Pago aprobado
   - Error en sistema
3. Elige método:
   - Email
   - Push (navegador)
   - WhatsApp (si integrado)
4. Guarda
```

---

## 🔒 Seguridad de tu Cuenta

### Buenas Prácticas

- ✅ Usa contraseña única (no la reutilices)
- ✅ Contraseña de 12+ caracteres
- ✅ Combina letras, números, símbolos
- ✅ Cambia contraseña cada 3 meses
- ✅ No compartas tus credenciales
- ✅ Cierra sesión en PCs públicas
- ✅ Revisa actividad regularmente

### Cerrar Sesión

```
1. Icono de usuario (esquina superior derecha)
2. Click: "Cerrar Sesión"
3. Serás redirigido al login
```

**Nota:** Sesión se cierra automáticamente al cerrar navegador

---

<a name="troubleshooting"></a>
# 5️⃣ SOLUCIÓN DE PROBLEMAS

## ⚠️ Limitaciones Conocidas

> **✅ D9: Sección de limitaciones conocidas agregada al manual**

Esta sección documenta limitaciones y funcionalidades parcialmente implementadas del sistema. Estas limitaciones no impiden el uso normal del sistema, pero es importante conocerlas para evitar confusiones.

### 📋 Limitaciones Generales

**1. Registro Público Deshabilitado**
- ❌ El registro público de usuarios está **deshabilitado** por diseño
- ✅ Solo los administradores pueden crear nuevos usuarios
- ✅ **Solución:** Contacta al administrador para crear tu cuenta

**2. Amazon SP-API - Implementación Parcial**
- ⚠️ Amazon SP-API está implementado al **70%**
- ✅ Funcionalidades básicas funcionan
- ⚠️ Algunas funcionalidades avanzadas pueden no estar disponibles
- ✅ **Workaround:** Usar eBay o MercadoLibre para operaciones completas

**3. Generación de Reportes PDF**
- ⚠️ La generación de reportes en formato **PDF es un placeholder**
- ✅ Exportación a Excel (`.xlsx`) funciona correctamente
- ✅ Exportación a JSON funciona correctamente
- ✅ Exportación a HTML funciona correctamente
- ⚠️ **PDF:** Actualmente solo genera HTML, no PDF real
- ✅ **Solución:** Usar Excel para reportes detallados

**4. Autopilot Workflows**
- ⚠️ El sistema de **workflows del Autopilot** tiene placeholders
- ✅ El Autopilot básico funciona correctamente
- ✅ Búsqueda automática y publicación funcionan
- ⚠️ Workflows avanzados (endpoints `/api/autopilot/workflows`) están en desarrollo
- ✅ **Solución:** Usar configuración básica del Autopilot que está completamente funcional

**5. Programación de Reportes**
- ⚠️ La **programación automática de reportes** está marcada como TODO
- ✅ Generación manual de reportes funciona correctamente
- ✅ Exportación de reportes funciona correctamente
- ⚠️ **Programación:** No se puede programar reportes automáticos aún
- ✅ **Solución:** Generar reportes manualmente cuando necesites

**6. Historial de Reportes**
- ⚠️ El **historial de reportes generados** tiene placeholder
- ✅ Generación de reportes funciona correctamente
- ⚠️ No se guarda historial de reportes previos en base de datos
- ✅ **Solución:** Guarda manualmente los reportes exportados

**7. Socket.io Notificaciones**
- ✅ Sistema de notificaciones en tiempo real **implementado y funcionando**
- ✅ Notificaciones por email funcionan
- ✅ Notificaciones por SMS funcionan
- ✅ Notificaciones por Slack/Discord funcionan
- ⚠️ **Nota:** Si las notificaciones no funcionan, verifica configuración de credenciales

### 🔧 Limitaciones Técnicas

**1. Código con `@ts-nocheck`**
- ⚠️ Algunos archivos tienen `@ts-nocheck` (13 archivos identificados)
- ✅ Esto no afecta la funcionalidad
- ⚠️ **Impacto:** Puede haber menos validación de tipos TypeScript
- ✅ **Estado:** Mejora gradual programada

**2. Endpoints Deprecados**
- ⚠️ Algunos endpoints antiguos están deprecados pero aún disponibles
- ✅ `/api/settings/apis/:apiId` retorna HTTP 410 con mensaje de migración
- ✅ **Nuevo endpoint:** `/api/credentials` (usar este)
- ✅ **Estado:** Retrocompatibilidad mantenida durante migración

**3. Archivos Legacy**
- ⚠️ Algunos archivos antiguos existen pero no se usan:
  - `backend/src/routes/settings.routes.old.ts` (deprecado)
- ✅ No afectan el funcionamiento del sistema
- ✅ **Estado:** Se eliminarán en versión futura

### 📊 Limitaciones de APIs

**1. Límites de Rate Limiting**
- ✅ Rate limiting está configurado para proteger las APIs
- ⚠️ Si excedes los límites, las peticiones se rechazan temporalmente
- ✅ **Solución:** Espera unos minutos o contacta al administrador

**2. APIs Requieren Credenciales Propias**
- ✅ Cada usuario debe configurar sus propias credenciales de marketplace
- ⚠️ No hay credenciales compartidas para eBay, Amazon, MercadoLibre
- ✅ **Razón:** Políticas de los marketplaces requieren credenciales individuales
- ✅ **Solución:** Cada usuario configura sus propias APIs en Settings

### 🎯 Workarounds y Soluciones

**Para limitaciones críticas:**
1. ✅ **Registro:** Contacta al administrador
2. ✅ **Amazon:** Usa eBay o MercadoLibre como alternativa
3. ✅ **PDF:** Usa Excel para reportes detallados
4. ✅ **Workflows:** Usa configuración básica del Autopilot
5. ✅ **Reportes programados:** Genera reportes manualmente

**Para limitaciones técnicas:**
1. ✅ **Endpoints deprecados:** Usa nuevos endpoints (`/api/credentials`)
2. ✅ **Rate limiting:** Respeta los límites o espera
3. ✅ **APIs:** Configura tus propias credenciales

---

## 🚨 Errores Comunes

### "No puedo conectarme al sistema"

**Síntomas:**
- Navegador dice "No se puede acceder"
- Página no carga

**Soluciones:**
```
1. Verifica que el sistema esté corriendo:
   - Admin debe tener "iniciar-sistema.bat" abierto
   
2. Verifica tu internet:
   - Abre: https://google.com
   - Si no carga, problema es tu internet
   
3. Verifica el link:
   - Copia exactamente el link del admin
   - Incluye el puerto (:5173)
   
4. Prueba en modo incógnito:
   - Ctrl + Shift + N (Chrome)
   - Ctrl + Shift + P (Firefox)
   
5. Limpia caché:
   - Ctrl + Shift + Delete
   - Selecciona: Caché e imágenes
   - Click: Eliminar
```

---

### "Usuario o contraseña incorrectos"

**Síntomas:**
- Login rechazado
- Mensaje de error en pantalla

**Soluciones:**
```
1. Verifica mayúsculas/minúsculas
   - Contraseñas son case-sensitive
   
2. Copia/pega credenciales
   - Evita escribir manualmente
   
3. Verifica espacios extras
   - Antes o después del email
   
4. Contacta al admin
   - Puede resetear tu contraseña
```

---

### "No encuentro productos / Búsqueda sin resultados"

**Síntomas:**
- Búsqueda devuelve 0 resultados
- Error al buscar

**Causas y soluciones:**

**Causa 1: APIs no configuradas**
```
Solución:
1. Menu → Settings → API Keys
2. Verifica que estén todas llenas
3. Prueba copiar/pegar de nuevo
4. Guarda y reintenta búsqueda
```

**Causa 2: APIs incorrectas o inválidas**
```
Solución:
1. Ve a tu portal de desarrollador
2. Genera nuevas credenciales
3. Actualiza en el sistema
4. Guarda y reintenta
```

**Causa 3: Límites de API agotados**
```
Solución:
1. Revisa cuotas en portales:
   - AliExpress: https://portals.aliexpress.com/
   - eBay: https://developer.ebay.com/
2. Espera reset (generalmente diario)
3. O upgrade tu plan de API
```

**Causa 4: Término de búsqueda muy específico**
```
Solución:
1. Usa términos más generales
   - ❌ "iPhone 15 Pro Max 256GB Blue"
   - ✅ "iPhone 15"
2. Prueba en inglés
   - AliExpress responde mejor a inglés
```

---

### "El sistema va lento"

**Síntomas:**
- Páginas tardan en cargar
- Búsquedas muy lentas

**Soluciones:**

**Si eres admin (sistema en tu PC):**
```
1. Verifica recursos del sistema:
   - Ctrl + Shift + Esc (Administrador de Tareas)
   - Verifica: CPU < 80%, RAM < 90%
   - Cierra programas pesados
   
2. Reinicia el sistema:
   - Cierra iniciar-sistema.bat
   - Espera 10 segundos
   - Vuelve a ejecutar
   
3. Reinicia tu PC:
   - A veces ayuda limpiar memoria
```

**Si eres usuario remoto:**
```
1. Verifica tu internet:
   - Haz speed test: https://fast.com/
   - Necesitas: 5+ Mbps
   
2. Verifica distancia al servidor:
   - Servers lejos = más lento
   - Es normal cierta latencia
   
3. Cierra tabs/programas:
   - Libera recursos de tu PC
   
4. Prueba en otro navegador:
   - Chrome suele ser más rápido
```

---

### "Error al publicar producto"

**Síntomas:**
- Error al intentar publicar en marketplace
- Mensaje: "No se pudo publicar"

**Causas y soluciones:**

**Causa 1: APIs de marketplace no configuradas**
```
Solución:
1. Menu → Settings → API Keys
2. Verifica APIs de eBay/Amazon
3. Configura si falta
```

**Causa 2: Cuenta de marketplace suspendida**
```
Solución:
1. Verifica tu cuenta en eBay/Amazon
2. Revisa emails de ellos
3. Resuelve issues pendientes
```

**Causa 3: Producto viola políticas**
```
Solución:
1. Revisa políticas del marketplace
2. Edita título/descripción
3. Quita palabras prohibidas
4. Reintenta
```

---

### "Autopilot no está funcionando"

**Síntomas:**
- No hay actividad automática
- No se publican productos

**Soluciones:**
```
1. Verifica que esté activado:
   - Menu → Autopilot
   - Toggle debe estar: ON
   
2. Verifica configuración:
   - Frecuencia establecida correctamente
   - Presupuesto no agotado
   - APIs configuradas
   
3. Revisa logs:
   - Menu → Autopilot → Activity
   - Busca errores en rojo
   - Resuelve según error
   
4. Reinicia Autopilot:
   - Desactiva
   - Espera 1 minuto
   - Vuelve a activar
```

---

### "Balance/Comisiones incorrectos"

**Síntomas:**
- Números no cuadran
- Faltan comisiones

**Soluciones:**
```
1. Verifica periodo:
   - Filtra por fecha correcta
   - Comisiones pueden estar en otro mes
   
2. Verifica estado:
   - Pending = pendiente de pago
   - Paid = ya pagado
   - Cancelled = venta cancelada (no cuenta)
   
3. Exporta reporte:
   - Menu → Commissions → Export
   - Revisa Excel detalladamente
   
4. Contacta admin:
   - Con capturas de pantalla
   - Con fechas específicas
```

---

## 🔄 Problemas de Port Forwarding

### "Funciona local pero no desde internet"

**Diagnóstico:**
```
1. Verifica port forwarding:
   - Entra a tu router
   - Revisa reglas creadas
   - Verifica IP interna correcta
   
2. Verifica firewall del router:
   - Debe permitir puertos 3000 y 5173
   
3. Verifica IP pública:
   - Ve a: https://www.whatismyip.com/
   - Compara con la de URLS_ACCESO.txt
   - Si cambió, actualiza port forwarding
   
4. Test online:
   - https://www.yougetsignal.com/tools/open-ports/
   - Prueba puerto 5173
   - Debe decir: "OPEN"
```

**Soluciones:**
```
Si puerto muestra CLOSED:
1. Revisa reglas en router
2. Verifica IP interna
3. Reinicia router
4. Espera 5 minutos
5. Prueba de nuevo

Si IP pública cambia frecuentemente:
1. Considera servicio DynDNS
2. O usa Cloudflare Tunnel
3. Ver sección: Alternativas al Port Forwarding
```

---

<a name="faq"></a>
# 7️⃣ PREGUNTAS FRECUENTES

## 💭 General

**P: ¿Necesito conocimientos técnicos para usar el sistema?**
- R: No. Como usuario, solo necesitas seguir las instrucciones de este manual. La parte técnica la maneja el administrador.

**P: ¿Funciona en Mac o Linux?**
- R: Actualmente solo Windows. Versiones para Mac/Linux en desarrollo.

**P: ¿Cuántos usuarios puede manejar el sistema?**
- R: Depende del hardware, pero un PC promedio puede manejar 10-20 usuarios concurrentes sin problemas.

**P: ¿Necesito mantener mi PC encendida 24/7?**
- R: Solo si quieres que usuarios accedan 24/7. Para uso personal o durante horario laboral, no es necesario.

---

## 💰 Sobre Comisiones

**P: ¿Cómo se calculan las comisiones?**
```
R: Fórmula:
   Venta = $100
   Costo = $60
   Ganancia Bruta = $100 - $60 = $40
   Comisión (10%) = $40 × 0.10 = $4
   Tu Ganancia Neta = $40 - $4 = $36
```

**P: ¿Cuándo se pagan las comisiones?**
- R: El administrador define la frecuencia (semanal, quincenal, mensual). Puedes ver comisiones pendientes en Dashboard.

**P: ¿Puedo negociar mi tasa de comisión?**
- R: Sí, habla con tu administrador. Usuarios con alto volumen pueden obtener mejores tasas.

---

## 🔑 Sobre APIs

**P: ¿Son caras las APIs?**
```
R: Precios aproximados:
   - AliExpress: Gratis hasta 10k requests/día
   - eBay: Gratis hasta 5k requests/día
   - Amazon: Desde $0.06 por request
```

**P: ¿Puedo usar APIs del administrador?**
- R: Si el admin lo configura, sí. Pero recomendamos usar las propias para:
  - Mayor cuota
  - Control total
  - No compartir límites

**P: ¿Qué pasa si se agotan mis cuotas de API?**
- R: El sistema mostrará error. Deberás esperar al reset (generalmente diario a medianoche UTC) o upgrade tu plan.

---

## 🤖 Sobre Automatización

**P: ¿Autopilot puede funcionar sin supervisión?**
- R: Técnicamente sí, pero recomendamos revisar diariamente. Algunos marketplaces requieren aprobaciones manuales.

**P: ¿Autopilot compra productos automáticamente?**
- R: Solo si lo activas. Por defecto, requiere confirmación manual antes de cada compra.

**P: ¿Qué tan inteligente es el sistema?**
- R: Usa IA para:
  - Detectar productos trending
  - Calcular precios óptimos
  - Analizar competencia
  - Predecir demanda
  Pero decisiones finales las tomas tú (o configuras reglas en Autopilot).

---

<a name="soporte"></a>
# 8️⃣ SOPORTE TÉCNICO

## 📞 Canales de Soporte

### Para Usuarios

**Contacta a tu administrador:**
```
1. Email del admin (te lo proporcionó)
2. WhatsApp del admin
3. O desde el sistema: Menu → Help → Contact Admin
```

### Para Administradores

**Soporte técnico del sistema:**
```
📧 Email: support@ivanreseller.com
💬 WhatsApp: +XX XXX XXX XXXX
🌐 Foros: https://community.ivanreseller.com
📚 Docs: https://docs.ivanreseller.com
```

---

## 📋 Información a Proporcionar

**Al reportar un problema, incluye:**

```
1. Descripción del problema:
   - ¿Qué estabas haciendo?
   - ¿Qué esperabas que pasara?
   - ¿Qué pasó en realidad?

2. Capturas de pantalla:
   - Del error
   - De la configuración relevante

3. Información técnica:
   - Rol: Admin / Usuario
   - Navegador: Chrome, Firefox, etc.
   - Sistema: Windows 10/11
   - IP si es relevante

4. Logs (si es admin):
   - Menu → System Logs
   - Exporta últimos 100 registros
   - Adjunta al reporte
```

---

## 🆘 Soporte de Emergencia

**Si el sistema está completamente caído:**

```
1. Admin: Reinicia el sistema
   - Cierra iniciar-sistema.bat
   - Espera 30 segundos
   - Vuelve a ejecutar

2. Si persiste:
   - Reinicia tu PC
   - Verifica conexión internet
   - Revisa firewall de Windows

3. Si aún no funciona:
   - Contacta soporte técnico
   - Marca como: URGENTE
   - Incluye todos los detalles
```

---

## 📚 Recursos Adicionales

### Documentación Oficial

```
📘 Manual Completo: Este documento
📗 Guía Rápida: LEEME_ACCESO_GLOBAL.md
📙 Guía de Inicio: INICIO_GLOBAL_RAPIDO.md
📕 Para Usuarios: INSTRUCCIONES_PARA_USUARIOS.md
```

### Videos Tutoriales

```
🎥 Instalación: https://youtube.com/watch?v=...
🎥 Configuración APIs: https://youtube.com/watch?v=...
🎥 Búsqueda de Oportunidades: https://youtube.com/watch?v=...
🎥 Activar Autopilot: https://youtube.com/watch?v=...
```

### Comunidad

```
💬 Discord: https://discord.gg/ivanreseller
🗣️ Foro: https://community.ivanreseller.com
📱 Telegram: https://t.me/ivanreseller
```

---

## 🔄 Actualizaciones

**El sistema se actualiza automáticamente:**

```
✅ Nuevas features
✅ Mejoras de seguridad
✅ Corrección de bugs
✅ Optimizaciones de velocidad
```

**Historial de versiones:**
```
v1.0.0 (Nov 2025) - Lanzamiento inicial
v1.1.0 (Dic 2025) - Autopilot mejorado
v1.2.0 (Ene 2026) - Soporte para más marketplaces
```

---

## ✅ Checklist de Verificación

### Para Administradores (Setup Inicial)

- [ ] Sistema instalado (iniciar-sistema.bat funciona)
- [ ] Port Forwarding configurado y probado
- [ ] Contraseña de admin cambiada
- [ ] APIs maestras configuradas (opcional)
- [ ] Primer usuario de prueba creado
- [ ] Búsqueda de prueba exitosa
- [ ] Autopilot configurado y probado
- [ ] Backup programado
- [ ] Documentación leída completamente
- [ ] URLs compartidas con usuarios

### Para Usuarios (Primer Uso)

- [ ] Credenciales recibidas del admin
- [ ] Login exitoso
- [ ] Contraseña cambiada
- [ ] APIs personales configuradas
- [ ] Primera búsqueda exitosa
- [ ] Primer producto publicado
- [ ] Notificaciones configuradas
- [ ] Autopilot activado (opcional)
- [ ] Método de pago configurado
- [ ] Documentación leída

---

## 📊 Mejores Prácticas

### Para Maximizar Ganancias

1. **Busca Productos Trending** 🔥
   - Usa Google Trends
   - Revisa redes sociales
   - Observa temporadas (Navidad, Black Friday, etc.)

2. **Optimiza Precios** 💰
   - No siempre el más barato gana
   - Considera valor agregado
   - Usa precios psicológicos ($19.99 vs $20.00)

3. **Enfócate en Nichos** 🎯
   - Menos competencia
   - Márgenes más altos
   - Clientes más leales

4. **Automatiza Inteligentemente** 🤖
   - Usa Autopilot para tareas repetitivas
   - Pero supervisa resultados
   - Ajusta parámetros según performance

5. **Analiza Datos** 📊
   - Revisa reportes semanalmente
   - Identifica productos ganadores
   - Replica éxitos, elimina flops

---

## 🎓 Conclusión

**¡Felicidades!** Has completado el manual completo de Ivan Reseller.

**Recuerda:**
- ✅ Este manual es tu recurso principal
- ✅ Consulta secciones específicas según necesidad
- ✅ Marca páginas importantes
- ✅ Mantén este documento actualizado
- ✅ Comparte con nuevos usuarios

**¿Listo para empezar?**
1. Administradores: Ve a [Instalación](#instalación)
2. Usuarios: Ve a [Guía para Usuarios](#usuarios)

---

**🌟 ¡Éxito en tu negocio de dropshipping!**

---

**Información del Documento:**
- Versión: 1.0
- Última actualización: 3 de Noviembre de 2025
- Páginas: Este documento completo
- Mantenido por: Ivan Reseller Dev Team

**Copyright © 2025 Ivan Reseller. Todos los derechos reservados.**
