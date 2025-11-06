# 🌐 INSTRUCCIONES PARA ACCEDER AL SISTEMA EN LA WEB

## 🚀 Sistema Iniciado

El sistema está iniciándose en segundo plano. En unos segundos podrás acceder.

## 📍 URLs de Acceso

### **Local (tu computadora)**
```
http://localhost:5173
```

### **Desde otra computadora en tu red local**
```
http://TU_IP_LOCAL:5173
```

### **Backend API**
```
http://localhost:3000
```

## 🔐 Credenciales de Login

**Usuario Administrador:**
```
Username: admin
Password: admin123
```

## 📝 Pasos para Acceder

1. **Espera 10-15 segundos** para que los servicios terminen de iniciar

2. **Abre tu navegador** (Chrome, Edge, Firefox, etc.)

3. **Ve a la URL**: `http://localhost:5173`

4. **Si no redirige automáticamente**, ve a: `http://localhost:5173/login`

5. **Ingresa las credenciales**:
   - Username: `admin`
   - Password: `admin123`

6. **Click en "Sign in"**

7. **¡Listo!** Serás redirigido al Dashboard

## ✅ Verificar que el Sistema Está Funcionando

### Verificar Backend:
Abre en el navegador: `http://localhost:3000/health`

Deberías ver:
```json
{
  "status": "ok",
  "timestamp": "..."
}
```

### Verificar Frontend:
Abre en el navegador: `http://localhost:5173`

Deberías ver la página de login.

## 🛠️ Si Algo No Funciona

### El backend no inicia:
```bash
cd backend
npm run dev
```

### El frontend no inicia:
```bash
cd frontend
npm run dev
```

### Los puertos están ocupados:
```bash
# Windows PowerShell
netstat -ano | findstr :3000
netstat -ano | findstr :5173

# Matar procesos (reemplaza <PID> con el número que encuentres)
taskkill /PID <PID> /F
```

## 📱 Acceso desde Otros Dispositivos

Si quieres acceder desde tu celular o otra computadora en la misma red:

1. Encuentra tu IP local:
   ```bash
   ipconfig
   # Busca "IPv4 Address" (ejemplo: 192.168.1.100)
   ```

2. Accede desde el otro dispositivo usando:
   ```
   http://TU_IP_LOCAL:5173
   ```

3. Asegúrate de que el firewall de Windows permita las conexiones entrantes en los puertos 3000 y 5173.

## 🎯 Permisos de Administrador

Con el usuario `admin`, tendrás acceso completo a:
- ✅ Gestión de usuarios
- ✅ Panel de administración
- ✅ Configuración de APIs
- ✅ Reportes completos
- ✅ Configuración de comisiones
- ✅ Logs del sistema
- ✅ Todas las funcionalidades

## ⚠️ Importante

- **NO cierres las ventanas de terminal** donde están corriendo los servicios
- Si cierras las terminales, el sistema se detendrá
- Para detener el sistema, presiona `Ctrl+C` en cada terminal

---

**¡El sistema está listo para usar!** 🎉

