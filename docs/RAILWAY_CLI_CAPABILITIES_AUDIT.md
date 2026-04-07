# RAILWAY CLI CAPABILITIES AUDIT
**Date**: 2026-03-31  
**Executor**: SRE/DevOps (Claude Sonnet 4.6)

---

## Versión detectada

```
railway 4.29.0
```

---

## Auth status

```
railway whoami → Unauthorized. Please run `railway login` again.
RAILWAY_TOKEN=c2172a854870ad2623c4931abba6d1144488ca467f4c702461f5dae93f68318d → Invalid RAILWAY_TOKEN
railway login --browserless → Cannot login in non-interactive mode
```

**Veredicto**: ❌ CLI instalada pero sin sesión activa. Token almacenado en repo expirado/inválido.

---

## Proyecto linkeado localmente

```
railway status → Unauthorized (no puede leer)
```

El directorio `c:/Ivan_Reseller_Web` contiene `railway.toml` en raíz y `backend/railway.json`, lo que indica que existía un link previo. Sin auth no se puede verificar el link activo.

---

## Comandos disponibles en CLI

| Comando | Propósito | Relevante para remediación |
|---------|-----------|---------------------------|
| `whoami` | Verificar usuario autenticado | ✅ AUTH CHECK |
| `login` | Iniciar sesión | ✅ NECESARIO |
| `status` | Estado del proyecto actual | ✅ DIAGNÓSTICO |
| `variable list` | Listar variables | ✅ VARS |
| `variable set` | Aplicar variable | ✅ VARS |
| `redeploy` | Redeploy último deployment | ✅ DEPLOY |
| `restart` | Restart sin rebuild | ✅ RECOVERY |
| `logs` | Ver logs (build/deploy, streaming, histórico) | ✅ VALIDACIÓN |
| `service status` | Estado de deployments de servicios | ✅ DIAGNÓSTICO |
| `deployment list` | Listar deployments con IDs y estados | ✅ DIAGNÓSTICO |
| `up` | Upload directo desde disco | ⚠️ Alternativo |
| `link` | Asociar directorio con proyecto | ✅ SETUP |

---

## Limitaciones encontradas

| Limitación | Impacto |
|-----------|---------|
| No soporta `login` no-interactivo sin browser | No se puede autenticar en entorno headless |
| Token hex almacenado en repo expirado | No hay credencial válida disponible |
| `railway service` no tiene subcomando para ver/editar `rootDirectory`, `buildCommand`, `startCommand` | Configuración del servicio solo editable por Dashboard o API |
| No existe subcomando `railway config set` ni equivalente | Root directory, health path, etc. solo por Dashboard |

---

## Qué se PUEDE hacer por CLI (si se autentica)

- ✅ `railway variable set --service ivan-reseller-backend MIN_SUPPLIER_ORDERS=100` 
- ✅ `railway variable list --service ivan-reseller-backend`
- ✅ `railway redeploy --service ivan-reseller-backend -y`
- ✅ `railway restart --service ivan-reseller-backend`
- ✅ `railway logs --service ivan-reseller-backend --lines 100`

## Qué NO se puede hacer por CLI

- ❌ Cambiar `Root Directory` del servicio
- ❌ Cambiar `Start Command` del servicio
- ❌ Cambiar `Build Command` del servicio
- ❌ Cambiar tipo de servicio (Web Service / Worker)
- ❌ Configurar Healthcheck path/timeout
- ❌ Ver/modificar Public Networking / Port

---

## Conclusión

**Resolución por CLI: INVIABLE en este entorno** — CLI instalada pero sin auth activa y sin posibilidad de re-autenticar en modo headless.

**Plan B**: Railway Dashboard (navegador). Ver `RAILWAY_BACKEND_RECOVERY_PLAYBOOK.md`.

**Para re-habilitar CLI en el futuro**: En terminal con acceso a browser, ejecutar `railway login` (abre OAuth en navegador).
