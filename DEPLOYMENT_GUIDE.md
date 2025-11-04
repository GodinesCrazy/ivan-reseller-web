# 🚀 GUÍA DE DEPLOYMENT - IVAN RESELLER WEB

## 📋 CHECKLIST PRE-DEPLOYMENT

- [ ] Código local funcionando correctamente
- [ ] Base de datos SQLite local con datos de prueba
- [ ] Variables de entorno configuradas localmente
- [ ] Git repository actualizado en GitHub
- [ ] Cuenta en Railway creada
- [ ] Cuenta en Vercel creada
- [ ] Dominio comprado (opcional para fase inicial)

---

## 🔧 FASE 1: RAILWAY (BACKEND + DATABASE)

### **Paso 1: Crear proyecto en Railway**

1. Ir a https://railway.app
2. Click "Login" → Elegir "Login with GitHub"
3. Autorizar Railway
4. Click "New Project"
5. Seleccionar "Deploy from GitHub repo"
6. Buscar: `ivan-reseller-web`
7. Click en el repositorio

### **Paso 2: Configurar Backend Service**

Railway detectará automáticamente que es un proyecto Node.js.

**Configuración del servicio:**
```
Root Directory: backend
Build Command: npm install && npm run build
Start Command: npm start
```

### **Paso 3: Agregar PostgreSQL**

1. En el proyecto Railway, click "+ New"
2. Seleccionar "Database"
3. Elegir "PostgreSQL"
4. Railway creará automáticamente la base de datos
5. Variable `DATABASE_URL` se genera automáticamente

### **Paso 4: Configurar Variables de Entorno**

Click en el servicio Backend → "Variables" → Agregar:

```bash
NODE_ENV=production
PORT=3000
JWT_SECRET=tu_secret_super_seguro_minimo_32_caracteres_aleatorios
ENCRYPTION_KEY=otro_secret_32_caracteres_para_encriptar_apis
CORS_ORIGIN=https://ivan-reseller.vercel.app
```

**IMPORTANTE:** Generar secrets seguros:
```bash
# En tu terminal local:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### **Paso 5: Deploy Backend**

1. Railway hará deploy automáticamente
2. Ver logs en tiempo real
3. Esperar mensaje: "Server running on port 3000"
4. Click "Generate Domain" para obtener URL pública
5. Tu backend estará en: `https://tu-proyecto-production.up.railway.app`

### **Paso 6: Ejecutar Migraciones**

Railway ejecutará automáticamente:
```bash
npx prisma migrate deploy
```

Si necesitas ejecutar seed manualmente:
1. En Railway, abrir el servicio
2. Click "Settings" → "Deploy Triggers"
3. O usar Railway CLI (ver abajo)

---

## 🎨 FASE 2: VERCEL (FRONTEND)

### **Paso 1: Preparar Frontend**

Primero, actualizar la URL del API en el código.

Crear archivo: `frontend/.env.production`
```bash
VITE_API_URL=https://tu-backend.up.railway.app
```

### **Paso 2: Deploy en Vercel**

1. Ir a https://vercel.com
2. Click "Login" → Elegir "Continue with GitHub"
3. Click "Add New..." → "Project"
4. Buscar: `ivan-reseller-web`
5. Click "Import"

**Configuración del proyecto:**
```
Framework Preset: Vite
Root Directory: frontend
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

**Variables de Entorno:**
```
VITE_API_URL = https://tu-backend.up.railway.app
```

### **Paso 3: Deploy**

1. Click "Deploy"
2. Vercel construirá y desplegará automáticamente
3. Obtendrás URL: `https://ivan-reseller.vercel.app`

---

## 🌐 FASE 3: DOMINIO CUSTOM (OPCIONAL)

### **Opción A: Usar dominio de Vercel**
```
Frontend: https://ivan-reseller.vercel.app
Backend: https://tu-backend.up.railway.app
```

### **Opción B: Dominio propio**

#### **1. Comprar dominio en Namecheap**
- Ir a https://namecheap.com
- Buscar: `ivan-reseller.com`
- Comprar ($8.88/año)

