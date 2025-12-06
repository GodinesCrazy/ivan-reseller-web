# Solucionar Problemas de Conectividad con AliExpress API

## 🔍 Diagnóstico Automático

Ejecuta el script de diagnóstico para identificar el problema:

```bash
cd backend
npm run diagnose:connectivity
```

Este script verificará:
- ✅ Resolución DNS
- ✅ Ping al servidor
- ✅ Conexión TCP directa
- ✅ Configuración de proxy
- ✅ Estado del firewall de Windows
- ✅ Test con Axios (simulando llamada real)

## 🔧 Soluciones por Problema

### 1. Firewall de Windows Bloqueando Conexiones

#### Verificar y Configurar Firewall:

1. **Abrir Firewall de Windows Defender con Seguridad Avanzada:**
   - Presiona `Win + R`
   - Escribe `wf.msc` y presiona Enter

2. **Crear Regla de Salida para Node.js:**
   - Click en "Reglas de salida" en el panel izquierdo
   - Click en "Nueva regla..." en el panel derecho
   - Seleccionar "Programa" > Siguiente
   - Seleccionar "Esta ruta del programa" y buscar `node.exe`
     - Ubicación típica: `C:\Program Files\nodejs\node.exe`
   - Seleccionar "Permitir la conexión" > Siguiente
   - Marcar todos los perfiles (Dominio, Privada, Pública) > Siguiente
   - Nombre: "Node.js - Conexiones salientes" > Finalizar

3. **Crear Regla para Chrome (si usas Puppeteer):**
   - Mismo proceso, pero para Chrome
   - Ubicación: `C:\Program Files\Google\Chrome\Application\chrome.exe`

4. **Verificar Reglas Existentes:**
   - Buscar reglas existentes para Node.js
   - Verificar que estén "Habilitadas" y "Permitir conexión"

#### Solución Temporal (NO recomendado en producción):
```powershell
# Como Administrador
netsh advfirewall set allprofiles state off
```

**⚠️ IMPORTANTE:** Recuerda volver a activarlo después:
```powershell
netsh advfirewall set allprofiles state on
```

---

### 2. Antivirus Bloqueando Conexiones

Muchos antivirus modernos incluyen firewall integrado que puede bloquear conexiones.

#### Soluciones:

1. **Agregar Excepción en Antivirus:**
   - Abrir configuración del antivirus
   - Buscar "Firewall" o "Red"
   - Agregar excepción para:
     - Node.js (`node.exe`)
     - Chrome (si usas Puppeteer)
     - Puerto 443 (HTTPS)

2. **Deshabilitar Temporalmente (Solo para Testing):**
   - Deshabilitar firewall del antivirus temporalmente
   - Probar conexión
   - Si funciona, crear excepción permanente
   - **NO dejar deshabilitado permanentemente**

---

### 3. Proxy Corporativo/Universitario

Si estás en una red corporativa o universitaria, puede haber un proxy bloqueando conexiones.

#### Verificar Proxy:

1. **Windows:**
   - Configuración > Red e Internet > Proxy
   - Verificar si hay proxy configurado

2. **Variables de Entorno:**
   ```powershell
   # Verificar
   echo $env:HTTP_PROXY
   echo $env:HTTPS_PROXY
   ```

#### Configurar Proxy para Node.js:

```bash
# En PowerShell
$env:HTTP_PROXY="http://proxy:puerto"
$env:HTTPS_PROXY="http://proxy:puerto"
$env:NO_PROXY="localhost,127.0.0.1"

# O crear archivo .env en backend/
HTTP_PROXY=http://proxy:puerto
HTTPS_PROXY=http://proxy:puerto
NO_PROXY=localhost,127.0.0.1
```

#### Configurar Proxy en Axios (si es necesario):

```typescript
// backend/src/services/aliexpress-affiliate-api.service.ts
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxy) {
  this.client = axios.create({
    httpsAgent: new HttpsProxyAgent(proxy),
    // ... resto de configuración
  });
}
```

---

### 4. Cambiar DNS

Si hay problemas de resolución DNS, cambiar a DNS públicos puede ayudar.

#### Windows:

1. **Configuración:**
   - Configuración > Red e Internet > Estado
   - Cambiar opciones del adaptador
   - Click derecho en tu conexión > Propiedades
   - Seleccionar "Protocolo de Internet versión 4 (TCP/IPv4)" > Propiedades
   - Seleccionar "Usar las siguientes direcciones de servidor DNS"
   - DNS preferido: `8.8.8.8` (Google)
   - DNS alternativo: `8.8.4.4` (Google) o `1.1.1.1` (Cloudflare)

2. **Via Comando (como Administrador):**
   ```powershell
   netsh interface ip set dns "Wi-Fi" static 8.8.8.8
   netsh interface ip add dns "Wi-Fi" 8.8.4.4 index=2
   ```

---

### 5. Probar desde Otra Red

Una forma rápida de verificar si el problema es de tu red local:

1. **Usar Hotspot de Móvil:**
   - Activar hotspot en tu móvil
   - Conectar PC al hotspot
   - Probar conexión

2. **Otra WiFi:**
   - Si tienes acceso a otra red WiFi, probar desde ahí

3. **Conclusión:**
   - Si funciona en otra red → Problema de tu red local
   - Si no funciona en ninguna red → Problema del sistema/firewall/antivirus

---

### 6. Verificar Reglas de Red Específicas

Algunas redes tienen reglas que bloquean conexiones a ciertos países o dominios.

#### Verificar:

```bash
# Test de conectividad directa
ping gw.api.taobao.com

# Test de resolución DNS
nslookup gw.api.taobao.com

# Test de conexión HTTPS
curl -v https://gw.api.taobao.com/router/rest
```

---

### 7. Usar VPN

Como solución temporal o permanente:

1. **VPN Gratis:**
   - ProtonVPN (gratis, sin límite de datos)
   - Windscribe (gratis, 10GB/mes)

2. **Configurar VPN en Node.js:**
   - La mayoría de VPNs se configuran a nivel de sistema
   - No requiere configuración adicional en Node.js

---

### 8. Desarrollo en Railway (Recomendado)

**La mejor solución:** Desarrollar directamente en Railway donde no hay restricciones de red.

#### Usar Railway CLI:

```bash
# Instalar Railway CLI
npm i -g @railway/cli

# Login
railway login

# Inicializar proyecto
railway init

# Conectar a proyecto existente
railway link

# Ejecutar comandos en Railway
railway run npm run dev
```

#### Ventajas:
- ✅ No hay problemas de firewall local
- ✅ Conectividad perfecta
- ✅ Mismo entorno que producción
- ✅ Logs en tiempo real

---

## 🎯 Checklist de Solución

Ejecuta estos pasos en orden:

- [ ] 1. Ejecutar `npm run diagnose:connectivity`
- [ ] 2. Verificar firewall de Windows (crear reglas si es necesario)
- [ ] 3. Verificar antivirus (agregar excepciones)
- [ ] 4. Verificar proxy (configurar si es necesario)
- [ ] 5. Cambiar DNS a 8.8.8.8 / 8.8.4.4
- [ ] 6. Probar desde hotspot móvil
- [ ] 7. Probar con VPN
- [ ] 8. Si nada funciona, usar Railway para desarrollo

---

## 📝 Notas Importantes

1. **Este problema solo afecta desarrollo LOCAL:**
   - En Railway (producción) NO debería haber este problema
   - La API funciona correctamente, solo hay restricciones de red local

2. **El código está correcto:**
   - Los logs muestran que las llamadas HTTP se están haciendo correctamente
   - El problema es de conectividad de red, no del código

3. **Timeout esperado:**
   - Si el firewall/proxy bloquea, el timeout es el comportamiento esperado
   - El sistema hace fallback a scraping correctamente

---

## 🆘 Si Nada Funciona

1. **Contactar Administrador de Red:**
   - Si estás en red corporativa/universitaria
   - Solicitar que permitan conexiones a `*.taobao.com` en puerto 443

2. **Usar Railway para Desarrollo:**
   - La solución más práctica
   - No requiere cambios en tu red local

3. **Reportar el Problema:**
   - Incluir salida de `npm run diagnose:connectivity`
   - Describir tu entorno (Windows version, antivirus, tipo de red)

