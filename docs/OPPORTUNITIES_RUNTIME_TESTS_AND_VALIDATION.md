# Opportunities runtime — tests and validation

## Automated (backend)

```bash
cd backend
npx jest src/__tests__/services/product.service.test.ts -t "409"
npx jest src/services/__tests__/mercadolibre-public-catalog.test.ts
npx tsc --noEmit
```

## Automated (frontend)

```bash
cd frontend
npm run build
```

## Manual smoke

1. **Duplicate:** Oportunidades → Importar un producto ya importado (misma URL AliExpress) → debe aparecer toast “Ya está importado”, con acciones Abrir / Productos; **no** mensaje de ID faltante.
2. **Commercial truth:** Búsqueda con región LATAM → filas con comparables deben mostrar **Real** y línea “Comparables” cuando el API envía `commercialTruth`.
3. Tras refrescar credenciales marketplace → nueva búsqueda sin depender solo de caché antigua (o esperar invalidación al guardar).
