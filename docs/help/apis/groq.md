# 🔧 Configuración de GROQ AI API

**Última actualización:** 2025-01-11  
**Categoría:** IA (Generación de Contenido)  
**Requisito:** Opcional (mejora calidad de títulos y descripciones)

---

## 📋 ¿Para qué se usa en Ivan Reseller?

La integración con GROQ AI API permite:
- **Generar títulos** optimizados para productos usando IA
- **Generar descripciones** atractivas y optimizadas para SEO
- **Análisis estratégico** de oportunidades de negocio (CEO Agent)
- **Optimización de contenido** para mejorar conversión

**Módulos que la usan:**
- `backend/src/services/ceo-agent.service.ts` - Análisis estratégico con IA
- `backend/src/services/opportunity-finder.service.ts` - Generación de contenido
- `frontend/src/pages/APISettings.tsx` - Configuración en UI

**Nota:** Si no se configura, el sistema funcionará pero sin generación automática de contenido con IA.

---

## 🔑 Campos Requeridos

| Campo (UI) | Nombre en Backend | Tipo | Requerido | Descripción |
|------------|-------------------|------|-----------|-------------|
| API Key | `GROQ_API_KEY` | Password | ✅ Sí | API Key de GROQ (formato: `gsk_...`) |

**Ambientes:**
- ❌ No soporta ambientes (solo producción)

---

## 📝 Paso a Paso: Obtener Credenciales

### 1. Crear Cuenta en GROQ

1. Ir a [GROQ Console](https://console.groq.com/)
2. Hacer clic en **"Sign Up"** o **"Get Started"**
3. Completar registro con email y contraseña

### 2. Obtener API Key

1. Iniciar sesión en [GROQ Console](https://console.groq.com/)
2. Ir a **"API Keys"** o **"Settings"** → **"API Keys"**
3. Hacer clic en **"Create API Key"**
4. Copiar el API Key (formato: `gsk_...`)

**Documentación oficial:**
- [GROQ Console](https://console.groq.com/)
- [GROQ API Documentation](https://console.groq.com/docs)

---

## ⚙️ Paso a Paso: Configurar en Ivan Reseller

### 1. Acceder a Configuración de APIs

1. Iniciar sesión en Ivan Reseller
2. Ir a **"Configuración"** → **"APIs"** (o `/api-settings`)
3. Buscar la tarjeta **"GROQ AI API"**

### 2. Completar Campos

1. **API Key:** Pegar el API Key obtenido de GROQ

### 3. Guardar y Probar

1. Hacer clic en **"Guardar"**
2. Hacer clic en **"Probar Conexión"** (botón de prueba)

---

## ✅ Cómo Validar que Quedó Bien

### Verificación en UI:

1. **Estado de la API:**
   - En la tarjeta de GROQ AI, el estado debe mostrar **"Sesión activa"** (badge verde)

2. **Botón de Prueba:**
   - Hacer clic en **"Probar Conexión"**
   - Debe mostrar: **"✅ Conexión exitosa"** o mensaje similar

### Verificación Técnica:

**Endpoint de prueba:**
```bash
POST /api/api-credentials/groq/test
Headers: Authorization: Bearer <token>
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "API configurada correctamente",
  "data": {
    "apiName": "groq",
    "status": "healthy",
    "isConfigured": true,
    "isAvailable": true
  }
}
```

---

## 🚨 Errores Típicos y Soluciones

### Error 1: "API Key not found"

**Causa:** El API Key no está configurado o está vacío.

**Solución:**
- Verificar que el API Key esté completo (sin espacios)
- Verificar que se haya guardado correctamente

### Error 2: "Invalid API Key"

**Causa:** El API Key no es válido o ha expirado.

**Solución:**
- Verificar que el API Key sea correcto en GROQ Console
- Regenerar el API Key si es necesario

---

## 📚 Referencias

- **Documentación oficial:** [GROQ Console](https://console.groq.com/)
- **API Documentation:** [GROQ API Docs](https://console.groq.com/docs)

---

## 🔍 Notas Técnicas

- **Almacenamiento:** Las credenciales se guardan en la tabla `ApiCredential` encriptadas con AES-256-GCM
- **Encriptación:** Usa `ENCRYPTION_KEY` del backend
- **Uso:** Se usa para generación de contenido y análisis estratégico
- **Opcional:** Esta API es opcional; el sistema funciona sin ella pero sin generación automática de contenido

---

**Última actualización:** 2025-01-11  
**Mantenido por:** Equipo de Desarrollo Ivan Reseller

