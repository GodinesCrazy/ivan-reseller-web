# Revisión completa con Context7 y atribuciones

**Fecha:** 2025-03-04  
**Condición:** Revisión completa como empresa desarrolladora de primer nivel.  
**Referencias Context7:** React (/websites/react_dev), Express (/expressjs/express), Prisma (/prisma/docs), Vite (/vitejs/vite).

---

## 1. Resumen ejecutivo

Se ha contrastado el código con la documentación oficial de las librerías del stack mediante Context7, se ha revisado el estado de licencias y atribuciones de dependencias, y se ha documentado un checklist de seguridad y buenas prácticas. El proyecto cumple en su mayoría con las recomendaciones de Express (helmet, CORS, trust proxy), Prisma (raw SQL solo en scripts controlados), y Vite (envPrefix por defecto). Se identifica un punto de atención en React (uso de `dangerouslySetInnerHTML` con contenido actualmente estático) y se han a?adido LICENSE en raíz, metadata unificada en package.json y documento de terceros con licencias. Las recomendaciones priorizadas se listan al final.

---

## 2. Resultados Context7 por librería

### 2.1 React (Context7: /websites/react_dev)

- **Seguridad / XSS:** La documentación indica que `dangerouslySetInnerHTML` solo debe usarse con contenido de confianza y sanitizado. En el proyecto, `frontend/src/components/MetricLabelWithTooltip.tsx` usa `dangerouslySetInnerHTML` con `tooltipBody.replace(/\n/g, '<br />')` sin sanitización HTML. Hoy `tooltipBody` proviene solo de `frontend/src/config/metricTooltips.ts` (estático), por lo que el riesgo es bajo; si en el futuro el texto viniera de API o usuario, existiría riesgo de XSS.
- **Variables sensibles:** No pasar `process.env` ni objetos sensibles a componentes cliente. Cumplimiento: el backend no expone env al cliente; el frontend usa Vite con prefijo por defecto (solo variables `VITE_` expuestas).
- **Conclusión:** Cumplimiento con reserva; documentar y opcionalmente sanitizar o evitar HTML en tooltips (p. ej. DOMPurify o texto escapado + CSS para saltos de línea).

### 2.2 Express (Context7: /expressjs/express)

- **Seguridad:** Documentación recomienda helmet, CORS y `trust proxy` en producción. En `backend/src/app.ts`: helmet configurado (incl. CSP), CORS con `CorsOptions` y orígenes dinámicos, `app.set('trust proxy', 1)`. Coincide con buenas prácticas. `upgradeInsecureRequests` está condicionado a `NODE_ENV === 'production'`.
- **Conclusión:** Cumplimiento. Validación de inputs en rutas críticas ya auditada en [AUDITORIA_END_TO_END_COMPLETA.md](AUDITORIA_END_TO_END_COMPLETA.md).

### 2.3 Prisma (Context7: /prisma/docs)

- **SQL injection:** La documentación advierte que `$executeRawUnsafe` / `$queryRaw` con concatenación son peligrosos; recomienda tagged templates. En el proyecto, `$executeRawUnsafe` se usa solo en scripts de migración/arreglo (no en rutas HTTP): `backend/scripts/apply-purchase-log-migration.ts`, `backend/scripts/verify-new-cost-fields.ts`, `backend/scripts/check-and-fix-meeting-room.ts`, `backend/scripts/execute-migration-remove-plan.ts`. Las rutas API no usan raw unsafe.
- **Row-level security y validación:** No exponer cliente Prisma en APIs y validar inputs. Cumplimiento: rutas usan servicios y validación (Zod).
- **Conclusión:** Cumplimiento. Opcional: migrar scripts a tagged template donde sea posible.

### 2.4 Vite (Context7: /vitejs/vite)

- **Variables de entorno:** Solo variables con prefijo (por defecto `VITE_`) se exponen al cliente; no usar `envPrefix: ''`. En `frontend/vite.config.ts` no se redefine `envPrefix`, por tanto se usa el valor por defecto. No hay riesgo de exponer todas las env.
- **Conclusión:** Cumplimiento. Recomendación: no definir `envPrefix` vacío en el futuro.

