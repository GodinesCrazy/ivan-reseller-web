# 🌐 GUÍA DE ACCESO POR IP + PUERTO

## 📋 **TABLA DE CONTENIDOS**
1. [Acceso Local (Red LAN)](#acceso-local-red-lan)
2. [Acceso Externo (Internet)](#acceso-externo-internet)
3. [Configuración de Firewall](#configuración-de-firewall)
4. [Port Forwarding en Router](#port-forwarding-en-router)
5. [Solución de Problemas](#solución-de-problemas)

---

## 🏠 **ACCESO LOCAL (Red LAN)**

### **¿Cuándo usar esto?**
- Usuarios en la misma oficina
- Dispositivos conectados al mismo WiFi
- Red local doméstica

### **Paso 1: Obtener tu IP Local**

```powershell
# En PowerShell o CMD
ipconfig

# Busca "IPv4 Address" en tu adaptador WiFi/Ethernet
# Ejemplo: 192.168.1.100
```

### **Paso 2: Iniciar el Sistema**

```bash
.\iniciar-sistema.bat
```

### **Paso 3: Acceder desde otros dispositivos**

```
Frontend: http://192.168.1.100:5173/login
Backend:  http://192.168.1.100:3000

✅ Funciona desde:
- Otra PC en la red
- Laptop conectada al WiFi
- Teléfono/Tablet en el WiFi
- Cualquier dispositivo en la misma red
```

### **Ejemplo de Acceso**

```
Tu PC (donde corre el sistema): 192.168.1.100
Laptop del usuario:             192.168.1.105

Usuario abre navegador:
http://192.168.1.100:5173/login

✅ ¡Listo! Puede ingresar con su usuario/contraseña
```

---

## 🌍 **ACCESO EXTERNO (Internet)**

### **¿Cuándo usar esto?**
- Usuarios en otras ciudades/países
- Acceso desde internet externo
- Trabajo remoto

### **Paso 1: Obtener IP Pública**

```powershell
# Método 1: PowerShell
curl ifconfig.me

# Método 2: Navegador
# Visita: https://www.cual-es-mi-ip.net/

# Ejemplo de resultado: 203.0.113.45
```

### **Paso 2: Configurar Port Forwarding**

#### **2.1 Acceder al Router**

```
1. Abre navegador
2. Escribe la IP del router (generalmente):
   - 192.168.1.1  (más común)
   - 192.168.0.1
   - 10.0.0.1

3. Ingresa usuario/contraseña del router
   - Usuario: admin
   - Contraseña: (check router sticker)
```

#### **2.2 Configurar Reglas**

```
Busca sección:
- "Port Forwarding"
- "Virtual Server"
- "NAT"
- "Applications & Gaming"

Añade 2 reglas:

REGLA 1 - Frontend
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nombre:          Ivan Reseller Web
Puerto Externo:  5173
IP Interna:      192.168.1.100  (tu PC)
Puerto Interno:  5173
Protocolo:       TCP
Estado:          Habilitado

REGLA 2 - Backend
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nombre:          Ivan Reseller API
Puerto Externo:  3000
IP Interna:      192.168.1.100  (tu PC)
Puerto Interno:  3000
Protocolo:       TCP
Estado:          Habilitado
```

### **Paso 3: Configurar Firewall de Windows**

```powershell
# Abrir PowerShell como ADMINISTRADOR
# Click derecho → "Ejecutar como administrador"

# Permitir puerto 5173 (Frontend)
New-NetFirewallRule -DisplayName "Ivan Reseller Frontend" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow

# Permitir puerto 3000 (Backend)
New-NetFirewallRule -DisplayName "Ivan Reseller Backend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow

# Verificar reglas creadas
Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*Ivan Reseller*"}
```

### **Paso 4: Configurar Backend para IP Externa**

El backend ya está configurado (server.ts línea 55):
```typescript
httpServer.listen(PORT, '0.0.0.0', () => { ... })
```
✅ No requiere cambios

### **Paso 5: Configurar Frontend para usar IP Pública**

```bash
# Crear/editar archivo: frontend/.env

# Si tu IP pública es 203.0.113.45:
VITE_API_URL=http://203.0.113.45:3000
```

### **Paso 6: Reiniciar Sistema**

```bash
# Detener si está corriendo (Ctrl+C en ambas ventanas)

# Reiniciar
.\iniciar-sistema.bat
```

### **Paso 7: Probar Acceso Externo**

```
Desde cualquier país:
http://203.0.113.45:5173/login

✅ Usuario en México:    Funciona
✅ Usuario en Colombia:  Funciona
✅ Usuario en España:    Funciona
✅ Usuario desde 4G/5G:  Funciona
```

---

## 🛡️ **CONFIGURACIÓN DE FIREWALL**

### **Verificar Estado del Firewall**

```powershell
# Ver estado
Get-NetFirewallProfile | Select-Object Name, Enabled

# Ver reglas de Ivan Reseller
Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*Ivan Reseller*"} | Format-Table DisplayName, Enabled, Direction
```

### **Eliminar Reglas (si necesitas reconfigurar)**

```powershell
Remove-NetFirewallRule -DisplayName "Ivan Reseller Frontend"
Remove-NetFirewallRule -DisplayName "Ivan Reseller Backend"
```

### **Permitir Programa Completo (alternativa)**

```powershell
# Permitir Node.js completo
New-NetFirewallRule -DisplayName "Node.js" -Direction Inbound -Program "C:\Program Files\nodejs\node.exe" -Action Allow
```

---

## 🔧 **PORT FORWARDING EN ROUTER**

### **Routers Comunes**

#### **TP-Link**
```
1. http://192.168.0.1
2. Advanced → NAT Forwarding → Virtual Servers
3. Add → Completar datos → Save
```

#### **D-Link**
```
1. http://192.168.0.1
2. Advanced → Port Forwarding
3. Add → Configurar puertos → Apply
```

#### **Linksys**
```
1. http://192.168.1.1
2. Applications & Gaming → Port Range Forward
3. Add → Guardar configuración
```

#### **Netgear**
```
1. http://192.168.1.1
2. Advanced → Advanced Setup → Port Forwarding
3. Add Custom Service → Apply
```

#### **Movistar/Telmex (México)**
```
1. http://192.168.1.254
2. Configuración Avanzada → NAT
3. Añadir → Aplicar cambios
```

### **Verificar Port Forwarding**

```bash
# Desde OTRO dispositivo externo (no tu red):
# Usar herramienta online:
https://www.yougetsignal.com/tools/open-ports/

# Ingresar:
IP: 203.0.113.45
Puerto: 5173
Verificar: ✅ Puerto abierto
```

---

## 🔍 **SOLUCIÓN DE PROBLEMAS**

### **Problema 1: No puedo acceder desde internet**

```bash
# Verificar IP pública
curl ifconfig.me

# Verificar puerto abierto
Test-NetConnection -ComputerName 203.0.113.45 -Port 5173

# Verificar Firewall
Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*Ivan Reseller*"}

# Verificar Port Forwarding en router
# (Debe estar activo y apuntando a tu IP local)
```

### **Problema 2: Funciona en LAN pero no en internet**

```
✅ Port Forwarding configurado
✅ Firewall con reglas permitidas
❌ Router con doble NAT (ISP)

Solución:
- Contactar ISP para desactivar doble NAT
- O usar ngrok/VPS como alternativa
```

### **Problema 3: IP pública cambia constantemente**

```
Problema: IP dinámica (ISP cambia tu IP cada X días)

Soluciones:

1. IP Estática (recomendado)
   - Contactar ISP
   - Solicitar IP fija
   - Costo extra: $5-15/mes

2. Dynamic DNS (gratis)
   - Usar No-IP.com o DuckDNS.org
   - Tu dominio: ivanreseller.ddns.net
   - Actualiza automáticamente
```

### **Problema 4: Error CORS en navegador**

```bash
# Editar backend/src/app.ts
# Agregar tu IP pública en CORS

const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://192.168.1.100:5173',
    'http://203.0.113.45:5173',  // ← Añadir tu IP pública
  ],
  credentials: true,
};
```

### **Problema 5: Backend no responde**

```bash
# Verificar que está corriendo
netstat -an | findstr "3000"

# Debe mostrar:
# TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING

# Si no aparece, reiniciar:
cd backend
npm run dev
```

---

## 📊 **COMPARACIÓN: IP vs Hosting**

| Característica | IP + Puerto | Hosting Cloud |
|---|---|---|
| **Costo** | Gratis (ISP) | $0-20/mes |
| **Configuración** | Media | Fácil |
| **Dominio** | IP numérica | Dominio real |
| **HTTPS** | No automático | Incluido |
| **Estabilidad** | Depende ISP | 99.9% uptime |
| **IP dinámica** | Problema | No aplica |
| **Acceso global** | ✅ | ✅ |
| **Mantenimiento** | Tu PC 24/7 | Automático |

---

## ✅ **CHECKLIST FINAL**

### **Para Acceso Local (LAN)**
- [ ] Obtener IP local (`ipconfig`)
- [ ] Iniciar sistema (`iniciar-sistema.bat`)
- [ ] Probar desde otro dispositivo en la red
- [ ] Compartir URL: `http://192.168.1.X:5173`

### **Para Acceso Externo (Internet)**
- [ ] Obtener IP pública (`curl ifconfig.me`)
- [ ] Configurar Port Forwarding (puertos 3000 y 5173)
- [ ] Configurar Firewall Windows (reglas TCP)
- [ ] Editar `frontend/.env` con IP pública
- [ ] Reiniciar sistema
- [ ] Probar desde otra red (4G/5G)
- [ ] Verificar puertos abiertos online
- [ ] Compartir URL: `http://TU_IP:5173`

---

## 🔐 **RECOMENDACIONES DE SEGURIDAD**

```
⚠️ IMPORTANTE:

1. IP Pública expone tu sistema a internet
   - Usa contraseñas fuertes
   - Cambia credenciales por defecto
   - Monitorea logs de acceso

2. Considera usar HTTPS
   - Certificado SSL (Let's Encrypt)
   - Cloudflare Tunnel (gratis + HTTPS)
   - O migra a hosting con HTTPS incluido

3. Firewall adicional
   - Limita IPs permitidas si es posible
   - Monitorea intentos de acceso
   - Rate limiting en backend

4. Backup regular
   - Base de datos
   - Archivos de configuración
   - Logs del sistema
```

---

## 📞 **SOPORTE**

Si tienes problemas:
1. Verificar checklist arriba
2. Revisar logs del sistema
3. Probar desde red local primero
4. Verificar Port Forwarding en router
5. Contactar ISP si IP bloqueada

---

**Última actualización:** Octubre 2025
