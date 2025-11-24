# 📘 Guía Paso a Paso: Configurar Aplicación en MercadoLibre Developers

**Última actualización:** 2025-01-27  
**Basado en:** Pantallas reales de developers.mercadolibre.cl

---

## 🎯 Objetivo

Crear una aplicación en MercadoLibre Developers para obtener las credenciales (Client ID y Client Secret) necesarias para integrar Ivan Reseller con MercadoLibre.

---

## 📋 Requisitos Previos

- ✅ Cuenta de MercadoLibre (puedes usar tu cuenta de Google si está vinculada)
- ✅ Acceso a internet
- ✅ Tener listo el Redirect URI: `https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre`

---

## 🚀 PASO A PASO COMPLETO

### **PASO 1: Acceder a MercadoLibre Developers**

1. Abre tu navegador y ve a: **https://developers.mercadolibre.cl/**
2. Si no estás logueado, haz clic en **"Ingresar"** o **"Iniciar sesión"**
3. Inicia sesión con tu cuenta de MercadoLibre (o con Google si está vinculada)

---

### **PASO 2: Ir a Crear Nueva Aplicación**

**Opción A - Enlace directo (RECOMENDADO):**
- Ve directamente a: **https://developers.mercadolibre.cl/devcenter/create-app**

**Opción B - Desde el menú:**
- Si ves el menú "Mis aplicaciones", haz clic ahí
- Luego haz clic en "Crear nueva aplicación"

---

### **PASO 3: Completar Información Básica**

Verás el formulario: **"¿Qué solución planeas desarrollar?"**

#### **3.1. Nombre*** (Campo obligatorio)
- **Ejemplo:** `Ivan Reseller - Mi Negocio`
- **Descripción:** Nombre completo y descriptivo de tu aplicación
- **Recomendación:** Usa un nombre que identifique claramente tu negocio

#### **3.2. Nombre corto*** (Campo obligatorio)
- **Ejemplo:** `ivan-reseller-negocio`
- **Reglas:**
  - Sin espacios
  - Solo letras, números y guiones (-)
  - No usar caracteres especiales
- **Descripción:** Identificador corto único para tu aplicación

#### **3.3. Descripción*** (Campo obligatorio)
- **Ejemplo:** `Aplicación para gestión de productos y ventas en MercadoLibre mediante dropshipping automatizado`
- **Descripción:** Explica brevemente qué hace tu aplicación
- **Recomendación:** Sé claro y específico

#### **3.4. Logo** (Campo opcional)
- **Formato:** PNG
- **Tamaño máximo:** 1MB
- **Descripción:** Logo de tu aplicación o negocio
- **Nota:** Puedes dejarlo vacío y agregarlo después

#### **3.5. Continuar**
- Haz clic en el botón azul **"Continuar"** (esquina inferior derecha)

---

### **PASO 4: Configurar Redirect URI**

En la pantalla **"Configuración y scopes"**, busca la sección **"Redirect URI *"**:

1. **Haz clic en el campo "Redirect URI"**
2. **Pega exactamente esta URL:**
   ```
   https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre
   ```
3. **Verificaciones importantes:**
   - ✅ Debe empezar con `https://` (no `http://`)
   - ✅ Debe ser `www.ivanreseller.com` (NO uses `ivan-reseller-web.vercel.app`)
   - ✅ Debe terminar en `/api/marketplace-oauth/oauth/callback/mercadolibre`
   - ✅ NO debe tener espacios al inicio o final
4. **Si hay campos adicionales vacíos:**
   - Puedes eliminarlos con el ícono de basura 🗑️
   - O dejarlos vacíos si el sistema lo permite
5. **Si necesitas agregar más Redirect URIs:**
   - Haz clic en **"Agregar Redirect URI"**
   - Pero para nuestro caso, solo necesitas uno

---

### **PASO 5: Configurar Integración**

En la misma pantalla, busca la sección **"Integración"**:

**Texto:** "Elige las unidades de negocio que quieres integrar en tu aplicación."

1. **Marca al menos:**
   - ☑️ **Mercado Libre** (OBLIGATORIO para nuestro caso)

2. **Opcional:**
   - ☐ **Vtex** (solo si también usas Vtex)

⚠️ **IMPORTANTE:** Si no marcas "Mercado Libre", verás un error en rojo:
> "Selecciona mínimo una unidad de negocio."

**Solución:** Marca la casilla de "Mercado Libre"

---

### **PASO 6: Configurar Permisos**

En la sección **"Permisos"**, verás múltiples categorías. Para cada una, debes seleccionar un nivel de acceso usando el dropdown a la derecha.

