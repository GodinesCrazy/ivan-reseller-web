# Evidencia Git/Railway - FASE A
**Fecha:** 2025-12-18  
**Objetivo:** Confirmar que Railway despliega el commit correcto

---

## A1: Estado Local

**Git Status:**
```
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean
```

**HEAD Commit:**
```
a764f45 MERGE: GO certification work into main for Railway deploy
```

**HEAD SHA:**
```
a764f45d6b380803c2136ab68ec28cdfd7f13296
```

**Node/npm:**
- Node: v22.17.1
- npm: 10.9.2

---

## A2: Estado Remoto (GitHub)

**Origin/main SHA:**
```
a764f45d6b380803c2136ab68ec28cdfd7f13296
```

**Comparaciùn:**
- Local HEAD: a764f45d6b380803c2136ab68ec28cdfd7f13296
- Origin/main: a764f45d6b380803c2136ab68ec28cdfd7f13296
- ? **Coinciden**

---

## A3: Railway Deployment

**Commit SHA desplegado en Railway:**
```
[TBD - requiere verificaciùn manual en Railway Dashboard]
```

**URL Railway:**
- https://ivan-reseller-web-production.up.railway.app

**Verificaciùn:**
- [ ] Commit SHA coincide con origin/main
- [ ] Deploy exitoso
- [ ] /health responde 200
- [ ] /ready responde 200

---

## Seguridad: APIS.txt

**Verificaciùn:**
- `git ls-files | findstr /I "APIS.txt"`: [TBD]
- **Resultado:** [TBD]
