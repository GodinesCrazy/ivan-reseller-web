# 🔍 AUDITORÍA COMPLETA: OpenAI API

**Fecha**: 2025-12-11  
**Objetivo**: Auditar la consistencia y el correcto flujo de configuración y lógica de la API de OpenAI, especialmente en la validación de credenciales y el manejo de variables de entorno vs. CredentialsManager.

---

## 📋 RESUMEN DE HALLAZGOS Y CORRECCIONES

### 1. Problema Identificado

**OpenAI API no tenía método `checkOpenAIAPI`**:
- La API estaba definida en los schemas de Zod (`backend/src/services/credentials-manager.service.ts`)
- Estaba configurada en el frontend (`frontend/src/pages/APISettings.tsx`)
- Tenía definición en `api-keys.config.ts`
- **PERO** no tenía un método de validación en `api-availability.service.ts`
- Esto causaba que el estado de OpenAI no se mostrara correctamente en el frontend
- **Nota**: El sistema actualmente usa GROQ como proveedor principal de AI, pero OpenAI está disponible como alternativa

### 2. Correcciones Aplicadas

#### 2.1 Backend (`backend/src/services/api-availability.service.ts`)

**Implementado `checkOpenAIAPI`**:
- ✅ Validación de campo requerido: `apiKey`
- ✅ Validación de formato de API Key (debe empezar con `sk-` y tener al menos 20 caracteres)
- ✅ Soporte dual: primero intenta obtener credenciales de CredentialsManager, luego verifica variables de entorno
- ✅ Soporte para múltiples variantes de nombres de campos (camelCase y UPPER_CASE)
- ✅ Campos opcionales: `organization` y `model` (se muestran en el mensaje si están presentes)
- ✅ Manejo de errores robusto
- ✅ Caché para optimizar rendimiento

**Código implementado**:
```typescript
async checkOpenAIAPI(userId: number, forceRefresh: boolean = false): Promise<APIStatus> {
  // Intentar obtener credenciales de CredentialsManager
  let credentials = await this.getUserCredentials(userId, 'openai', 'production').catch(() => null);
  
  // Si no hay credenciales en la BD, verificar variables de entorno
  if (!credentials) {
    const hasEnvApiKey = !!(process.env.OPENAI_API_KEY);
    
    if (hasEnvApiKey) {
      credentials = {
        apiKey: process.env.OPENAI_API_KEY || '',
        organization: process.env.OPENAI_ORGANIZATION,
        model: process.env.OPENAI_MODEL,
      };
    }
  }
  
  // Validación de formato
  if (hasApiKey) {
    const apiKeyStr = String(apiKey).trim();
    if (!apiKeyStr.startsWith('sk-')) {
      apiKeyValid = false;
      apiKeyError = 'API Key debe empezar con "sk-"';
    } else if (apiKeyStr.length < 20) {
      apiKeyValid = false;
      apiKeyError = 'API Key parece ser demasiado corta';
    }
  }
}
```

**Integrado en `getAllAPIStatus`**:
- ✅ Agregado a `simpleChecks` (ejecuta en paralelo con otras APIs simples)
- ✅ Agregado al array de retorno de statuses

#### 2.2 Backend (`backend/src/services/credentials-manager.service.ts`)

**Normalización de credenciales de OpenAI**:
- ✅ Conversión de UPPER_CASE a camelCase:
  - `OPENAI_API_KEY` → `apiKey`
  - `OPENAI_ORGANIZATION` → `organization`
  - `OPENAI_MODEL` → `model`
- ✅ Trim de todos los campos string

**Código implementado**:
```typescript
// ✅ OpenAI API normalization
if (apiName === 'openai') {
  // Normalize field names from UPPER_CASE to camelCase
  if (creds.OPENAI_API_KEY && !creds.apiKey) creds.apiKey = creds.OPENAI_API_KEY;
  if (creds.OPENAI_ORGANIZATION && !creds.organization) creds.organization = creds.OPENAI_ORGANIZATION;
  if (creds.OPENAI_MODEL && !creds.model) creds.model = creds.OPENAI_MODEL;
  
  // Trim string fields
  if (creds.apiKey && typeof creds.apiKey === 'string') {
    creds.apiKey = creds.apiKey.trim();
  }
  // ... más trims
}
```

#### 2.3 Backend (`backend/src/api/routes/api-credentials.routes.ts`)

**Agregado caso de OpenAI en endpoint `/api/credentials/status`**:
- ✅ Agregado `case 'openai':` en el switch statement
- ✅ Llama a `apiAvailability.checkOpenAIAPI(userId)`

#### 2.4 Frontend (`frontend/src/pages/APISettings.tsx`)