**Texto:** "Revisa los permisos disponibles para integrar en tu aplicación y selecciona el tipo de acceso que quieres dar a cada uno..."

#### **6.1. Permisos Recomendados para Ivan Reseller:**

| Categoría | Nivel Recomendado | ¿Por qué? |
|-----------|-------------------|-----------|
| **Usuarios** | "Lectura y escritura" | Para gestionar perfil y datos del vendedor |
| **Publicaciones y ofertas/ventas** | "Lectura y escritura" | Para publicar productos y gestionar ofertas |
| **Ventas y envíos de un producto** | "Lectura y escritura" | Para gestionar pedidos y envíos |
| **Comunicaciones y preguntas** | "Lectura y escritura" | Para responder mensajes de clientes |
| **Publicidad de un producto** | "De solo lectura" | Para ver información de publicidad (opcional) |
| **Facturación de una cuenta** | "De solo lectura" | Para ver información de facturación (opcional) |
| **Métricas del negocio** | "De solo lectura" | Para ver estadísticas y reportes |
| **Promociones, cupones y descuentos** | "Lectura y escritura" | Para gestionar promociones (opcional) |

#### **6.2. Cómo Configurar:**

Para cada categoría:
1. Busca el dropdown a la derecha
2. Haz clic en él
3. Selecciona el nivel de acceso recomendado
4. Repite para todas las categorías

⚠️ **IMPORTANTE:** Si no seleccionas al menos una opción para cada permiso, verás un error en rojo:
> "Selecciona al menos una opción para cada permiso."

**Solución:** Asegúrate de que todos los dropdowns tengan una opción seleccionada

---

### **PASO 7: Configurar Topics (Opcional)**

La sección **"Topics"** contiene secciones expandibles para notificaciones:

- **Orders** (Pedidos)
- **Messages** (Mensajes)
- **Prices** (Precios)
- **Items** (Artículos)
- **Catalog** (Catálogo)
- **Shipments** (Envíos)
- **Promotions** (Promociones)
- **VIB Leads** (Leads)
- **Post Purchase** (Post-compra)
- **Others** (Otros)

**Para Ivan Reseller básico:**
- Puedes dejar los valores por defecto
- O expandir cada sección y configurar según necesites

**Nota:** Esto es opcional y puedes configurarlo después de crear la aplicación.

---

### **PASO 8: Configurar Notificaciones (Opcional)**

En la sección **"Configuración de notificaciones"**:

- **Campo:** "Notificaciones callback URL"
- **Valor:** Puedes dejarlo vacío por ahora
- **Descripción:** URL donde MercadoLibre enviará notificaciones de eventos (pedidos, mensajes, etc.)

**Nota:** Esto es opcional. Puedes configurarlo después si necesitas recibir notificaciones en tiempo real.

---

### **PASO 9: Crear la Aplicación**

1. **Revisa que todo esté completo:**
   - ✅ Redirect URI configurado correctamente
   - ✅ Integración "Mercado Libre" marcada
   - ✅ Todos los permisos tienen una opción seleccionada

2. **Haz clic en el botón azul:**
   - **"Continuar"** o **"Crear aplicación"** (dependiendo de la pantalla)

3. **Si hay errores:**
   - Revisa los mensajes en rojo
   - Corrige los campos indicados
   - Vuelve a intentar

---

### **PASO 10: Obtener Credenciales**

Después de crear la aplicación exitosamente, verás una pantalla con:

#### **10.1. App ID (Client ID)**
- **Ejemplo:** `1234567890123456`
- **Ubicación:** Generalmente en la parte superior de la página
- **Acción:** **COPIA ESTE VALOR** - Lo necesitarás para Ivan Reseller

#### **10.2. Secret Key (Client Secret)**
- **Ejemplo:** `abcdefghijklmnopqrstuvwxyz123456`
- **Ubicación:** Generalmente debajo del App ID
- **Acción:** **COPIA ESTE VALOR** - Lo necesitarás para Ivan Reseller
- ⚠️ **IMPORTANTE:** Este valor solo se muestra UNA VEZ. Si lo pierdes, tendrás que regenerarlo.

#### **10.3. Guardar las Credenciales**
- **Recomendación:** Guarda ambos valores en un lugar seguro (notas, documento, gestor de contraseñas)
- **No compartas estas credenciales** con nadie que no deba tener acceso

---

### **PASO 11: Configurar en Ivan Reseller**

1. **Abre Ivan Reseller:**
   - Ve a: **ivanreseller.com/login**
   - Inicia sesión con tus credenciales

2. **Navega a Configuración de APIs:**
   - Menú lateral → **Settings** → **Configuración de APIs**
   - O directamente: **Settings** → Busca la sección de APIs

