# ✅ Integración de SerpAPI (Google Trends) en Sistema de Credenciales

**Fecha**: 2025-01-26  
**Objetivo**: Permitir que los usuarios configuren su API key de SerpAPI desde la interfaz web.

---

## 📍 DÓNDE CONFIGURAR LA API KEY

### **Opción 1: Desde la Interfaz Web (Recomendado)**

1. **Acceder a Configuración de APIs:**
   - URL: `http://localhost:5173/settings/apis` (o `/api-settings`)
   - O desde el menú: Settings → Configuración de APIs

2. **Buscar "Google Trends API (SerpAPI)":**
   - Nombre mostrado: **"Google Trends API (SerpAPI)"**
   - Icono: 📈

3. **Ingresar API Key:**
   - Campo: **"SerpAPI Key"**
   - Tipo: Contraseña (oculta por defecto)
   - Ejemplo: `abc123def456ghi789...`
   - **Opcional**: Si no se configura, el sistema usará análisis de datos internos

4. **Guardar:**
   - Click en **"Guardar"** o **"Save"**
   - El sistema validará y encriptará automáticamente la API key

### **Opción 2: Variables de Entorno (Fallback)**

Si no se configura desde la UI, el sistema buscará en variables de entorno:

```bash
# .env o variables de entorno del servidor
SERP_API_KEY=tu_api_key_aqui
# O alternativamente:
GOOGLE_TRENDS_API_KEY=tu_api_key_aqui
```

---

## 🔑 CÓMO OBTENER LA API KEY

1. **Registrarse en SerpAPI:**
   - URL: https://serpapi.com/users/sign_up
   - Crear cuenta (hay plan gratuito con límites)

2. **Obtener API Key:**
   - Ir a: https://serpapi.com/dashboard
   - Copiar tu API key (formato: `abc123def456...`)

3. **Documentación:**
   - Google Trends API: https://serpapi.com/google-trends-api
   - Dashboard: https://serpapi.com/dashboard

---

## 🎯 CÓMO FUNCIONA

### **Prioridad de Credenciales:**

1. **Primero:** Credenciales del usuario desde la base de datos (configuradas desde UI)
2. **Segundo:** Variables de entorno (`SERP_API_KEY` o `GOOGLE_TRENDS_API_KEY`)
3. **Tercero:** Fallback a análisis de datos internos (sin API externa)

### **Integración Automática:**

El sistema usa automáticamente la API key configurada cuando:

- Se buscan oportunidades de negocio (`/api/opportunities`)
- Se valida demanda real de productos (Google Trends)
- Se analiza viabilidad de productos con IA (`ai-opportunity.service.ts`)

---

## 📋 CONFIGURACIÓN TÉCNICA

### **Nombres de API Soportados:**

- `serpapi` (preferido)
- `googletrends` (alias, apunta al mismo tipo de credenciales)

### **Schema de Validación:**

```typescript
{
  apiKey: string; // Requerido, 1-500 caracteres
}
```

### **Campos Normalizados:**

- `SERP_API_KEY` → `apiKey`
- `GOOGLE_TRENDS_API_KEY` → `apiKey`

---

## ✅ VERIFICACIÓN

### **Desde la UI:**

1. Guarda tu API key
2. El estado debería cambiar a: ✅ **"Configurada y funcionando"**
3. Si hay error, verás: ❌ **"Error en configuración"**

### **Desde el Backend:**

```typescript
// El servicio automáticamente obtiene credenciales del usuario
const googleTrends = getGoogleTrendsService(userId); // userId del request
await googleTrends.validateProductViability(...);
```

---

## 🔒 SEGURIDAD

- ✅ API keys se encriptan automáticamente (AES-256-GCM)
- ✅ Solo el usuario propietario puede ver su API key
- ✅ Admins pueden ver credenciales globales
- ✅ Variables de entorno son fallback seguro

---

## 📝 NOTAS

- **Opcional:** Si no configuras SerpAPI, el sistema funcionará con análisis de datos internos
- **Recomendado:** Configurar SerpAPI para validaciones más precisas de demanda real
- **Límites:** Plan gratuito de SerpAPI tiene límites de requests (verificar en su dashboard)

---

## 🐛 SOLUCIÓN DE PROBLEMAS

### **"API key no configurada":**
- Verifica que guardaste la API key correctamente
- Verifica que no está vacía o con espacios
- Revisa los logs del servidor para más detalles

### **"API key con formato inválido":**
- Asegúrate de copiar la API key completa
- No incluyas espacios al inicio o final
- Verifica que sea alfanumérica (puede incluir guiones y guiones bajos)

### **"Error validando con Google Trends":**
- Verifica que tu API key sea válida en SerpAPI
- Verifica que tengas créditos disponibles en tu plan
- Revisa los logs del servidor para detalles del error

---

**✅ La integración está completa y lista para usar.**

