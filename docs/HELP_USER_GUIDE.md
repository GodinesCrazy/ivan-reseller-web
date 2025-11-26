# 📘 Guía Completa del Usuario - IvanReseller

**Versión:** 2.0  
**Última actualización:** 2025-01-28

---

## 📑 Índice

1. [Inicio Rápido](#1-inicio-rápido)
2. [Publicación de Productos](#2-publicación-de-productos)
3. [Flujo de Venta y Compra Automática](#3-flujo-de-venta-y-compra-automática)
4. [Reportes de Ganancia](#4-reportes-de-ganancia)
5. [Integración de APIs](#5-integración-de-apis)
6. [Configuración de Workflow](#6-configuración-de-workflow)

---

## 1. Inicio Rápido

### 1.1. Primer Acceso

**Pasos:**

1. **Login:**
   ```
   URL: http://localhost:5173/login
   Email: tu-email@ejemplo.com
   Password: tu-contraseña
   ```

2. **Dashboard Principal:**
   - Verás estadísticas generales de tu negocio
   - Acceso rápido a funcionalidades principales

3. **Configuración Inicial:**
   - Ve a **Settings** → **API Configuration**
   - Configura tus credenciales de marketplaces (eBay, Amazon, MercadoLibre)
   - Configura tu capital de trabajo en **Workflow Config**

### ⚠️ Advertencias Importantes

| Advertencia | Explicación |
|-------------|-------------|
| 🔐 **Credenciales Seguras** | Nunca compartas tus credenciales de API. Cada usuario tiene sus propias credenciales encriptadas. |
| 💰 **Capital de Trabajo** | Configura un capital de trabajo realista. El sistema valida disponibilidad antes de compras automáticas. |
| 🌐 **Ambiente** | Comienza con **Sandbox** para pruebas antes de usar **Production**. |

### ❌ Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `"No se pudo autenticar"` | Credenciales incorrectas | Verifica email/password. Si olvidaste tu contraseña, contacta al administrador. |
| `"API no configurada"` | Falta configurar credenciales | Ve a Settings → API Configuration y configura las APIs necesarias. |
| `"Capital insuficiente"` | No hay capital disponible | Aumenta tu capital de trabajo en Workflow Config o reduce productos pendientes. |

---

## 2. Publicación de Productos

### 2.1. Publicar Producto con Múltiples Imágenes

#### 📋 Flujo Paso a Paso

```
1. Buscar Oportunidad → 2. Seleccionar Producto → 3. Configurar Producto → 4. Agregar Imágenes → 5. Publicar
```

#### **Paso 1: Buscar Oportunidad**

1. Ve a **Opportunities** en el menú
2. Ingresa palabras clave (ej: "iphone case")
3. Selecciona filtros:
   - Margen mínimo (recomendado: 30%+)
   - Marketplace destino (eBay, Amazon, MercadoLibre)
   - País destino
4. Haz clic en **"Buscar Oportunidades"**

#### **Paso 2: Seleccionar Producto**

La lista muestra:
- ✅ **ROI** calculado
- ✅ **Margen** estimado
- ✅ **Precio sugerido**
- ✅ **Imagen principal**

Haz clic en **"Crear Producto"** del producto que te interese.

#### **Paso 3: Configurar Producto**

**Campos Obligatorios:**
```
Título: [Generado automáticamente, puedes editar]
Descripción: [Generada automáticamente, puedes editar]
Precio AliExpress: $XX.XX (auto-rellenado)
Precio Sugerido: $XX.XX (calculado automáticamente)
Marketplace: [eBay / Amazon / MercadoLibre]
```

**Campos Opcionales:**
```
Categoría: [Selecciona la más apropiada]
Tags: [Palabras clave adicionales]
Costo de Envío: [Si conoces el costo exacto]
País Destino: [Para cálculo de impuestos]
```

#### **Paso 4: Agregar Imágenes**

**Imagen Principal:**
```
1. El sistema carga automáticamente la primera imagen del producto
2. Puedes cambiar la URL manualmente si prefieres otra imagen
3. URL debe ser: https://... (formato válido)
```

**Imágenes Adicionales:**
```
1. Haz clic en "Agregar Imagen"
2. Pega la URL de la imagen (https://...)
3. Puedes agregar hasta 10 imágenes adicionales
4. Arrastra para reordenar
```

**✅ Validaciones Automáticas:**

El sistema valida automáticamente:

| Validación | Requisito | Mensaje si Falla |
|------------|-----------|------------------|
| **Resolución mínima** | 500x500px | "Resolución mínima requerida: 500x500px" |
| **Formato** | JPEG, PNG, WebP | "Formato no permitido. Use JPEG, PNG o WebP" |
| **Tamaño máximo** | 10MB | "Tamaño máximo: 10MB" |
| **URL válida** | https://... | "URL inválida. Debe comenzar con https://" |

**⚠️ Advertencias de Imágenes:**

| Situación | Qué Hace el Sistema |
|-----------|---------------------|
| **Todas las imágenes inválidas** | ❌ No permite crear el producto. Debes corregir las imágenes. |
| **Algunas imágenes inválidas** | ⚠️ Muestra advertencia pero continúa con las válidas. |
| **Error técnico de validación** | ⚠️ Registra warning en logs pero permite continuar (compatibilidad retroactiva). |

#### **Paso 5: Publicar**

1. Revisa todos los datos
2. Haz clic en **"Guardar Producto"**
3. El producto se crea con estado **PENDING**
4. Si tienes **Autopilot activado**, el sistema intentará publicarlo automáticamente

**Estados del Producto:**

| Estado | Significado | Acción Requerida |
|--------|-------------|------------------|
| **PENDING** | Esperando aprobación/publicación | Ninguna (si Autopilot está activo) |
| **APPROVED** | Aprobado pero no publicado | Puede ser publicado manualmente |
| **PUBLISHED** | Publicado en marketplace | Visible para compradores |
| **INACTIVE** | Despublicado | Revisa razones y reactiva si es necesario |
| **REJECTED** | Rechazado | Revisa errores y corrige |

### 📊 Ejemplo Visual: Flujo de Publicación

```
┌─────────────────────────────────────────────────────────────┐
│                    BUSCAR OPORTUNIDADES                     │
│  [Búsqueda: "iphone case"] → [Filtros] → [Buscar]         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 LISTA DE OPORTUNIDADES                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ [Imagen]     │  │ [Imagen]     │  │ [Imagen]     │     │
│  │ ROI: 45%     │  │ ROI: 52%     │  │ ROI: 38%     │     │
│  │ Margen: 35%  │  │ Margen: 40%  │  │ Margen: 30%  │     │
│  │ [Crear Prod] │  │ [Crear Prod] │  │ [Crear Prod] │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              FORMULARIO DE CREACIÓN                         │
│  Título: [iPhone Case]                                     │
│  Descripción: [...]                                        │
│  Precio: $15.99                                            │
│  Imagen Principal: [https://...] ✅                        │
│  Imágenes Adicionales:                                     │
│    [1] https://... ✅                                      │
│    [2] https://... ✅                                      │
│    [3] https://... ⚠️ (Resolución baja)                    │
│  [Guardar Producto]                                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    PRODUCTO CREADO                          │
│  Estado: PENDING                                            │
│  Si Autopilot activo → Publicación automática en <1 min    │
└─────────────────────────────────────────────────────────────┘
```

### ⚠️ Errores Comunes en Publicación

| Error | Causa | Solución |
|-------|-------|----------|
| `"Límite de productos pendientes alcanzado"` | Has creado demasiados productos pendientes | Publica o elimina productos existentes antes de crear nuevos. Límite por defecto: 100 productos. |
| `"Resolución mínima requerida: 500x500px"` | Imagen muy pequeña | Usa imágenes de al menos 500x500px. El sistema rechaza imágenes más pequeñas. |
| `"Formato de imagen no permitido"` | Formato no soportado | Solo se permiten JPEG, PNG y WebP. Convierte imágenes en otros formatos. |
| `"URL de imagen inválida"` | URL mal formada | Asegúrate de que la URL comience con `https://` y sea accesible públicamente. |
| `"Capital insuficiente para publicar"` | No hay capital disponible | Aumenta tu capital de trabajo o reduce productos pendientes. |

### 💡 Tips y Mejores Prácticas

| Tip | Beneficio |
|-----|-----------|
| **Usa imágenes de alta calidad** | Mayor conversión, mejor reputación |
| **Agrega 5-8 imágenes** | Los compradores confían más en productos con múltiples imágenes |
| **Verifica URLs antes de guardar** | Evita productos sin imágenes después de publicar |
| **Usa categorías correctas** | Mejor visibilidad en marketplaces |
| **Revisa precios sugeridos** | Asegúrate de que el margen sea suficiente para cubrir fees |

---

## 3. Flujo de Venta y Compra Automática

### 3.1. Cómo Funciona el Flujo Automático

#### 📋 Flujo Completo

```
VENTA → WEBHOOK → VALIDACIÓN → COMPRA AUTOMÁTICA → REGISTRO → NOTIFICACIÓN
```

#### **Paso 1: Venta Recibida**

Cuando un cliente compra tu producto en el marketplace:

1. El marketplace envía un **webhook** a IvanReseller
2. El sistema registra la venta en la base de datos
3. Calcula comisiones automáticamente

**Datos Registrados:**
```json
{
  "orderId": "123456789",
  "productTitle": "iPhone Case",
  "salePrice": 25.99,
  "buyerInfo": {
    "name": "Juan Pérez",
    "email": "juan@ejemplo.com",
    "address": "..."
  },
  "marketplace": "eBay"
}
```

#### **Paso 2: Validaciones Automáticas**

El sistema ejecuta **3 validaciones críticas**:

**✅ Validación 1: Capital de Trabajo**
```
Capital Disponible = Capital Total - Capital Comprometido
Si Capital Disponible < Costo de Compra × 1.20 → ❌ Error
```

**✅ Validación 2: Saldo PayPal (si está configurado)**
```
Si PayPal API disponible:
  - Valida saldo real en PayPal
  - Verifica que saldo >= Costo de Compra × 1.20
  Si no disponible:
  - Usa validación de capital de trabajo como fallback
```

**✅ Validación 3: Datos Requeridos**
```
✓ URL del producto en AliExpress
✓ Dirección de envío del comprador
✓ Precio dentro del rango permitido
```

#### **Paso 3: Decisión Automática vs Manual**

**Si Workflow = AUTOMÁTICO:**
```
✅ Ejecuta compra automática en AliExpress
✅ Usa Puppeteer para automatizar la compra
✅ Registra resultado en PurchaseLog
```

**Si Workflow = MANUAL:**
```
📧 Envía notificación al usuario:
   "Venta recibida. Haz clic aquí para comprar manualmente"
🔗 Link directo al producto en AliExpress
```

#### **Paso 4: Compra Automática (si está activado)**

El sistema:

1. **Abre navegador automatizado** (Puppeteer)
2. **Inicia sesión** en AliExpress (usando credenciales configuradas)
3. **Navega al producto** usando la URL guardada
4. **Agrega al carrito** y completa la compra
5. **Registra tracking number** si está disponible
6. **Actualiza estado** de la venta a "PROCESSING"

**⚠️ Si Puppeteer Falla:**
```
❌ El sistema detecta el error automáticamente
📧 Envía alerta inmediata al usuario:
   "Error en compra automática. Requiere acción manual."
🔗 Proporciona link directo para compra manual
```

#### **Paso 5: Registro y Notificación**

**PurchaseLog Registrado:**
```json
{
  "orderId": "123456789",
  "productId": 42,
  "userId": 1,
  "status": "SUCCESS" | "FAILED" | "PENDING",
  "attempts": 1,
  "error": null,
  "purchaseDate": "2025-01-28T10:30:00Z"
}
```

**Notificación al Usuario:**
```
✅ Si exitoso: "Compra realizada exitosamente. Tracking: ABC123"
❌ Si falló: "Error en compra automática. Acción manual requerida."
```

### 📊 Diagrama de Flujo Visual

```
┌─────────────────────────────────────────────────────────────┐
│                    VENTA RECIBIDA                           │
│              (Webhook de Marketplace)                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              REGISTRO DE VENTA EN BD                        │
│  Sale creado → Comisiones calculadas                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              VALIDACIONES AUTOMÁTICAS                       │
│  ┌────────────────┐  ┌────────────────┐                   │
│  │ Capital OK?    │  │ PayPal OK?     │                   │
│  │ ✅ Sí          │  │ ✅ Sí          │                   │
│  └────────────────┘  └────────────────┘                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
           ┌───────────┴───────────┐
           │                       │
           ▼                       ▼
┌──────────────────────┐  ┌──────────────────────┐
│   MODO AUTOMÁTICO    │  │    MODO MANUAL       │
│                      │  │                      │
│  1. Puppeteer        │  │  1. Notificación     │
│  2. Compra automática│  │  2. Link directo     │
│  3. PurchaseLog      │  │  3. Esperar acción   │
│  4. Tracking update  │  │     del usuario      │
└──────────────────────┘  └──────────────────────┘
```

### ⚠️ Advertencias Críticas

| Advertencia | Impacto | Acción Preventiva |
|-------------|---------|-------------------|
| **🔴 Capital Insuficiente** | Compra automática falla, se requiere acción manual | Monitorea capital disponible. Configura alertas. |
| **🔴 Puppeteer Falla** | Compra no se ejecuta automáticamente | Revisa credenciales de AliExpress. Verifica que Puppeteer funcione. |
| **🟡 Credenciales Expiradas** | No se puede iniciar sesión en AliExpress | Renueva credenciales periódicamente. |
| **🟡 Dirección Incompleta** | No se puede enviar el producto | Valida que el comprador proporcione dirección completa. |

### ❌ Errores Comunes y Soluciones

| Error | Causa | Solución |
|-------|-------|----------|
| `"Saldo PayPal insuficiente"` | No hay suficiente saldo en PayPal | Recarga tu cuenta PayPal o reduce capital comprometido. |
| `"Capital insuficiente (con buffer)"` | El sistema aplica un buffer del 20% para desfases de pago | Aumenta tu capital de trabajo en un 25% más de lo que planeas usar. |
| `"Puppeteer automation failed"` | Error técnico en automatización | Revisa logs. Si persiste, cambia a modo manual temporalmente. |
| `"Credenciales de AliExpress inválidas"` | Credenciales incorrectas o expiradas | Actualiza credenciales en Settings → API Configuration. |
| `"Producto no encontrado en AliExpress"` | El producto fue eliminado o la URL cambió | Verifica manualmente la URL. Actualiza el producto si es necesario. |

### 💡 Configuración Recomendada

**Para Máxima Automatización:**
```
Workflow Mode: AUTOMATIC
Stage Purchase: AUTOMATIC
Capital de Trabajo: $500+ (o 3x tu venta promedio)
PayPal Configurado: ✅ Sí
AliExpress Credenciales: ✅ Sí (y 2FA deshabilitado si es posible)
```

**Para Control Manual:**
```
Workflow Mode: MANUAL
Stage Purchase: MANUAL
Capital de Trabajo: $100+ (mínimo para emergencias)
PayPal Configurado: ✅ Opcional
AliExpress Credenciales: ✅ Sí (para acceso rápido cuando necesites)
```

---

## 4. Reportes de Ganancia

### 4.1. Acceso a Reportes

**Ubicación:**
```
Menú → Reports → Financial Summary
URL: /reports/finance
```

### 4.2. Métricas Disponibles

#### 📊 Tabla de Métricas Principales

| Métrica | Descripción | Cómo Interpretar |
|---------|-------------|------------------|
| **Total de Ventas** | Suma de todas las ventas cobradas | Ingresos totales generados |
| **Ganancia Bruta** | Total de ventas - Costos de productos | Beneficio antes de comisiones y fees |
| **Comisiones Pagadas** | Comisiones pagadas al admin (20% de gross profit) | Costo de usar la plataforma |
| **Ganancia Neta** | Gross Profit - Comisiones - Fees | Ganancia real que recibes |
| **ROI Promedio** | Retorno sobre inversión promedio | Eficiencia de tus inversiones |
| **Tasa de Conversión** | Ventas / Visualizaciones | Efectividad de tus publicaciones |

#### 📈 Métricas Avanzadas (Nuevas)

| Métrica | Descripción | Valor Ideal |
|---------|-------------|-------------|
| **Rotación de Capital** | Ventas / Capital Promedio | > 2.0 (capital se rota más de 2 veces) |
| **Tiempo de Recuperación** | Días promedio desde compra hasta cobro | < 30 días |
| **Capital Comprometido** | Capital usado en órdenes pendientes | < 80% del capital total |
| **Capital Disponible** | Capital libre para nuevas compras | > 20% del capital total |
| **Tasa de Utilización** | % de capital en uso | 60-80% (óptimo) |

### 4.3. Interpretación de Reportes

#### 📊 Ejemplo de Reporte Semanal

```
═══════════════════════════════════════════════════════════
           REPORTE FINANCIERO - SEMANA ACTUAL
═══════════════════════════════════════════════════════════

VENTAS:
  Total Ventas Cobradas:           $1,250.00
  Ventas Pendientes de Cobro:      $450.00
  Número de Ventas:                12 ventas

GANANCIAS:
  Ganancia Bruta:                  $650.00
  Comisiones Pagadas:              $130.00 (20%)
  Fees de Marketplace:             $85.00
  Ganancia Neta:                   $435.00

MÉTRICAS:
  ROI Promedio:                    45%
  Tasa de Conversión:              2.5%
  Margen Promedio:                 35%

CAPITAL:
  Capital de Trabajo Total:        $500.00
  Capital Comprometido:            $320.00 (64%)
  Capital Disponible:              $180.00 (36%)
  Rotación de Capital:             2.5x
  Tiempo de Recuperación:          22 días

FLUJO DE CAJA:
  Ingresos Cobrados:               $1,250.00
  Gastos Realizados:               $600.00
  Flujo Neto:                      +$650.00
═══════════════════════════════════════════════════════════
```

#### ✅ Interpretación del Ejemplo

**📊 Lo que está Bien:**
- ✅ ROI del 45% es excelente (objetivo: >30%)
- ✅ Rotación de capital 2.5x (buena eficiencia)
- ✅ Tiempo de recuperación de 22 días (rápido)
- ✅ Capital disponible del 36% (seguro para emergencias)

**⚠️ Áreas de Mejora:**
- ⚠️ Tasa de conversión 2.5% (puede mejorarse a 3-5%)
- ⚠️ Capital comprometido 64% (óptimo sería 60-70%)

### 4.4. Filtros de Reportes

**Rangos de Tiempo Disponibles:**
- **Última Semana**
- **Último Mes**
- **Último Trimestre**
- **Último Año**
- **Rango Personalizado**

**Filtros Adicionales:**
- Por Marketplace (eBay, Amazon, MercadoLibre)
- Por Estado de Venta (PENDIENTE, COBRADA, CANCELADA)
- Por Producto
- Por Rango de Precio

### ⚠️ Advertencias Importantes

| Advertencia | Explicación |
|-------------|-------------|
| **💰 Ventas Pendientes No = Dinero Disponible** | Las ventas pendientes de cobro no se reflejan en tu capital disponible hasta que se cobren. |
| **⏱️ Tiempo de Recuperación Variable** | Depende del marketplace y método de pago. PayPal puede tomar 1-3 días, otros métodos hasta 30 días. |
| **📉 Capital Comprometido vs Disponible** | El capital comprometido incluye órdenes pendientes de compra. No puedes usar ese capital hasta que se complete la compra. |

### ❌ Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `"No se muestran datos"` | No hay ventas en el rango seleccionado | Cambia el rango de fechas o verifica que tengas ventas registradas. |
| `"Números no coinciden"` | Datos calculados en diferentes momentos | Los reportes se calculan en tiempo real. Recarga la página si los números parecen desactualizados. |
| `"Capital comprometido muy alto"` | Muchas órdenes pendientes | Completa las compras pendientes o cancela órdenes si es necesario. |

---

## 5. Integración de APIs

### 5.1. APIs Disponibles

#### 📋 Tabla de APIs y Configuración

| API | Requerida | Dónde Obtener | Campos Necesarios |
|-----|-----------|---------------|-------------------|
| **eBay** | ✅ Sí (para publicar) | https://developer.ebay.com | App ID, Dev ID, Cert ID, Redirect URI |
| **Amazon** | ✅ Sí (para publicar) | https://developer.amazon.com | Client ID, Client Secret, Refresh Token, Region |
| **MercadoLibre** | ✅ Sí (para publicar) | https://developers.mercadolibre.com | Client ID, Client Secret |
| **PayPal** | ✅ Sí (para compras automáticas) | https://developer.paypal.com | Client ID, Client Secret, Mode |
| **Google Trends** | ❌ Opcional | https://serpapi.com | API Key (SerpAPI) |
| **GROQ AI** | ❌ Opcional | https://console.groq.com | API Key |
| **ScraperAPI** | ❌ Opcional | https://www.scraperapi.com | API Key |
| **AliExpress** | ✅ Sí (para compras automáticas) | Tu cuenta de AliExpress | Email, Password, 2FA (opcional) |

### 5.2. Configuración de PayPal

#### 📋 Guía Paso a Paso

**1. Obtener Credenciales:**

```
a) Ve a: https://developer.paypal.com/
b) Inicia sesión con tu cuenta PayPal
c) Ve a: Dashboard → My Apps & Credentials
d) Crea una nueva app o usa una existente
e) Copia:
   - Client ID
   - Client Secret
```

**2. Configurar en IvanReseller:**

```
a) Ve a: Settings → API Configuration
b) Busca sección "PayPal Payouts" 💳
c) Completa:
   - Client ID: [Pega tu Client ID]
   - Client Secret: [Pega tu Client Secret]
   - Mode: [Selecciona: "sandbox" o "live"]
d) Haz clic en "Guardar"
e) Haz clic en "Test" para verificar
```

**3. Verificación:**

```
✅ Si funciona: Verás "API configurada correctamente"
❌ Si falla: Revisa que las credenciales sean correctas y que el modo coincida
```

#### ⚠️ Advertencias de PayPal

| Advertencia | Impacto | Acción |
|-------------|---------|--------|
| **🔴 Usa Sandbox para Pruebas** | Evita cargos reales durante pruebas | Siempre prueba primero en Sandbox antes de usar Production. |
| **🟡 Permisos Requeridos** | Para validar saldo real necesitas `wallet:read` | Solicita este permiso en PayPal Developer Dashboard. |
| **🟡 Credenciales Personales** | Cada usuario debe usar sus propias credenciales | No compartas credenciales entre usuarios. |

### 5.3. Configuración de Google Trends (SerpAPI)

#### 📋 Guía Paso a Paso

**1. Obtener API Key:**

```
a) Ve a: https://serpapi.com/
b) Crea una cuenta (gratis: 100 búsquedas/mes)
c) Ve a: Dashboard → API Key
d) Copia tu API Key
```

**2. Configurar en IvanReseller:**

```
a) Ve a: Settings → API Configuration
b) Busca sección "Google Trends API (SerpAPI)" 📈
c) Completa:
   - SerpAPI Key: [Pega tu API Key]
d) Haz clic en "Guardar"
```

**⚠️ IMPORTANTE:** Esta API es **OPCIONAL**

- ✅ **Si la configuras:** El sistema usa datos reales de Google Trends para validar productos
- ❌ **Si NO la configuras:** El sistema usa análisis de datos internos (productos existentes, ventas, etc.)

#### 💡 Ventajas de Configurar Google Trends

| Ventaja | Beneficio |
|---------|-----------|
| **Validación de Tendencias** | Detecta productos en tendencia vs productos en declive |
| **Mayor Confianza** | Ajusta la confianza de oportunidades basado en búsquedas reales |
| **Mejor ROI** | Filtra productos con baja demanda antes de publicar |

### 5.4. Configuración de AliExpress

**Pasos:**

```
1. Ve a: Settings → API Configuration
2. Busca sección "AliExpress Auto-Purchase" 🛍️
3. Completa:
   - Email / Username: [Tu email de AliExpress]
   - Password: [Tu contraseña]
   - 2FA Habilitado: [true/false]
   - 2FA Secret: [Solo si tienes 2FA]
4. Haz clic en "Guardar"
```

**⚠️ Seguridad:**

| Advertencia | Razón |
|-------------|-------|
| **🔐 Credenciales Encriptadas** | Las credenciales se guardan encriptadas (AES-256-GCM) |
| **🛡️ No Compartir** | Cada usuario debe usar su propia cuenta |
| **⚠️ 2FA Complica Automatización** | Si tienes 2FA, puede requerir intervención manual |

### ⚠️ Errores Comunes en Configuración de APIs

| Error | Causa | Solución |
|-------|-------|----------|
| `"API no configurada"` | Falta configurar credenciales | Ve a Settings → API Configuration y configura la API faltante. |
| `"Credenciales inválidas"` | Credenciales incorrectas o expiradas | Verifica que copiaste correctamente. Regenera si es necesario. |
| `"Test falló"` | API no responde o credenciales incorrectas | Revisa que la API esté activa y que las credenciales sean válidas. |
| `"Permiso denegado"` | Falta permiso en la API | Verifica los permisos requeridos en la documentación de la API. |

---

## 6. Configuración de Workflow

### 6.1. Modos de Workflow

#### 📋 Tabla de Modos

| Modo | Descripción | Cuándo Usar |
|------|-------------|-------------|
| **MANUAL** | Todas las acciones requieren aprobación manual | Al comenzar, para aprender el sistema |
| **AUTOMATIC** | Todo se ejecuta automáticamente | Cuando confías en el sistema y tienes capital suficiente |
| **HYBRID** | Algunas etapas automáticas, otras manuales | Balance entre control y automatización |

### 6.2. Etapas Configurables

**Cada etapa puede ser:**
- `manual` - Requiere acción del usuario
- `automatic` - Se ejecuta automáticamente
- `guided` - El sistema sugiere pero pregunta antes

**Etapas Disponibles:**

| Etapa | Descripción | Recomendación |
|-------|-------------|---------------|
| **Scrape** | Búsqueda y scraping de productos | `automatic` si tienes keywords claras |
| **Analyze** | Análisis de oportunidades | `automatic` (el sistema es inteligente) |
| **Publish** | Publicación a marketplaces | `guided` o `automatic` según confianza |
| **Purchase** | Compra automática post-venta | `automatic` si tienes capital suficiente |
| **Fulfillment** | Gestión de envíos | `automatic` si confías en tracking automático |

### 6.3. Configuración de Capital de Trabajo

**Dónde Configurar:**
```
Settings → Workflow Configuration → Working Capital
```

**Recomendación:**
```
Capital Mínimo = (Venta Promedio × 3) + Buffer 20%
Ejemplo:
  Venta promedio: $50
  Capital mínimo: $50 × 3 × 1.20 = $180
```

**⚠️ Buffer de 20%:**
El sistema aplica un buffer del 20% para manejar desfases de pago. Esto significa que si necesitas $100 para comprar, el sistema requiere $120 disponibles.

---

## 📞 Soporte y Ayuda Adicional

### Recursos Disponibles

- **📚 Centro de Ayuda:** `/help`
- **📧 Email de Soporte:** soporte@ivanreseller.com
- **💬 Chat en Vivo:** Disponible en el dashboard (si está habilitado)

### Reportar Problemas

Si encuentras un error:

1. **Toma una captura de pantalla** del error
2. **Revisa los logs** (si tienes acceso)
3. **Contacta soporte** con:
   - Descripción del problema
   - Pasos para reproducir
   - Captura de pantalla
   - Tu ID de usuario (visible en Settings)

---

**Última actualización:** 2025-01-28  
**Versión del documento:** 2.0

