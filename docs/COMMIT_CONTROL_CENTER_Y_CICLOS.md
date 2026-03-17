# Commit: Control Center, utilidades, ciclos y guías

Ejecuta en la raíz del repo (`c:\Ivan_Reseller_Web`):

```bash
git add frontend/src/pages/ControlCenter.tsx
git add backend/docs/RAILWAY_REDIS_SETUP.md
git add backend/docs/VERIFICAR_UTILIDADES.md
git add backend/docs/CICLOS_DROPSHIPPING_Y_OPTIMIZACION.md
git add backend/docs/ACTIVAR_CICLO_OPTIMIZADO.md
git add backend/scripts/seed-demo-sale-for-utilidades.ts
git add backend/package.json
git add docs/COMMIT_CONTROL_CENTER_Y_CICLOS.md

git status
git commit -m "feat(control-center): utilidades, ciclos dropshipping y guías

- Control Center: sección Utilidades (profit today/month), estado Ciclos de dropshipping (Autopilot)
- Docs: VERIFICAR_UTILIDADES, CICLOS_DROPSHIPPING_Y_OPTIMIZACION, ACTIVAR_CICLO_OPTIMIZADO
- RAILWAY_REDIS_SETUP: opción CLI para reiniciar Redis y REDIS_URL
- Script opcional seed:utilidades para demo sale (no requerido para ciclos)"

git push origin main
```

Si tu rama principal no es `main`, cambia `main` por el nombre correcto (por ejemplo `master`).