3. **Busca la tarjeta "MercadoLibre API":**
   - Debería estar en la lista de APIs disponibles

4. **Completa los campos:**
   - **Client ID (App ID):** Pega el App ID copiado en el Paso 10
   - **Client Secret:** Pega el Secret Key copiado en el Paso 10

5. **Guarda la configuración:**
   - Haz clic en **"Guardar Configuración"** o **"Save Configuration"**
   - El sistema encriptará y guardará las credenciales

---

### **PASO 12: Autorizar con OAuth**

1. **En la misma tarjeta de MercadoLibre API:**
   - Busca el botón **"Autorizar con MercadoLibre"** o **"OAuth"**
   - Haz clic en él

2. **Se abrirá una nueva ventana/pestaña:**
   - Verás la página oficial de MercadoLibre
   - Te mostrará los permisos que la aplicación solicita

3. **Revisa los permisos:**
   - Deberías ver los permisos que configuraste en el Paso 6
   - Revisa que sean los correctos

4. **Autoriza la aplicación:**
   - Haz clic en **"Autorizar"** o **"Aceptar"** o **"I Agree"**
   - MercadoLibre procesará la autorización

5. **Redirección automática:**
   - MercadoLibre te redirigirá de vuelta a Ivan Reseller
   - El sistema intercambiará el código de autorización por tokens

6. **Verificación:**
   - El estado de MercadoLibre API debería cambiar a **"Sesión activa"** ✅
   - Si ves un error, revisa que el Redirect URI sea correcto

---

## ✅ Verificación Final

Después de completar todos los pasos, deberías tener:

- ✅ Aplicación creada en MercadoLibre Developers
- ✅ App ID (Client ID) guardado
- ✅ Secret Key (Client Secret) guardado
- ✅ Credenciales configuradas en Ivan Reseller
- ✅ OAuth completado
- ✅ Estado: "Sesión activa" en Ivan Reseller

---

## 🚨 Solución de Problemas Comunes

### **Error: "Selecciona mínimo una unidad de negocio"**
**Causa:** No marcaste "Mercado Libre" en la sección Integración  
**Solución:** Marca la casilla ☑️ "Mercado Libre"

### **Error: "Selecciona al menos una opción para cada permiso"**
**Causa:** Alguna categoría de permisos no tiene un nivel de acceso seleccionado  
**Solución:** Revisa todos los dropdowns de permisos y asegúrate de que cada uno tenga una opción seleccionada

### **Error: "Redirect URI no válido" o OAuth falla**
**Causa:** El Redirect URI no coincide exactamente  
**Solución:** 
- Verifica que sea exactamente: `https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/mercadolibre`
- No debe tener espacios
- Debe empezar con `https://`
- Debe ser `www.ivanreseller.com` (no vercel.app ni otros dominios)

### **No veo "Mis aplicaciones" en el menú**
**Solución:** 
- Usa el enlace directo: https://developers.mercadolibre.cl/devcenter/create-app
- O ve a: https://developers.mercadolibre.cl/applications

### **El Secret Key desapareció y no lo guardé**
**Solución:**
- Ve a tu aplicación en developers.mercadolibre.cl/applications
- Busca la opción para regenerar o ver el Secret Key
- ⚠️ Algunas veces tendrás que regenerarlo completamente

---

## 📝 Notas Importantes

1. **Redirect URI:** Debe coincidir EXACTAMENTE con el configurado en MercadoLibre. Cualquier diferencia (espacios, http vs https, dominio incorrecto) causará que OAuth falle.

2. **Permisos:** Selecciona solo los permisos que realmente necesitas. Más permisos = más responsabilidad de seguridad.

3. **Secret Key:** Guárdalo de forma segura. Si lo pierdes, tendrás que regenerarlo y reconfigurar en Ivan Reseller.

4. **Tokens:** Los Access Token y Refresh Token se renuevan automáticamente. No necesitas gestionarlos manualmente.

5. **Dominio:** Si tu sistema está en otro dominio (no www.ivanreseller.com), usa ese dominio en el Redirect URI.

---

## 🔗 Enlaces Útiles

- **Crear aplicación:** https://developers.mercadolibre.cl/devcenter/create-app
- **Ver mis aplicaciones:** https://developers.mercadolibre.cl/applications
- **Documentación oficial:** https://developers.mercadolibre.com.ar/es_ar/autenticacion-y-autorizacion
- **Soporte MercadoLibre:** developers@mercadolibre.com

---

**¿Necesitas ayuda?** Revisa la sección de solución de problemas o contacta al soporte de Ivan Reseller.

