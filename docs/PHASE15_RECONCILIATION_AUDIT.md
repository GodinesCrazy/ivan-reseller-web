# Phase 15 — Ejecutar auditoría de reconciliación tras el deploy

Después de desplegar el backend (Railway) con Phase 15, ejecuta **una vez** la auditoría de listados para que el dashboard solo cuente listados realmente activos en el marketplace (y se corrijan estados como VIP67 / NOT_FOUND).

## Endpoint

- **POST** `/api/publisher/listings/run-reconciliation-audit`
- **Autenticación:** Requerida (mismo auth que el resto de `/api/publisher/*`).

## Cómo ejecutarlo

### Opción 1: Desde el navegador (recomendado)

1. Inicia sesión en **https://ivanreseller.com** (o la URL de tu frontend).
2. Abre DevTools (F12) → pestaña **Console**.
3. Pega y ejecuta (si el front hace proxy al backend, usa la ruta relativa):

```js
fetch('/api/publisher/listings/run-reconciliation-audit', { method: 'POST', credentials: 'include' })
  .then(r => r.json())
  .then(console.log);
```

Si el frontend está en otro dominio y llamas al backend directo:

```js
fetch('https://ivan-reseller-backend-production.up.railway.app/api/publisher/listings/run-reconciliation-audit', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' }
}).then(r => r.json()).then(console.log);
```

(En cross-origin necesitas que las cookies de sesión se envíen al backend o usar un token en el header; si usas proxy desde el front, mejor la primera opción.)

### Opción 2: Script con login (recomendado desde tu máquina)

Desde `backend/` con `AUTOPILOT_LOGIN_USER` y `AUTOPILOT_LOGIN_PASSWORD` configurados (usuario admin de producción):

```bash
cd backend
npx tsx scripts/run-reconciliation-audit.ts https://ivan-reseller-backend-production.up.railway.app
```

El script hace login y llama al endpoint; la auditoría puede tardar varios minutos si hay muchos listados.

### Opción 3: Con curl y JWT

1. Obtén un token (login): `POST /api/auth/login` con tu usuario.
2. Ejecuta:

```bash
curl -X POST "https://ivan-reseller-backend-production.up.railway.app/api/publisher/listings/run-reconciliation-audit" -H "Authorization: Bearer <TU_JWT>" -H "Content-Type: application/json"
```

## Respuesta esperada

```json
{
  "success": true,
  "scanned": 42,
  "corrected": 2,
  "errors": 0,
  "message": "Audit completed: 42 scanned, 2 corrected, 0 errors."
}
```

Tras esto, los listados que en el marketplace devuelven error (p. ej. VIP67-RKR3XDH0NSUY) quedarán con `status = failed_publish` y el dashboard dejará de contarlos como activos.
