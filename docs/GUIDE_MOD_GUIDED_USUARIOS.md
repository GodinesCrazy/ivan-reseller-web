# 📖 GUÍA: Modo Guided para Usuarios

**Fecha:** 2025-01-26  
**Audiencia:** Usuarios finales

---

## 🎯 ¿Qué es el Modo Guided?

El **Modo Guided** es una opción intermedia entre **Manual** y **Automático** que te permite mantener control sobre tu negocio sin tener que aprobar cada acción individualmente.

### ¿Cómo funciona?

1. **El sistema te notifica** antes de ejecutar una acción importante
2. **Tienes 5 minutos** para responder
3. **Si respondes:** La acción se ejecuta inmediatamente o se cancela según tu elección
4. **Si no respondes:** La acción se ejecuta automáticamente después del timeout

---

## 🔔 Ejemplos de Uso

### 1. Compra Guided (Purchase)

**Cuándo se activa:**
- Recibes una venta de un cliente
- La etapa de compra está configurada en modo `guided`

**Qué sucede:**
1. Recibes una notificación: *"Venta [ORDER_ID] por $XX.XX lista para compra automática"*
2. Botones disponibles:
   - ✅ **Confirmar y Comprar Ahora** - Ejecuta la compra inmediatamente
   - ❌ **Cancelar Compra** - Cancela la compra (deberás comprar manualmente después)
3. Si no respondes en 5 minutos, la compra se ejecuta automáticamente

**Ventajas:**
- Mantienes control sobre compras grandes o inusuales
- No tienes que estar pendiente de cada venta
- El sistema protege tu negocio ejecutando automáticamente si no estás disponible

---

### 2. Publicación Guided (Publish)

**Cuándo se activa:**
- El sistema encuentra un producto listo para publicar
- La etapa de publicación está configurada en modo `guided`

**Qué sucede:**
1. Recibes una notificación: *"Producto '[TÍTULO]' está listo para publicar"*
2. Botones disponibles:
   - ✅ **Confirmar y Publicar** - Publica el producto inmediatamente
   - ❌ **Cancelar** - No publica el producto
3. Si no respondes en 5 minutos, el producto se publica automáticamente

**Ventajas:**
- Puedes revisar productos antes de publicarlos
- No pierdes oportunidades si no estás disponible
- Perfecto para productos con alto valor o inversión

---

### 3. Búsqueda Guided (Scrape)

**Cuándo se activa:**
- El sistema está listo para buscar nuevas oportunidades
- La etapa de búsqueda está configurada en modo `guided`

**Qué sucede:**
1. Recibes una notificación: *"¿Deseas iniciar la búsqueda de oportunidades ahora?"*
2. Botones disponibles:
   - ✅ **Iniciar Búsqueda** - Comienza a buscar inmediatamente
   - ⏭️ **Omitir Ahora** - Posponer la búsqueda
3. Si no respondes en 5 minutos, la búsqueda se inicia automáticamente

**Ventajas:**
- Controlas cuándo el sistema consume recursos
- Puedes posponer búsquedas en momentos ocupados
- No pierdes búsquedas automáticas si no estás disponible

---

### 4. Análisis Guided (Analyze)

**Cuándo se activa:**
- El sistema está listo para analizar precios y oportunidades existentes
- La etapa de análisis está configurada en modo `guided`

**Qué sucede:**
1. Recibes una notificación: *"¿Deseas iniciar el análisis de productos ahora?"*
2. Botones disponibles:
   - ✅ **Iniciar Análisis** - Ejecuta el análisis inmediatamente
   - ⏭️ **Omitir Ahora** - Posponer el análisis
3. Si no respondes en 5 minutos, el análisis se ejecuta automáticamente

**Ventajas:**
- Controlas cuándo se ejecutan análisis que consumen recursos
- Puedes programar análisis para momentos convenientes
- No pierdes análisis automáticos si no estás disponible

---

## ⚙️ Cómo Configurar Modo Guided

### Paso 1: Ir a Configuración de Workflow

1. Inicia sesión en tu cuenta
2. Ve a **Settings** → **Configuración de Workflow**

### Paso 2: Seleccionar Modo Hybrid

En la sección **"Modo de Workflow"**, selecciona **"Hybrid"**.

