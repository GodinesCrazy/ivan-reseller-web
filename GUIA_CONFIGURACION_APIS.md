# 🔑 GUÍA COMPLETA: CONFIGURACIÓN DE APIs

## 📍 CÓMO ACCEDER A LA CONFIGURACIÓN DE APIs

### **Paso 1: Ingresar al Sistema**
1. **Abrir navegador:** Chrome, Firefox, Edge o Safari
2. **URL:** `http://localhost:5173`
3. **Credenciales:**
   ```
   Email:    admin@ivanreseller.com
   Password: admin123
   ```

### **Paso 2: Ir a Configuración**
Una vez dentro del sistema, tienes **2 formas** de acceder:

#### **Opción A - Desde el Menú Lateral:**
1. Haz clic en **"Settings"** (⚙️) en el menú de la izquierda
2. En la página de Settings, haz clic en **"Configuración de APIs"**

#### **Opción B - URL Directa:**
```
http://localhost:5173/settings/apis
```

---

## 🎯 INTERFAZ DE CONFIGURACIÓN

Verás tarjetas para cada API/servicio con:

### **📊 Información Visible:**
- ✅ Estado (Configurada / No configurada / Error)
- 📅 Último uso
- 📈 Requests de hoy
- 🎯 Límite diario

### **🔐 Campos de Configuración:**
Cada API tiene sus propios campos requeridos:

#### **1. eBay API**
```
App ID (Client ID)      [texto]
Dev ID                  [texto]
Cert ID (Secret)        [contraseña] 
Auth Token              [contraseña] (opcional)
```

#### **2. Amazon API**
```
Access Key ID           [texto]
Secret Access Key       [contraseña]
Marketplace ID          [texto]
Seller ID               [texto]
```

#### **3. MercadoLibre API**
```
Client ID               [texto]
Client Secret           [contraseña]
Access Token            [contraseña] (opcional)
Refresh Token           [contraseña] (opcional)
```

#### **4. GROQ AI API** (Para CEO Agent)
```
API Key                 [contraseña]
```

#### **5. ScraperAPI** (Para scraping anti-detección)
```
API Key                 [contraseña]
```

#### **6. ZenRows API** (Para scraping avanzado)
```
API Key                 [contraseña]
```

#### **7. 2Captcha** (Para resolver captchas)
```
API Key                 [contraseña]
```

#### **8. PayPal API** (Para pagos)
```
Client ID               [texto]
Client Secret           [contraseña]
```

---

## 🔒 SEGURIDAD

### **Encriptación Automática:**
- ✅ Todas las credenciales se encriptan con **AES-256-GCM**
- ✅ Las claves se almacenan de forma segura en la base de datos
- ✅ No se pueden visualizar después de guardadas (solo editar)

### **Botón de Visibilidad:**
- 👁️ **Ícono de ojo:** Muestra/oculta temporalmente la contraseña mientras la escribes
- 🔒 Después de guardar, las contraseñas no son visibles por seguridad

---

## ✅ CÓMO CONFIGURAR UNA API

### **Pasos:**

1. **Localiza la tarjeta** de la API que quieres configurar
   
2. **Completa los campos:**
   - Los campos marcados con `*` son **obligatorios**
   - Los campos sin `*` son opcionales

3. **Haz clic en "Guardar Configuración"**
   - Verás un spinner "Guardando..."
   - Recibirás confirmación: "API configurada exitosamente"

4. **El estado cambiará** de "No configurada" a "Configurada" ✅

### **Ejemplo - Configurar GROQ AI:**

1. Ir a la tarjeta **"GROQ AI API"**
2. Pegar tu API Key en el campo:
   ```
   gsk_tu_clave_de_groq_aqui
   ```
3. Clic en **"Guardar Configuración"**
4. ✅ ¡Listo! El CEO Agent y AI Learning ya pueden usar IA

---

## 🎯 PRIORIDAD DE CONFIGURACIÓN

### **🟢 ESENCIALES (Para empezar):**
```
✅ Ya configurado - JWT_SECRET (autenticación)
✅ Ya configurado - DATABASE (base de datos)
```

### **🟡 RECOMENDADAS (Para funcionalidad completa):**

#### **Para usar CEO Agent y AI Learning:**
```
1. GROQ AI API          ← IA estratégica
```

#### **Para publicar productos:**
```
2. MercadoLibre API     ← Marketplace principal
   O
3. eBay API             ← Marketplace alternativo
   O
4. Amazon API           ← Marketplace premium
```

### **🔵 OPCIONALES (Para funciones avanzadas):**

#### **Para Autopilot System 24/7:**
```
5. ScraperAPI           ← Anti-detección
6. 2Captcha             ← Resolver captchas
7. ZenRows API          ← Scraping avanzado
```

