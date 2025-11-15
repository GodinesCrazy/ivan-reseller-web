# 📖 GUÍA DE USUARIO: Cola de Aprobación - 2025-11-15

**Audiencia**: Usuarios y Administradores  
**Objetivo**: Explicar cómo usar la cola de aprobación mejorada

---

## 🎯 ¿QUÉ ES LA COLA DE APROBACIÓN?

La cola de aprobación es donde se almacenan los productos que necesitan revisión antes de ser publicados en marketplaces. Estos productos pueden venir de:

1. **Autopilot**: Productos encontrados automáticamente por el sistema
2. **Manual**: Productos agregados manualmente por el usuario

---

## 📍 CÓMO ACCEDER

1. **Inicia sesión** en el sistema
2. **Navega a**: `Intelligent Publisher` en el menú lateral
3. **Verás**: Lista de productos pendientes de aprobación

---

## 📊 INFORMACIÓN MOSTRADA

Cada producto en la cola muestra:

### Información Básica
- **Título**: Nombre del producto
- **Costo**: Precio en AliExpress
- **Precio Sugerido**: Precio recomendado de venta

### Información Enriquecida (Nueva)
- **Profit Estimado**: Ganancia estimada en USD (destacado en verde)
- **ROI Estimado**: Retorno de inversión en porcentaje (destacado en azul)
- **Origen**: Badge que indica si viene de Autopilot 🤖 o Manual 👤
- **Fecha de Encolado**: Cuándo fue agregado a la cola

### Ejemplo Visual
```
┌─────────────────────────────────────────────────────────┐
│ ☑️  Producto XYZ                                        │
│                                                          │
│ Cost: $10.00 → Suggested: $25.00                       │
│ Profit: $15.00  ROI: 150.0%                            │
│ 🤖 Autopilot  Queued: 15/11/2025, 10:30 AM             │
│                                                          │
│ [ ] eBay  [ ] ML  [ ] Amazon  [Approve & Publish]       │
└─────────────────────────────────────────────────────────┘
```

---

## ✅ CÓMO APROBAR PRODUCTOS

### Opción 1: Aprobar Individualmente

1. **Selecciona marketplaces**: Marca los checkboxes de los marketplaces donde quieres publicar
   - ✅ eBay
   - ✅ MercadoLibre
   - ✅ Amazon

2. **Click en "Approve & Publish"**: El producto será aprobado y publicado automáticamente

3. **Resultado**: 
   - El producto desaparece de la cola
   - Se publica en los marketplaces seleccionados
   - Recibirás notificación de éxito

### Opción 2: Aprobar Múltiples (Bulk)

1. **Selecciona productos**: Marca los checkboxes de los productos que quieres aprobar

2. **Selecciona marketplaces**: En la barra superior, marca los marketplaces

3. **Click en "Queue Publishing Jobs"**: Los productos se encolarán para publicación

4. **Seguimiento**: Puedes ver el progreso en la barra de progreso y en la sección "Jobs"

---

## 🔔 NOTIFICACIONES

### Cuando Autopilot Agrega un Producto

Recibirás una notificación automática:
- **Título**: "Producto pendiente de aprobación"
- **Mensaje**: Incluye título del producto y profit estimado
- **Acción**: Botón "Ver producto" que te lleva directamente a la cola

### Cómo Ver Notificaciones

1. **Click en el ícono de campana** 🔔 en la barra superior
2. **Verás**: Lista de notificaciones recientes
3. **Click en una notificación**: Te lleva a la acción correspondiente

---

## 👤 DIFERENCIAS ENTRE USUARIO Y ADMIN

### Usuario Normal
- ✅ Ve solo sus propios productos pendientes
- ✅ Puede aprobar y publicar sus productos
- ✅ Recibe notificaciones de sus productos

### Administrador
- ✅ Ve TODOS los productos pendientes (de todos los usuarios)
- ✅ Puede aprobar productos de cualquier usuario
- ✅ Tiene acceso completo a la cola

---

## 🎨 BADGES Y COLORES

### Badge de Origen
- **🤖 Autopilot** (azul): Producto encontrado automáticamente
- **👤 Manual** (gris): Producto agregado manualmente

### Colores de Información
- **Profit**: Verde (ganancia positiva)
- **ROI**: Azul (retorno de inversión)
- **Costo**: Gris (precio base)

---

## 🔄 ACTUALIZAR LISTA

Si quieres actualizar la lista manualmente:

1. **Click en "Actualizar"** en la parte superior
2. **Espera**: La lista se recargará con los productos más recientes

**Nota**: La lista se actualiza automáticamente cuando:
- Se agrega un nuevo producto
- Se aprueba un producto
- Autopilot encuentra nuevas oportunidades

---

## ❓ PREGUNTAS FRECUENTES

### ¿Por qué algunos productos tienen profit y ROI y otros no?

**Respuesta**: Los productos de Autopilot incluyen análisis completo (profit, ROI). Los productos manuales pueden no tener esta información si no se proporcionó al crearlos.

### ¿Puedo rechazar un producto?

**Respuesta**: Sí, puedes rechazar productos desde la página de Products. Los productos rechazados no aparecen en la cola de aprobación.

### ¿Qué pasa si no selecciono ningún marketplace?

**Respuesta**: El producto será aprobado pero NO se publicará. Puedes publicarlo después desde la página de Products.

### ¿Cómo sé qué ambiente (sandbox/production) se usará?

**Respuesta**: El sistema usa automáticamente el ambiente configurado en tu Workflow Config. Recibirás una notificación si cambias de ambiente.

---

## 🚨 TROUBLESHOOTING

### No veo productos en la cola

**Posibles causas**:
1. No hay productos pendientes
2. Estás viendo productos de otro usuario (solo admin ve todos)
3. Los productos fueron aprobados/rechazados

**Solución**: Verifica en la página de Products que hay productos con status `PENDING`

### La notificación no aparece

**Posibles causas**:
1. Notificaciones deshabilitadas en el navegador
2. Socket.IO desconectado

**Solución**: 
- Verifica que el ícono de notificaciones muestre "Conectado"
- Revisa permisos de notificaciones del navegador

### El producto no se publica después de aprobar

**Posibles causas**:
1. No seleccionaste ningún marketplace
2. Credenciales del marketplace no configuradas
3. Error en la publicación

**Solución**: 
- Verifica que seleccionaste al menos un marketplace
- Revisa las credenciales en API Settings
- Revisa los logs para ver el error específico

---

## 📝 NOTAS IMPORTANTES

1. **Ambiente**: Las publicaciones usan el ambiente configurado en tu Workflow Config (sandbox/production)

2. **Capital de Trabajo**: Asegúrate de tener suficiente capital antes de aprobar muchos productos

3. **Credenciales**: Verifica que las credenciales de los marketplaces estén configuradas y activas

4. **Notificaciones**: Mantén las notificaciones habilitadas para recibir alertas importantes

---

**Fecha de creación**: 2025-11-15  
**Versión**: 1.0  
**Última actualización**: 2025-11-15