**Agregado mapeo de campos de OpenAI**:
- ✅ Mapeo de `OPENAI_API_KEY` → `apiKey`
- ✅ Mapeo de `OPENAI_ORGANIZATION` → `organization`
- ✅ Mapeo de `OPENAI_MODEL` → `model`

---

## ✅ RESULTADO FINAL

### Antes
- ❌ OpenAI no tenía método de validación
- ❌ El estado de OpenAI no se mostraba en el frontend
- ❌ No había validación de formato de API Key
- ❌ No había normalización de campos

### Después
- ✅ OpenAI tiene método `checkOpenAIAPI` completo
- ✅ El estado de OpenAI se muestra correctamente en el frontend
- ✅ Validación de formato de API Key (sk-...)
- ✅ Normalización completa de campos (camelCase + UPPER_CASE)
- ✅ Soporte dual: CredentialsManager + variables de entorno
- ✅ Compatibilidad hacia atrás mantenida (funciona con variables de entorno)

---

## 📝 CONFIGURACIÓN

### Campos Requeridos

- `apiKey`: OpenAI API Key (ej: `sk-...`)
- `organization`: Organization ID (opcional, ej: `org-...`)
- `model`: Modelo a usar (opcional, ej: `gpt-4`, `gpt-3.5-turbo`)

### Validaciones Implementadas

1. **Formato de API Key**:
   - Debe empezar con `sk-`
   - Debe tener al menos 20 caracteres de longitud
   - Ejemplo válido: `sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

2. **Campos Requeridos**:
   - `apiKey` es obligatorio
   - `organization` y `model` son opcionales

---

## 🔄 COMPATIBILIDAD

### Orden de Búsqueda de Credenciales

1. **CredentialsManager** (Base de datos):
   - Busca credenciales guardadas para el usuario
   - Prioridad si existen

2. **Variables de Entorno** (Fallback):
   - `OPENAI_API_KEY` (requerido)
   - `OPENAI_ORGANIZATION` (opcional)
   - `OPENAI_MODEL` (opcional)

### Nombres de Campos Soportados

El sistema acepta múltiples variantes de nombres de campos para máxima compatibilidad:

**API Key**:
- `apiKey` (camelCase, preferido)
- `OPENAI_API_KEY` (UPPER_CASE, legacy)

**Organization**:
- `organization` (camelCase, preferido)
- `OPENAI_ORGANIZATION` (UPPER_CASE, legacy)

**Model**:
- `model` (camelCase, preferido)
- `OPENAI_MODEL` (UPPER_CASE, legacy)

---

## 🤖 USO ACTUAL DEL SISTEMA

**Nota Importante**: El sistema actualmente usa **GROQ** como proveedor principal de AI para:
- Generación de sugerencias de AI
- Análisis de oportunidades
- CEO Agent insights

**OpenAI está disponible como alternativa** si se prefiere usar GPT-4 o GPT-3.5-turbo en lugar de GROQ.

### Modelos Recomendados

- **GPT-4 Turbo**: Más preciso, mejor para análisis complejos
- **GPT-3.5-turbo**: Más rápido y económico, bueno para tareas generales
- **GPT-4**: Máxima precisión, más caro

---

## 💰 COSTOS

- **GPT-4 Turbo**: ~$0.01 por 1K tokens de entrada, ~$0.03 por 1K tokens de salida
- **GPT-3.5-turbo**: ~$0.0005 por 1K tokens de entrada, ~$0.0015 por 1K tokens de salida
- **GPT-4**: ~$0.03 por 1K tokens de entrada, ~$0.06 por 1K tokens de salida

**Comparación con GROQ**: GROQ es más rápido y económico, pero GPT-4 puede ser más preciso para análisis complejos.

---

## 🧪 PRUEBAS RECOMENDADAS

1. **Configurar OpenAI desde CredentialsManager**:
   - Guardar credenciales en Settings → API Settings → OpenAI
   - Verificar que el estado muestre "Configurado y funcionando"
   - Verificar que el servicio use estas credenciales

2. **Configurar OpenAI desde Variables de Entorno**:
   - Configurar `OPENAI_API_KEY` en `.env`
   - Verificar que el estado muestre "Configurado y funcionando"
   - Verificar que el servicio use estas variables

3. **Validación de Formato**:
   - Intentar guardar API Key inválido (ej: sin `sk-`) y verificar error
   - Intentar guardar API Key muy corto y verificar error

4. **Normalización de Campos**:
   - Guardar credenciales con `OPENAI_API_KEY` y verificar que se normalice a `apiKey`
   - Guardar credenciales con `OPENAI_MODEL` y verificar que se normalice a `model`

---

**Última actualización**: 2025-12-11