#### **Para pagos:**
```
8. PayPal API           ← Procesar pagos
```

---

## 📚 DÓNDE OBTENER LAS API KEYS

### **GROQ AI (Gratis):**
🔗 https://console.groq.com/keys
- Crear cuenta gratuita
- Generar API Key
- Copiar y pegar en el sistema

### **MercadoLibre:**
🔗 https://developers.mercadolibre.com/
- Crear aplicación
- Obtener Client ID y Client Secret
- Configurar redirect URL

### **eBay:**
🔗 https://developer.ebay.com/
- Crear cuenta de desarrollador
- Obtener keyset (App ID, Dev ID, Cert ID)
- Generar token de usuario

### **Amazon:**
🔗 https://developer.amazonservices.com/
- Registrarse como vendedor
- Solicitar acceso a SP-API
- Generar credenciales LWA

### **ScraperAPI:**
🔗 https://www.scraperapi.com/
- Plan gratuito: 5,000 requests/mes
- Obtener API Key del dashboard

### **2Captcha:**
🔗 https://2captcha.com/
- Crear cuenta
- Recargar saldo (desde $3 USD)
- Copiar API Key

### **ZenRows:**
🔗 https://www.zenrows.com/
- Plan gratuito: 1,000 requests/mes
- Obtener API Key

### **PayPal:**
🔗 https://developer.paypal.com/
- Crear aplicación
- Obtener Client ID y Secret
- Sandbox para pruebas

---

## 🚀 FLUJO COMPLETO DE CONFIGURACIÓN

### **Para Probar el Sistema:**
```
1. Login → http://localhost:5173
2. Email: admin@ivanreseller.com
3. Password: admin123
4. ✅ Ya puedes navegar por todas las secciones
```

### **Para Usar IA (CEO Agent + AI Learning):**
```
1. Obtener GROQ API Key (gratis)
2. Settings → Configuración de APIs
3. Buscar "GROQ AI API"
4. Pegar API Key
5. Guardar
6. ✅ Sistema de IA activado
```

### **Para Publicar Productos:**
```
1. Obtener credenciales de MercadoLibre
2. Settings → Configuración de APIs
3. Buscar "MercadoLibre API"
4. Completar Client ID y Client Secret
5. Guardar
6. Ir a Products → Crear producto
7. ✅ Publicar automáticamente
```

### **Para Sistema Autopilot 24/7:**
```
1. Configurar GROQ AI ✓
2. Configurar MercadoLibre ✓
3. Configurar ScraperAPI
4. Configurar 2Captcha
5. Ir a "Autopilot"
6. Activar sistema
7. ✅ Operación autónoma activada
```

---

## ❓ PREGUNTAS FRECUENTES

### **¿Debo configurar TODAS las APIs?**
No. Solo configura las que necesites según tu objetivo:
- **Probar sistema:** Ninguna API adicional
- **Usar IA:** Solo GROQ
- **Vender productos:** Solo marketplace (MercadoLibre/eBay/Amazon)
- **Autopilot completo:** Todas las recomendadas

### **¿Puedo cambiar las APIs después?**
Sí. Puedes editar o reconfigurar cualquier API en cualquier momento desde Settings.

### **¿Qué pasa si pongo una API Key incorrecta?**
El sistema mostrará estado "Error" y podrás corregirla editando la configuración.

### **¿Las APIs caducan?**
Depende del servicio:
- GROQ: No caduca
- MercadoLibre: Access Token caduca (se renueva automáticamente con Refresh Token)
- eBay: Auth Token puede caducar (generar nuevo)
- PayPal: No caduca

### **¿Puedo ver las APIs que ya guardé?**
Por seguridad, las credenciales no se muestran después de guardadas. Solo puedes editarlas (sobrescribirlas).

---

## 🎉 RESUMEN RÁPIDO

```
1. Login: http://localhost:5173
   └─ admin@ivanreseller.com / admin123

2. Menu → Settings → Configuración de APIs

3. Para cada API:
   ├─ Completar campos requeridos (*)
   ├─ Guardar configuración
   └─ ✅ Estado: Configurada

4. Funcionalidades desbloqueadas:
   ├─ GROQ → CEO Agent + AI Learning
   ├─ Marketplace → Publicar productos
   └─ Scraping → Autopilot 24/7
```

---

## 🔥 CONFIGURACIÓN EXPRESS (5 minutos)

### **Solo para usar IA:**
```bash
1. Ir a https://console.groq.com/keys
2. Crear cuenta + Generar API Key
3. Login en sistema → Settings → APIs
4. GROQ AI API → Pegar key → Guardar
5. ✅ LISTO - IA activada
```

---

**¿Necesitas ayuda con alguna API específica?** 🚀
