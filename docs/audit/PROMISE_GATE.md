# 🚪 PROMISE GATE - Guía de Uso

**Fecha:** 2025-01-28  
**Objetivo:** Script de verificación automatizada para validar que la promesa (claims A-E) está lista

---

## 📋 DESCRIPCIÓN

El script `scripts/promise_gate.ps1` valida automáticamente que:

1. ✅ Builds compilan correctamente (backend + frontend)
2. ✅ Tests pasan (si existen)
3. ✅ Smoke tests de endpoints clave funcionan
4. ✅ Documentación obligatoria existe
5. ✅ Flags peligrosos están OFF por defecto

---

## 🚀 USO BÁSICO

### Ejecutar Promise Gate

```powershell
# Desde el root del proyecto
.\scripts\promise_gate.ps1
```

### Opciones

```powershell
# Saltar tests
.\scripts\promise_gate.ps1 -SkipTests

# Saltar smoke tests
.\scripts\promise_gate.ps1 -SkipSmoke

# Especificar URL del backend (default: http://localhost:3000)
.\scripts\promise_gate.ps1 -BackendUrl "http://localhost:3000"

# Combinar opciones
.\scripts\promise_gate.ps1 -SkipTests -BackendUrl "https://api.ivanreseller.com"
```

---

## ✅ CHECKS EJECUTADOS

### 1. Builds

- **Backend Build:** `npm run build` en `backend/`
- **Frontend Build:** `npm run build` en `frontend/`

**Status:** ✅ PASSED | ❌ FAILED | ⏭️ SKIPPED

---

### 2. Tests

- **Backend Tests:** `npm test` en `backend/` (si existe script)
- **Frontend Tests:** `npm test` en `frontend/` (si existe script)

**Status:** ✅ PASSED | ❌ FAILED | ⏭️ SKIPPED

**Nota:** Si no hay script `test` en `package.json`, se marca como SKIPPED

---

### 3. Smoke Tests

Requiere backend corriendo y `-BackendUrl` especificado (o default `http://localhost:3000`).

- **Health Check:** `GET /health` → Expected: HTTP 200
- **Ready Check:** `GET /ready` → Expected: HTTP 200
- **Opportunities API (Claim A):** `GET /api/opportunities?query=test&maxItems=1` → Expected: HTTP 401 (auth required, endpoint existe)
- **CORS Preflight (Claim C):** `OPTIONS /api/marketplace/publish` con `Origin: https://www.ivanreseller.com` → Expected: HTTP 204

**Status:** ✅ PASSED | ❌ FAILED | ⏭️ SKIPPED

**Nota:** Si backend no está disponible, se marca como SKIPPED

---

### 4. Documentación Obligatoria

Verifica que existen los documentos requeridos:

- ✅ `docs/audit/CAPABILITY_TRUTH_MATRIX.md` - Matriz de verdad claims vs evidencia
- ✅ `docs/audit/E2E_EVIDENCE.md` - Pruebas end-to-end reproducibles
- ✅ `docs/audit/GAPS_TO_PROMISE_BACKLOG.md` - Backlog de gaps P0/P1/P2

**Status:** ✅ PASSED (existe y no vacío) | ⚠️ WARNING (existe pero vacío) | ❌ FAILED (no existe)

---

### 5. Flags Validation (OFF by default)

Verifica que flags peligrosos no están activados por defecto:

- `AUTOPILOT_ENABLED`
- `AUTO_PURCHASE_ENABLED`
- `AUTO_PUBLISH_ENABLED`

**Status:** ✅ PASSED (todos OFF) | ⚠️ WARNING (algunos ON)

**Nota:** Si un flag está ON, se marca como WARNING (no bloquea, pero alerta)

---

## 📊 SALIDA DEL SCRIPT

### Ejemplo de Salida (Éxito)