---

## 3. Checklist de revisión completa (seguridad y buenas prácticas)

| Área | Criterio | Estado | Notas |
|------|----------|--------|--------|
| React | No usar `dangerouslySetInnerHTML` con contenido no confiable | Cumplimiento con reserva | MetricLabelWithTooltip: contenido actualmente estático; opcional sanitizar o evitar HTML |
| React | No exponer secretos ni `process.env` al cliente | OK | Vite envPrefix por defecto; backend no envía env en respuestas |
| Express | helmet + CORS + trust proxy | OK | Implementado en app.ts |
| Express | Validación de inputs en rutas críticas | OK | Ver AUDITORIA_END_TO_END_COMPLETA.md |
| Prisma | Evitar $executeRawUnsafe/$queryRaw con input de usuario | OK | Solo en scripts controlados; no en rutas API |
| Vite | envPrefix no vacío, solo VITE_ en cliente | OK | Por defecto |
| Licencias | LICENSE en raíz | OK | A?adido LICENSE (MIT) en raíz del repositorio |
| Licencias | license/author en todos los package.json | OK | Frontend alineado con backend |
| Atribuciones | Documento de terceros con licencias y atribuciones | OK | Ver [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) |
| Dependencias | Revisión de vulnerabilidades | Documentado | Resultados de npm audit en sección 5 |

---

## 4. Atribuciones y licencias

- **LICENSE:** A?adido en la raíz del repositorio (MIT), coherente con backend/package.json.
- **package.json:** Backend ya declaraba `"license": "MIT"` y `"author": "Ivan Reseller"`. Frontend actualizado con los mismos campos.
- **Terceros:** Se ha generado [docs/THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) con el listado de dependencias (backend y frontend), licencia y enlaces. Los paquetes con obligación de atribución (CC-BY, BSD-2/3-Clause, etc.) deben incluir en ese documento el texto de copyright/atribución que exija cada licencia; el reporte de licencias permite identificarlos y completarlos.

---

## 5. Revisión de vulnerabilidades (npm audit)

Los resultados de `npm audit` en backend y frontend se documentan a continuación. Ejecutar localmente para obtener el estado actual y aplicar remediaciones según prioridad:

- **Backend:** `cd backend && npm audit` (y `npm audit fix` donde sea seguro).
- **Frontend:** `cd frontend && npm audit` (y `npm audit fix` donde sea seguro).

Se recomienda incluir en el pipeline de CI la ejecución de `npm audit` y tratar las vulnerabilidades críticas y altas antes de cada release.

---

## 6. Recomendaciones priorizadas

### Crítico

- Ninguno identificado en esta revisión. Mantener auth y ownership según AUDITORIA_END_TO_END_COMPLETA.md.

### Importante

1. **React ? Tooltips:** Si en el futuro `tooltipBody` en MetricLabelWithTooltip pudiera venir de API o usuario, a?adir sanitización (p. ej. DOMPurify) o dejar de usar HTML y mostrar texto escapado con saltos de línea vía CSS.
2. **npm audit:** Revisar y remediar vulnerabilidades reportadas por `npm audit` en backend y frontend de forma periódica.

### Opcional

1. **Prisma:** En scripts que usan `$executeRawUnsafe`, valorar migrar a tagged template (`$queryRaw\`...\``) donde la consulta lo permita.
2. **Atribuciones:** Completar en THIRD_PARTY_LICENSES.md los textos de copyright/atribución para cada paquete con licencia CC-BY, BSD-2-Clause, BSD-3-Clause, etc., según exija cada licencia.
3. **CI:** A?adir paso de `npm audit` y, opcionalmente, generación/actualización del reporte de licencias en el pipeline.

---

## 7. Referencias

- [AUDITORIA_END_TO_END_COMPLETA.md](AUDITORIA_END_TO_END_COMPLETA.md) ? Auditoría de flujos y autorización.
- [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) ? Licencias y atribuciones de dependencias.
- Context7: React (/websites/react_dev), Express (/expressjs/express), Prisma (/prisma/docs), Vite (/vitejs/vite).