> **Nota:** Si seleccionas "Manual" o "Automatic", el modo Guided no estará disponible ya que estos modos sobrescriben todas las configuraciones individuales.

### Paso 3: Configurar Etapas Individuales

En la sección **"Configuración por Etapa"**, para cada etapa puedes seleccionar:

- **Manual** - Requiere aprobación en cada paso
- **Automatic** - Se ejecuta sin intervención
- **Guided** - Te notifica y espera confirmación (5 minutos timeout)

### Paso 4: Guardar Configuración

Haz clic en **"Guardar Configuración"** para aplicar los cambios.

---

## 💡 Recomendaciones de Uso

### Escenarios Ideales para Guided

✅ **Compra (Purchase):**
- Cuando quieres revisar ventas grandes antes de comprar
- Cuando manejas múltiples cuentas de proveedores
- Cuando quieres controlar el flujo de capital

✅ **Publicación (Publish):**
- Para productos con alto valor o inversión
- Cuando quieres revisar títulos y descripciones antes de publicar
- Para productos en categorías sensibles

✅ **Búsqueda (Scrape):**
- Cuando quieres controlar cuándo se consumen recursos del servidor
- Para evitar búsquedas en horarios específicos
- Cuando trabajas con límites de API

✅ **Análisis (Analyze):**
- Similar a búsqueda, para controlar consumo de recursos
- Cuando quieres programar análisis en momentos específicos

### Cuándo NO Usar Guided

❌ Si prefieres control total → Usa **Manual**  
❌ Si quieres cero intervención → Usa **Automatic**  
❌ Si no revisas notificaciones frecuentemente → Usa **Automatic**

---

## ⏰ Entendiendo el Timeout de 5 Minutos

### ¿Por qué 5 minutos?

El timeout de 5 minutos es un balance entre:
- **Control del usuario** - Tiempo suficiente para revisar y decidir
- **Eficiencia del negocio** - No retrasa operaciones críticas demasiado

### ¿Puedo cambiar el timeout?

Actualmente, el timeout está fijado en 5 minutos. En futuras versiones podrá configurarse.

### ¿Qué pasa si no respondo?

Si no respondes en 5 minutos:
- La acción se ejecuta automáticamente (como si fuera modo Automatic)
- Recibirás una notificación de confirmación después de la ejecución
- El sistema registra que fue ejecutado por timeout

---

## 🔔 Notificaciones

### Dónde recibirás las notificaciones

- **Panel de notificaciones** en la aplicación
- **Email** (si está configurado)
- **Sistema de notificaciones en tiempo real** (si estás conectado)

### Tipos de notificaciones Guided

1. **Notificación inicial** - Te informa que hay una acción pendiente
2. **Notificación de confirmación** - Después de que confirmas o cancelas
3. **Notificación de timeout** - Si la acción se ejecutó automáticamente

---

## ❓ Preguntas Frecuentes

### ¿Puedo cambiar entre modos después de configurar?

Sí, puedes cambiar la configuración en cualquier momento desde Settings → Configuración de Workflow.

### ¿Qué pasa si tengo Guided en una etapa pero no reviso notificaciones?

El sistema ejecutará las acciones automáticamente después de 5 minutos. Es como si fuera modo Automatic.

### ¿Puedo usar Guided para algunas etapas y Automatic para otras?

Sí, eso es exactamente para lo que está diseñado el modo Hybrid. Puedes configurar cada etapa individualmente.

### ¿Las acciones guided se ejecutan si el servidor se reinicia?

Las acciones en memoria se pierden si el servidor se reinicia. Las acciones que ya expiraron se ejecutarán cuando el sistema se reinicie. Esto está siendo mejorado en futuras versiones.

### ¿Puedo ver un historial de acciones guided?

Actualmente no hay una interfaz visual para esto, pero está planificado para futuras versiones.

---

## 🎯 Resumen

**Modo Guided** = Control inteligente + Automatización de respaldo

- ✅ Te notifica antes de acciones importantes
- ✅ Tienes 5 minutos para decidir
- ✅ Si no respondes, se ejecuta automáticamente
- ✅ Perfecto para balancear control y eficiencia

---

**Última actualización:** 2025-01-26

