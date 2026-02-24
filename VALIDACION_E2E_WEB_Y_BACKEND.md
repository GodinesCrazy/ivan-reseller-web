# Validaciùn E2E ? Web y Backend (Punto 5)

**Fecha:** 19 de febrero de 2025  
**Objetivo:** Probar web y backend de punta a punta en local y producciùn.

---

## 1. Resumen

| Entorno   | Web       | Backend   | Login | Dashboard | Conclusiùn      |
|-----------|-----------|-----------|-------|-----------|-----------------|
| Producciùn | ? OK     | ? OK     | ? OK | ? OK     | **FUNCIONA**    |
| Local     | ? OK     | ? OK     | ?    | -         | **Configuraciùn** |

---

## 2. Producciùn (ivanreseller.com)

### Verificado
- ? Carga de login
- ? Login con admin/admin123 ? redirect a /dashboard
- ? Dashboard muestra:
  - Ventas Totales, Comisiones, Productos Publicados (2), Oportunidades IA (1426), Sugerencias IA (19)
  - Resumen de Workflows: 50 productos, 33 SCRAPE, 17 ANALYZE
  - Actividad Reciente: ventas, productos creados, credenciales actualizadas
  - Estado del Sistema: Principal ùptimo, Motor IA Procesando, Automatizaciùn Activo
- ? Sidebar: Panel, Oportunidades, Autopilot, Productos, Ventas, ùrdenes, Checkout, etc.
- ? Navbar: usuario admin, Logout

**Conclusiùn: La web y el backend en producciùn funcionan correctamente.**

---

## 3. Local (localhost)

### Backend
- ? Arranca correctamente (port 4000 o 4001 si 4000 estù ocupado)
- ? Health: responde en `/health`
- ? Base de datos conectada
- ? Servicios cargados (AliExpress, Autopilot, PayPal, etc.)

### Frontend
- ? Arranca en http://localhost:5173
- ? Pùgina de login se muestra
- ? Login falla con "Network Error" / "Backend no disponible"

### Causa
El frontend envùa las peticiones a `http://localhost:3000` (definido en `frontend/.env.development`), pero el backend escucha en `http://localhost:4000` (o 4001 si 4000 estù ocupado).

**Request observado:** `POST http://localhost:3000/api/auth/login` ? falla (no hay servicio en 3000).

---

## 4. Correcciùn para desarrollo local

### Paso 1: Ajustar VITE_API_URL

Edita `frontend/.env.development` (o `frontend/.env`) y cambia:

**PowerShell (autom·tico):**
```powershell
(Get-Content frontend\.env.development) -replace 'http://localhost:3000','http://localhost:4000' | Set-Content frontend\.env.development
```

**O manualmente:**

```env
# Antes
VITE_API_URL=http://localhost:3000

# Despuùs
VITE_API_URL=http://localhost:4000
```

Si el backend usa otro puerto (ej. 4001 porque 4000 estù ocupado):

```env
VITE_API_URL=http://localhost:4001
```

### Paso 2: Reiniciar frontend

Tras cambiar variables de entorno, reinicia el servidor de desarrollo:

```bash
cd frontend
npm run dev
```

### Paso 3: Comprobar

1. Abre http://localhost:5173
2. Inicia sesiùn con admin / admin123
3. Deberùas llegar al dashboard

---

## 5. Documentaciùn actualizada

Se actualizù `frontend/src/content/docs/SETUP_LOCAL.md` para usar puerto 4000 de forma consistente:

- Backend: `PORT=4000`
- Frontend: `VITE_API_URL="http://localhost:4000"`
- CORS: `http://localhost:5173,http://localhost:4000`

---

## 6. Checklist de validaciùn

Para comprobar que todo estù bien:

- [ ] Backend: `cd backend && npm run dev` ? escucha en 4000 (o 4001)
- [ ] Frontend: `VITE_API_URL` apunta al puerto del backend
- [ ] Frontend: `cd frontend && npm run dev` ? http://localhost:5173
- [ ] Login local con admin/admin123
- [ ] Dashboard carga con datos reales
- [ ] Oportunidades, Productos, Autopilot accesibles

---

*Validaciùn ejecutada. Producciùn OK. Local requiere correcciùn de puerto en VITE_API_URL.*
