# 🔑 Guía: Configurar APIs de Google Trends y PayPal

## 📍 Dónde Configurar las APIs

### **Ubicación en la Interfaz Web:**

```
1. Login → http://localhost:5173/login
   ↓
2. Dashboard → http://localhost:5173/dashboard  
   ↓
3. Ir a: "API Settings" o "Configuración de APIs"
   ↓
   URL Directa: http://localhost:5173/api-settings
```

**Ruta desde el menú:**
- Menú lateral → **"Settings"** (⚙️) → **"API Configuration"**
- O directamente: **"API Settings"** en el menú

---

## 🔐 Configuración de PayPal

### **Paso 1: Obtener Credenciales de PayPal**

1. Ve a [PayPal Developer](https://developer.paypal.com/)
2. Inicia sesión con tu cuenta PayPal
3. Crea una aplicación:
   - **Sandbox (Testing):** https://developer.paypal.com/dashboard/applications/sandbox
   - **Production (Real):** https://developer.paypal.com/dashboard/applications/live

4. Obtén las credenciales:
   - **Client ID** (ejemplo: `AYSq3RDGsmBLJE-...`)
   - **Client Secret** (ejemplo: `EGnHDxD_qRPOmeKm-...`)

### **Paso 2: Configurar en el Sistema**

1. Ve a **API Settings** (`/api-settings`)
2. Busca la sección **"PayPal Payouts"** 💳
3. Completa los campos:

   ```
   Client ID: [Pega tu Client ID aquí]
   Client Secret: [Pega tu Client Secret aquí]
   Mode: [Selecciona: "sandbox" o "live"]
   ```

4. Haz clic en **"Guardar"**
5. Haz clic en **"Test"** para verificar que funciona

### **Características de PayPal:**
- ✅ Valida saldo disponible antes de compras automáticas
- ✅ Soporta sandbox (testing) y production (real)
- ✅ Usa credenciales del usuario (cada usuario tiene sus propias credenciales)
- ✅ Fallback a variables de entorno si no hay credenciales de usuario

### **Permisos Requeridos:**
Para validar saldo real, tu aplicación PayPal necesita el permiso:
- `wallet:read` (Wallet API)

Si no tienes este permiso, el sistema usa validación de capital de trabajo como fallback.

---

## 📈 Configuración de Google Trends (SerpAPI)

### **Paso 1: Obtener API Key de SerpAPI**

**Nota:** Google Trends API no tiene una API oficial pública gratuita. Usamos SerpAPI como proveedor.

1. Ve a [SerpAPI](https://serpapi.com/)
2. Crea una cuenta (o inicia sesión)
3. Ve al Dashboard: https://serpapi.com/dashboard
4. Copia tu **API Key**

**Costo:** 
- Plan gratuito: 100 búsquedas/mes
- Plan pago: Desde $50/mes para más búsquedas

### **Paso 2: Configurar en el Sistema**

1. Ve a **API Settings** (`/api-settings`)
2. Busca la sección **"Google Trends API (SerpAPI)"** 📈
3. Completa el campo:

   ```
   SerpAPI Key: [Pega tu API Key aquí]
   ```

4. Haz clic en **"Guardar"**

**⚠️ IMPORTANTE:** Esta API es **OPCIONAL**
- Si **NO** la configuras: El sistema usa análisis de datos internos (productos existentes, ventas, etc.)
- Si **SÍ** la configuras: El sistema usa datos reales de Google Trends para validar productos

### **Fallback Automático:**
El sistema funciona perfectamente sin SerpAPI usando:
- Datos de productos similares en la base de datos
- Análisis de tendencias basado en ventas reales
- Estadísticas de búsqueda de categorías

---

## 🔄 Cómo el Sistema Usa las Credenciales

### **PayPal:**

1. **Prioridad 1:** Credenciales del usuario (desde base de datos, configuradas en `/api-settings`)
2. **Prioridad 2:** Variables de entorno (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT`)

**Uso:**
- Validación de saldo antes de compras automáticas
- Pago de comisiones automáticas
- Verificación de disponibilidad de fondos

### **Google Trends:**

1. **Prioridad 1:** API Key de SerpAPI (desde base de datos, configurada en `/api-settings`)
2. **Prioridad 2:** Variable de entorno (`SERP_API_KEY` o `GOOGLE_TRENDS_API_KEY`)
3. **Fallback:** Análisis de datos internos (si no está configurado)

**Uso:**
- Validar viabilidad de productos antes de sugerirlos
- Ajustar confianza de oportunidades basado en tendencias reales
- Mejorar calidad de recomendaciones de IA

---

## 🛡️ Seguridad

### **Encriptación:**
- ✅ Todas las credenciales se guardan **encriptadas** (AES-256-GCM)
- ✅ Solo el usuario propietario puede ver sus credenciales
- ✅ Las credenciales nunca se muestran completas en logs

### **PayPal:**
- ✅ Credenciales **personales** (cada usuario tiene las suyas)
- ✅ No se pueden compartir entre usuarios

### **Google Trends:**
- ✅ Opcional (no requerido para funcionamiento básico)
- ✅ Puede ser personal o compartido (según configuración de scope)

---

## 📋 Resumen Rápido

| API | Dónde Configurar | Requerida | Dónde Obtener |
|-----|------------------|-----------|---------------|
| **PayPal** | `/api-settings` → Sección "PayPal Payouts" | ✅ Sí (para compras automáticas) | https://developer.paypal.com/ |
| **Google Trends** | `/api-settings` → Sección "Google Trends API (SerpAPI)" | ❌ No (opcional) | https://serpapi.com/ |

---

## 🎯 Verificación

### **PayPal:**
1. Guarda las credenciales
2. Haz clic en **"Test"**
3. Deberías ver: ✅ **"API configurada correctamente"**

### **Google Trends:**
1. Guarda el API Key
2. El sistema validará automáticamente cuando se use
3. Si no funciona, el sistema usará fallback automáticamente (no rompe funcionalidad)

---

## 📞 Soporte

Si tienes problemas:
1. Verifica que las credenciales sean correctas
2. Verifica que los permisos de PayPal estén configurados
3. Revisa los logs del sistema para más detalles
4. El sistema tiene fallbacks automáticos, no se rompe si falta configuración

---

**Última actualización:** 2025-01-28

