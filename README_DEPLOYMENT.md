# 🚀 DEPLOYMENT RÁPIDO - www.ivanreseller.com

## 📋 RESUMEN

**Estado:** ✅ **100% LISTO PARA PRODUCCIÓN**

**Tiempo estimado:** 30-45 minutos

## ⚙️ RAILWAY BACKEND - Build & Start Commands

Railway debe usar los siguientes comandos (configurados en `backend/railway.json`):

- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm run start:with-migrations`
- **Healthcheck Path:** `/health`

El comando `start:with-migrations` ejecuta `npx prisma migrate deploy` antes de iniciar el servidor, garantizando que las migraciones se apliquen en cada deploy. **No usar** `prisma migrate dev` en producción.

**Archivos creados:**
- ✅ `backend/.env.example` - Plantilla completa
- ✅ `frontend/.env.example` - Plantilla completa
- ✅ `railway.json` - Configuración Railway
- ✅ `DEPLOYMENT_INMEDIATO.md` - Guía rápida (15-30 min)
- ✅ `DEPLOYMENT_COMPLETO_PRODUCCION.md` - Guía detallada
- ✅ `GUIA_VARIABLES_ENTORNO.md` - Explicación de variables
- ✅ `CHECKLIST_DEPLOYMENT_FINAL.md` - Checklist completo

---

## ⚡ INICIO RÁPIDO

**Sigue esta guía:** `DEPLOYMENT_INMEDIATO.md`

**Pasos principales:**
1. Railway (Backend) - 10 min
2. Vercel (Frontend) - 5 min
3. Configurar dominio - 5 min
4. Verificar - 5 min

---

## 📝 VARIABLES DE ENTORNO - EXPLICACIÓN

**¿Qué son?**
Configuraciones que el sistema necesita. Son diferentes en desarrollo vs producción.

**Ejemplo:**
```
Desarrollo: DATABASE_URL = "file:./dev.db"
Producción: DATABASE_URL = "postgresql://user:pass@host:5432/db"
```

**¿Dónde configurarlas?**
- **Railway:** Dashboard → Variables
- **Vercel:** Dashboard → Environment Variables

**Ver detalles:** `GUIA_VARIABLES_ENTORNO.md`

---

## ✅ CHECKLIST RÁPIDO

- [ ] Código pusheado a GitHub
- [ ] Railway configurado (Backend + PostgreSQL + Redis)
- [ ] Variables de entorno en Railway configuradas
- [ ] Vercel configurado (Frontend)
- [ ] Variables de entorno en Vercel configuradas
- [ ] Dominio configurado
- [ ] DNS configurado
- [ ] Verificación exitosa

---

## 🎯 VARIABLES OBLIGATORIAS

### **Backend:**
- `JWT_SECRET` (genera uno seguro)
- `CORS_ORIGIN` (tu dominio)
- `DATABASE_URL` (auto-generada por Railway)

### **Frontend:**
- `VITE_API_URL` (URL del backend)

---

## 📚 DOCUMENTACIÓN COMPLETA

- **Guía rápida:** `DEPLOYMENT_INMEDIATO.md`
- **Guía detallada:** `DEPLOYMENT_COMPLETO_PRODUCCION.md`
- **Variables de entorno:** `GUIA_VARIABLES_ENTORNO.md`
- **Checklist:** `CHECKLIST_DEPLOYMENT_FINAL.md`

---

**¡Listo para deployment!** 🚀