#### **2. Configurar en Vercel (Frontend)**
1. Vercel Dashboard → Proyecto → "Settings" → "Domains"
2. Agregar: `ivan-reseller.com` y `www.ivan-reseller.com`
3. Vercel te dará records DNS:
   ```
   Type: A
   Name: @
   Value: 76.76.21.21
   
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   ```

#### **3. Configurar en Namecheap**
1. Dashboard → Domain List → Manage
2. "Advanced DNS"
3. Agregar records de Vercel
4. Esperar 1-24 horas (propagación DNS)

#### **4. Configurar Subdomain para API**
En Namecheap:
```
Type: CNAME
Name: api
Value: tu-backend.up.railway.app
```

Resultado:
```
Frontend: https://ivan-reseller.com
Backend: https://api.ivan-reseller.com
```

---

## 🔒 FASE 4: CONFIGURAR CORS

Actualizar variable en Railway:
```bash
CORS_ORIGIN=https://ivan-reseller.com,https://www.ivan-reseller.com,https://ivan-reseller.vercel.app
```

---

## 🧪 FASE 5: TESTING EN PRODUCCIÓN

### **Checklist de Pruebas:**

- [ ] Frontend carga correctamente
- [ ] Login funciona
- [ ] Dashboard muestra datos
- [ ] Crear producto funciona
- [ ] API credentials funcionan
- [ ] Notificaciones funcionan
- [ ] Todos los links funcionan
- [ ] No hay errores en consola
- [ ] Responsive en móvil funciona

### **Testing desde Alemania:**

1. Usar VPN o pedir a alguien que pruebe
2. Verificar latencia aceptable
3. Probar todas las funcionalidades

---

## 📊 FASE 6: MONITOREO

### **Railway Monitoring:**
- Dashboard → Metrics
- Ver CPU, RAM, Network usage
- Revisar logs en tiempo real

### **Vercel Analytics:**
- Dashboard → Analytics
- Ver visitas, performance
- Web Vitals scores

---

## 🔄 ACTUALIZACIONES FUTURAS

### **Actualizar Backend:**
```bash
# Local
git add .
git commit -m "Update: descripción"
git push origin main

# Railway hace deploy automático
```

### **Actualizar Frontend:**
```bash
# Local
git add .
git commit -m "Update: descripción"
git push origin main

# Vercel hace deploy automático
```

---

## 🆘 TROUBLESHOOTING

### **Backend no inicia:**
1. Revisar logs en Railway
2. Verificar DATABASE_URL existe
3. Verificar todas las variables de entorno
4. Verificar que build fue exitoso

### **Frontend no conecta con backend:**
1. Verificar VITE_API_URL en Vercel
2. Verificar CORS_ORIGIN en Railway
3. Abrir Network tab en DevTools
4. Verificar que backend responde

### **Database errors:**
1. Verificar que PostgreSQL está running
2. Ejecutar migrations manualmente
3. Revisar logs de Prisma

### **502 Bad Gateway:**
1. Backend está caído
2. Revisar logs en Railway
3. Verificar que PORT=3000 está configurado

---

## 💰 COSTOS MENSUALES

```
Railway: $5/mes (Hobby)
- Backend Node.js
- PostgreSQL 10GB
- 500GB bandwidth

Vercel: GRATIS
- Frontend hosting
- CDN global
- SSL automático

Total: $5/mes
```

---

## 🎯 PRÓXIMOS PASOS

1. ✅ Deploy completado
2. ⚠️ Configurar APIs externas (eBay, Amazon, etc.)
3. ⚠️ Configurar PayPal para pagos reales
4. ⚠️ Implementar monitoreo (Sentry, LogRocket)
5. ⚠️ Configurar backups automáticos
6. ⚠️ Implementar CI/CD avanzado
7. ⚠️ Optimizar performance
8. ⚠️ Agregar tests E2E

---

## 📞 SOPORTE

- Railway Docs: https://docs.railway.app
- Vercel Docs: https://vercel.com/docs
- Prisma Docs: https://www.prisma.io/docs
