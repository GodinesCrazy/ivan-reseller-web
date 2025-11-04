# ðŸš€ INICIO RÃPIDO GLOBAL - Ivan Reseller

**Para acceso desde cualquier parte del mundo**

---

## ðŸ“‹ **REQUISITOS PREVIOS**

âœ… Windows 10/11  
âœ… Node.js instalado ([descargar](https://nodejs.org/))  
âœ… ConexiÃ³n a internet  
âœ… PC que permanecerÃ¡ encendida  

---

## ðŸŽ¯ **INICIO AUTOMÃTICO (3 PASOS)**

### **Paso 1: Ejecutar como Administrador**

```
1. Busca el archivo: iniciar-sistema.bat
2. Click derecho â†’ "Ejecutar como administrador"
3. Espera 1-2 minutos mientras se configura todo
```

**Â¿QuÃ© hace automÃ¡ticamente?**
- âœ… Configura Firewall de Windows
- âœ… Detecta tu IP pÃºblica
- âœ… Configura frontend con IP correcta
- âœ… Instala dependencias
- âœ… Inicia backend y frontend
- âœ… Genera archivo con tus URLs

---

### **Paso 2: Obtener tus URLs**

El script genera automÃ¡ticamente un archivo: **`URLS_ACCESO.txt`**

```
Abre el archivo y verÃ¡s:

LOCAL (solo tu PC):
  http://localhost:5173

RED LOCAL (WiFi/LAN):
  http://192.168.1.100:5173

INTERNET (cualquier parte del mundo):
  http://203.0.113.45:5173
```

---

### **Paso 3: Compartir el Link**

**Para usuarios en otros paÃ­ses:**

```
1. Copia la URL de "INTERNET": http://TU_IP_PUBLICA:5173
2. EnvÃ­ala por WhatsApp/Email/Telegram
3. El usuario abre el link
4. Ingresa con sus credenciales
```

**Ejemplo de mensaje:**

```
Â¡Hola! Ya puedes acceder al sistema Ivan Reseller.

ðŸ”— Link: http://203.0.113.45:5173

ðŸ”‘ Tus credenciales:
Usuario: tu_email@ejemplo.com
ContraseÃ±a: tu_password

âš ï¸ Importante: Mi PC debe estar encendida para que funcione.

Â¡Cualquier duda, me avisas! ðŸ˜Š
```

---

## âš™ï¸ **CONFIGURACIÃ“N ADICIONAL (Solo si no funciona desde internet)**

Si usuarios externos **NO pueden acceder**, necesitas **Port Forwarding**:

### **ConfiguraciÃ³n de Router (5 minutos)**

```
1. Abre tu navegador
2. Escribe: 192.168.1.1 (o 192.168.0.1)
3. Ingresa usuario/contraseÃ±a del router
4. Busca "Port Forwarding" o "Virtual Server"
5. AÃ±ade estas 2 reglas:

   REGLA 1:
   â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
   Puerto Externo:  5173
   IP Interna:      192.168.1.X (tu PC)
   Puerto Interno:  5173
   Protocolo:       TCP
   
   REGLA 2:
   â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
   Puerto Externo:  3000
   IP Interna:      192.168.1.X (tu PC)
   Puerto Interno:  3000
   Protocolo:       TCP

6. Guardar cambios
7. Probar: http://TU_IP_PUBLICA:5173
```

**Tu IP interna la encuentras en:** `URLS_ACCESO.txt` o ejecuta `ipconfig` en CMD.

ðŸ“š **GuÃ­a completa por router:** [`ACCESO_IP_PUERTO.md`](ACCESO_IP_PUERTO.md)

---

## ðŸ§ª **VERIFICAR QUE TODO FUNCIONA**

### **Test AutomÃ¡tico**

```powershell
# Test bÃ¡sico (local + LAN)
.\test-conectividad.ps1

# Test completo (incluye internet)
.\test-conectividad.ps1 -Full
```

### **Test Manual**

**Desde tu PC:**
```
Abre: http://localhost:5173
Login: admin@ivanreseller.com / admin123
âœ… Debe funcionar
```

**Desde otro dispositivo en tu WiFi:**
```
Abre: http://192.168.1.X:5173 (ver URLS_ACCESO.txt)
Login: admin@ivanreseller.com / admin123
âœ… Debe funcionar
```

**Desde internet (otro paÃ­s):**
```
1. Desactiva WiFi en tu telÃ©fono (usa 4G/5G)
2. Abre: http://TU_IP_PUBLICA:5173
3. Login: admin@ivanreseller.com / admin123
âœ… Debe funcionar (si configuraste Port Forwarding)
```

---

## ðŸ‘¥ **CREAR USUARIOS PARA COMPARTIR**

### **OpciÃ³n 1: Desde la Interfaz (Recomendado)**

```
1. Login como admin (admin@ivanreseller.com / admin123)
2. Ve a: ConfiguraciÃ³n > Usuarios
3. Click en "Crear Usuario"
4. Completa:
   - Nombre de usuario
   - Email
   - ContraseÃ±a
   - Rol (Usuario/Admin)
   - ComisiÃ³n (si aplica)
5. Guardar
6. Comparte las credenciales con el usuario
```

### **OpciÃ³n 2: Desde API (Avanzado)**

```bash
# Crear usuario vÃ­a API
curl -X POST http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "juan_mexico",
    "email": "juan@ejemplo.com",
    "password": "Password123!",
    "role": "USER",
    "commissionRate": 0.10
  }'
```

---

## ðŸ” **CAMBIAR CREDENCIALES POR DEFECTO**

**MUY IMPORTANTE:** Cambia las contraseÃ±as por defecto antes de compartir:

```
1. Login como admin
2. Ve a: Perfil > Seguridad
3. Cambiar contraseÃ±a
4. Usa una fuerte (mÃ­nimo 12 caracteres)
```

O desde la base de datos:
```bash
cd backend
npx prisma studio
# Edita el usuario admin y cambia la contraseÃ±a
```

---

## ðŸ›‘ **DETENER EL SISTEMA**

**MÃ©todo 1: Desde el script**
```
En la ventana del script "iniciar-sistema.bat":
Presiona cualquier tecla
```

**MÃ©todo 2: Cerrar ventanas**
```
Busca en la barra de tareas:
- "Ivan Reseller - Backend"
- "Ivan Reseller - Frontend"
CiÃ©rralas
```

**MÃ©todo 3: Matar procesos**
```bash
taskkill /F /IM node.exe
```

---

## ðŸ”„ **REINICIAR EL SISTEMA**

```
1. DetÃ©n el sistema (ver arriba)
2. Ejecuta nuevamente: iniciar-sistema.bat (como Admin)
3. Espera 1-2 minutos
4. Â¡Listo!
```

---

## ðŸ’¡ **TIPS Y MEJORES PRÃCTICAS**

### **Para mantener el sistema 24/7:**

```
âœ… Configura Windows para no dormir:
   ConfiguraciÃ³n > Sistema > EnergÃ­a > "Nunca"

âœ… Deshabilita actualizaciones automÃ¡ticas:
   O configura para instalar solo cuando apagues

âœ… Usa UPS (sistema de respaldo elÃ©ctrico):
   Para evitar apagados por cortes de luz

âœ… Monitorea el sistema:
   Revisa periÃ³dicamente que estÃ© funcionando
```

### **Para mejorar seguridad:**

```
âœ… Cambia contraseÃ±as por defecto
âœ… Usa contraseÃ±as fuertes (12+ caracteres)
âœ… No compartas credenciales de admin
âœ… Crea usuarios individuales para cada persona
âœ… Revisa logs periÃ³dicamente
âœ… MantÃ©n Windows actualizado
```

### **Para acceso profesional:**

```
Si necesitas acceso mÃ¡s robusto:

1. IP EstÃ¡tica (contacta tu ISP):
   - Evita que tu IP cambie
   - Costo: $5-15/mes adicionales

2. Dynamic DNS (gratis):
   - No-IP.com o DuckDNS.org
   - Tu dominio: ivanreseller.ddns.net
   - Se actualiza automÃ¡ticamente

3. Hosting en la nube (recomendado):
   - Heroku, Railway, o VPS
   - HTTPS incluido
   - No depende de tu PC
   - Ver: GUIA_DEPLOYMENT.md
```

---

## ðŸ†˜ **PROBLEMAS COMUNES**

### **Problema: No puedo acceder desde internet**

```
SoluciÃ³n:
1. Verifica Port Forwarding en router
2. Ejecuta: .\test-conectividad.ps1 -Full
3. Si falla, revisa: ACCESO_IP_PUERTO.md
4. Contacta a tu ISP (puede tener doble NAT)
```

### **Problema: Mi IP pÃºblica cambia constantemente**

```
SoluciÃ³n:
1. Solicita IP estÃ¡tica a tu ISP (opciÃ³n 1)
2. Usa Dynamic DNS (opciÃ³n 2, gratis)
3. Despliega en la nube (opciÃ³n 3, mejor)
```

### **Problema: Error CORS en navegador**

```
SoluciÃ³n:
1. Abre: backend/src/app.ts
2. Busca: corsOptions
3. AÃ±ade tu IP pÃºblica en origin:
   origin: [
     'http://localhost:5173',
     'http://TU_IP_PUBLICA:5173',
   ]
4. Reinicia el backend
```

### **Problema: Backend no responde**

```
SoluciÃ³n:
1. Verifica que estÃ¡ corriendo:
   netstat -an | findstr "3000"
   
2. Si no aparece, reinicia:
   cd backend
   npm run dev
   
3. Revisa logs en la ventana del backend
```

### **Problema: Frontend no carga**

```
SoluciÃ³n:
1. Verifica que estÃ¡ corriendo:
   netstat -an | findstr "5173"
   
2. Verifica frontend/.env:
   VITE_API_URL debe apuntar a tu IP correcta
   
3. Reinicia:
   cd frontend
   npm run dev
```

---

## ðŸ“ž **SOPORTE**

### **Archivos Ãºtiles:**

- `URLS_ACCESO.txt` - Tus URLs de acceso
- `ACCESO_IP_PUERTO.md` - GuÃ­a completa de configuraciÃ³n
- `README.md` - DocumentaciÃ³n general
- `test-conectividad.ps1` - Script de diagnÃ³stico

### **Comandos Ãºtiles:**

```bash
# Ver URLs guardadas
type URLS_ACCESO.txt

# Ver IP local
ipconfig

# Ver IP pÃºblica
curl ifconfig.me

# Test de conectividad
.\test-conectividad.ps1 -Full

# Ver puertos activos
netstat -an | findstr "3000 5173"

# Ver base de datos
cd backend && npx prisma studio
```

---

## âœ… **CHECKLIST FINAL**

**Antes de compartir con usuarios:**

```
[ ] âœ… Script ejecutado como Administrador
[ ] âœ… Firewall configurado automÃ¡ticamente
[ ] âœ… Frontend muestra tu IP pÃºblica
[ ] âœ… Sistema accesible desde tu PC (localhost)
[ ] âœ… Sistema accesible desde tu red (LAN)
[ ] âœ… Port Forwarding configurado en router
[ ] âœ… Sistema accesible desde internet (4G/5G)
[ ] âœ… ContraseÃ±as de admin cambiadas
[ ] âœ… Usuarios individuales creados
[ ] âœ… URLs compartidas con usuarios
[ ] âœ… PC configurada para no dormir
[ ] âœ… Test de conectividad exitoso
```

---

## ðŸŽ‰ **Â¡LISTO!**

Tu sistema estÃ¡ configurado para **acceso global**. 

**Comparte simplemente:**
```
Link: http://TU_IP_PUBLICA:5173
Usuario: su_email@ejemplo.com
ContraseÃ±a: su_password
```

**Mientras tu PC estÃ© encendida, el sistema funcionarÃ¡ desde cualquier parte del mundo.** ðŸŒ

---

**Ãšltima actualizaciÃ³n:** Octubre 2025  
**VersiÃ³n:** 2.0 - ConfiguraciÃ³n Global AutomÃ¡tica