```
========================================
  Promise Gate - Ivan Reseller Web
  Validating Claims A-E Readiness
========================================

=== 1. BUILDS ===
[INFO] Running: Backend Build
[SUCCESS] Backend Build: PASSED
[INFO] Running: Frontend Build
[SUCCESS] Frontend Build: PASSED

=== 2. TESTS ===
[INFO] Running: Backend Tests
[SUCCESS] Backend Tests: PASSED
[INFO] Running: Frontend Tests
[SKIPPED] Frontend Tests: SKIPPED (no test script)

=== 3. SMOKE TESTS ===
[INFO] Testing: Health Check (GET http://localhost:3000/health)
[SUCCESS] Health Check: PASSED (HTTP 200)
[INFO] Testing: Ready Check (GET http://localhost:3000/ready)
[SUCCESS] Ready Check: PASSED (HTTP 200)
[INFO] Testing: Opportunities API (Claim A) (GET ...)
[SUCCESS] Opportunities API (Claim A): PASSED (HTTP 401)
[INFO] Testing: CORS Preflight (Claim C) (OPTIONS ...)
[SUCCESS] CORS Preflight (Claim C): PASSED (HTTP 204)

=== 4. DOCUMENTATION (Obligatory) ===
[INFO] Checking: Capability Truth Matrix
[SUCCESS] Capability Truth Matrix: EXISTS (45.23 KB)
[INFO] Checking: E2E Evidence
[SUCCESS] E2E Evidence: EXISTS (38.91 KB)
[INFO] Checking: Gaps to Promise Backlog
[SUCCESS] Gaps to Promise Backlog: EXISTS (12.34 KB)

=== 5. FLAGS VALIDATION (OFF by default) ===
[SUCCESS] Flag AUTOPILOT_ENABLED: OK (OFF or not set)
[SUCCESS] Flag AUTO_PURCHASE_ENABLED: OK (OFF or not set)
[SUCCESS] Flag AUTO_PUBLISH_ENABLED: OK (OFF or not set)
[SUCCESS] Flags Validation: PASSED

========================================
  PROMISE GATE SUMMARY
========================================

  BackendBuild : ✅ PASSED
  FrontendBuild : ✅ PASSED
  BackendTest : ✅ PASSED
  FrontendTest : ⏭️  SKIPPED
  SmokeHealth : ✅ PASSED
  SmokeReady : ✅ PASSED
  SmokeOpportunities : ✅ PASSED
  SmokeCors : ✅ PASSED
  DocsCapabilityMatrix : ✅ PASSED
  DocsE2EEvidence : ✅ PASSED
  DocsGapsBacklog : ✅ PASSED
  FlagsValidation : ✅ PASSED

Total: 10 passed, 0 failed, 0 warnings, 2 skipped

========================================
  PROMISE-READY STATUS
========================================

✅ PROMISE-READY: YES (with validations pending)

Note: Code is ready, but production validations are pending:
  - P0.1: Amazon SP-API (requires production credentials)
  - P0.2: AliExpress Auto-Purchase (requires production validation)

See docs/audit/GAPS_TO_PROMISE_BACKLOG.md for details

========================================
```

---

### Ejemplo de Salida (Fallo)

```
========================================
  PROMISE GATE SUMMARY
========================================

  BackendBuild : ✅ PASSED
  FrontendBuild : ❌ FAILED
  BackendTest : ⏭️  SKIPPED
  FrontendTest : ⏭️  SKIPPED
  SmokeHealth : ⏭️  SKIPPED
  SmokeReady : ⏭️  SKIPPED
  SmokeOpportunities : ⏭️  SKIPPED
  SmokeCors : ⏭️  SKIPPED
  DocsCapabilityMatrix : ✅ PASSED
  DocsE2EEvidence : ❌ FAILED
  DocsGapsBacklog : ✅ PASSED
  FlagsValidation : ✅ PASSED

Total: 3 passed, 2 failed, 0 warnings, 6 skipped

========================================
  PROMISE-READY STATUS
========================================

❌ PROMISE-READY: NO

Reason: Critical checks failed or missing documentation

Required actions:
  1. Fix failed builds/tests
  2. Ensure all obligatory docs exist in docs/audit/
  3. Review GAPS_TO_PROMISE_BACKLOG.md for P0 items

========================================
```

---

## 🎯 DECISIÓN: PROMISE-READY

### Criterios para "PROMISE-READY: YES"

1. ✅ **Builds:** Backend y Frontend compilan sin errores
2. ✅ **Documentación:** Los 3 documentos obligatorios existen y no están vacíos
3. ✅ **Flags:** Flags peligrosos están OFF (o WARNING es aceptable)

### Criterios para "PROMISE-READY: NO"

1. ❌ **Builds:** Algún build falla
2. ❌ **Documentación:** Algún documento obligatorio falta o está vacío
3. ❌ **Tests críticos:** Si hay tests, deben pasar (SKIPPED es aceptable si no hay script)

### Notas Importantes

- **Smoke tests:** Son opcionales (SKIPPED es aceptable si backend no está disponible)
- **Tests:** Son opcionales (SKIPPED es aceptable si no hay script `test`)
- **Warnings:** No bloquean "PROMISE-READY: YES" pero deben revisarse

---

## 🔧 TROUBLESHOOTING

### Build Falla

```powershell
# Verificar manualmente
cd backend
npm run build

cd ../frontend
npm run build
```

### Smoke Tests Falla

```powershell
# Verificar que backend está corriendo
curl http://localhost:3000/health

# Verificar URL correcta
.\scripts\promise_gate.ps1 -BackendUrl "http://localhost:3000"
```

### Documentación Faltante

```powershell
# Verificar que existen
Test-Path docs\audit\CAPABILITY_TRUTH_MATRIX.md
Test-Path docs\audit\E2E_EVIDENCE.md
Test-Path docs\audit\GAPS_TO_PROMISE_BACKLOG.md
```

---

## 📝 INTEGRACIÓN CI/CD

### GitHub Actions (ejemplo)

```yaml
name: Promise Gate
on: [push, pull_request]

jobs:
  promise-gate:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install dependencies
        run: |
          cd backend && npm ci
          cd ../frontend && npm ci
      - name: Run Promise Gate
        run: |
          .\scripts\promise_gate.ps1 -SkipSmoke
```

---

## 🔗 REFERENCIAS

- **Script:** `scripts/promise_gate.ps1`
- **Documentación relacionada:**
  - `docs/audit/CAPABILITY_TRUTH_MATRIX.md`
  - `docs/audit/E2E_EVIDENCE.md`
  - `docs/audit/GAPS_TO_PROMISE_BACKLOG.md`

---

**Última actualización:** 2025-01-28

