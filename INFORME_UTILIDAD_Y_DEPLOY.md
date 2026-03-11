# Informe: Utilidad del software y estado Railway / Vercel

## 1. ¿Cuánto es capaz de generar en utilidad el software tal como está configurado?

El software **no genera dinero por sí solo**: es una **herramienta de reventa/dropshipping** que conecta con eBay, Mercado Libre, Amazon, AliExpress y PayPal. La utilidad real depende de:

| Factor | Qué hace el software | Dónde se ve |
|--------|----------------------|-------------|
| **Ventas** | Registra ventas, órdenes, compras pendientes | Dashboard, Ventas, Órdenes, Compras pendientes |
| **Ingresos totales** | Suma de precios de venta confirmados | Dashboard → “Ingresos totales” |
| **Ganancia neta** | Utilidad después de costos, comisiones, envío | Dashboard → “Ganancia neta” |
| **Comisión plataforma** | Porcentaje que retiene la plataforma por venta | Configuración; Dashboard “Comisión plataforma pagada” |
| **Autopilot / Publicador** | Automatiza búsqueda, aprobación y publicación | Ciclo, Publicador inteligente, Autopilot |

**Respuesta directa:**  
No se puede dar una cifra de “utilidad” sin datos de producción (número de ventas, ticket medio, comisión configurada, usuarios activos). El código está preparado para **rastrear** ingresos, ganancia y comisiones; la cantidad generada depende del uso que den los usuarios y de la configuración (marketplaces, PayPal, AliExpress, comisión de plataforma).

Para saber “cuánto está generando ahora” hay que:
- Entrar al **Dashboard** en producción (o llamar a `GET /api/dashboard/stats`).
- Revisar **Finanzas** y **Comisiones** para ver totales por usuario y por plataforma.

---

## 2. ¿Railway y Vercel están correctamente desplegados y actualizados?

### Configuración revisada en el repositorio

- **Vercel (`vercel.json`):**
  - Root: monorepo; build: `cd frontend && npm install` y `cd frontend && npm run build`.
  - Salida: `frontend/dist`.
  - Rewrites:
    - `/api/:path*` → `https://ivan-reseller-backend-production.up.railway.app/api/:path*`
    - `/aliexpress/callback` → mismo backend.
  - Configuración coherente con un front en Vercel y API en Railway.

- **Railway:**
  - `railway.json` en raíz: `startCommand`: `cd backend && npm run start:with-migrations`.
  - `Dockerfile` en raíz: imagen Node 20, build del backend, Prisma, `dist/server.js` o `tsx`.
  - El repo está listo para que Railway despliegue desde la raíz (o desde el Dockerfile).

- **Frontend en producción:**
  - Usa `/api` como base (proxy de Vercel), no URL absoluta al backend, para evitar CORS.
  - Las peticiones al backend pasan por el proxy de Vercel hacia Railway.

Conclusión: **la configuración en el repo para Railway y Vercel es correcta** para que:
- Un push a `main` dispare deploy en ambos.
- El front (Vercel) hable con el backend (Railway) por `/api/*`.

### Comprobaciones que debes hacer tú (no se puede acceder a tus cuentas)

**Comprobación automática (hecha al generar este informe):**  
`GET https://ivan-reseller-backend-production.up.railway.app/health` → **200 OK**  
`{"status":"ok","timestamp":"..."}`  
→ El backend en Railway está en marcha y la URL de `vercel.json` es correcta.

1. **Railway**
   - Dashboard → proyecto → servicio backend.
   - **Deployments:** que el último deployment sea del commit más reciente (por ejemplo `d305554` o posterior).
   - **Variables:** `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`, `CORS_ORIGIN`, PayPal, AliExpress, etc., según tu doc.
   - **Networking:** que el dominio público sea exactamente  
     `https://ivan-reseller-backend-production.up.railway.app`  
     Si es otro, hay que actualizar la URL en `vercel.json`.

2. **Vercel**
   - Dashboard → proyecto del frontend.
   - **Deployments:** que el último deploy de producción sea del mismo commit reciente.
   - **Environment Variables:** en producción, `VITE_API_URL` puede ser `/api` o vacío (el código en producción usa `/api` igualmente).

3. **Prueba rápida de que todo está actualizado y funcionando**
   - Backend (Railway) directo:
     ```bash
     curl -s https://ivan-reseller-backend-production.up.railway.app/health
     ```
     Debe responder algo tipo `{"ok":true}` o 200.
   - Backend vía Vercel (si tu dominio es `https://tudominio.vercel.app` o custom):
     ```bash
     curl -s https://TU_DOMINO_VERCEL/app/api/health
     ```
     o la ruta que tengas que haga proxy a `/api/health`. Debe ser 200.
   - Frontend: abrir la URL de Vercel, login, y que el Dashboard cargue (eso implica que `/api/*` llega al backend).

### Si el dominio de Railway no es el de `vercel.json`

En `vercel.json`, en `rewrites`, sustituir  
`https://ivan-reseller-backend-production.up.railway.app`  
por la URL real de tu servicio en Railway (Settings → Networking → Public Domain). Luego hacer un nuevo deploy en Vercel.

---

## Resumen

| Pregunta | Respuesta |
|----------|-----------|
| **¿Cuánto puede generar en utilidad?** | Depende del uso (ventas, comisión configurada). El software mide ingresos, ganancia y comisiones; la cifra concreta está en Dashboard/Finanzas en producción. |
| **¿Railway y Vercel están bien configurados en el repo?** | Sí: Vercel hace proxy a Railway, Railway tiene Dockerfile y start con migraciones. |
| **¿Están actualizados?** | Hay que comprobarlo en cada dashboard (último deploy = último commit) y con `curl` a `/health` y uso normal del front. |

Si quieres, el siguiente paso puede ser revisar contigo los valores que ves en Dashboard/Finanzas en producción para interpretar “utilidad actual” con números reales.
