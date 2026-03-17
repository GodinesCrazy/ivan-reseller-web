# Capacidad del volumen PostgreSQL en Railway

Este documento describe el problema de capacidad del volumen de PostgreSQL en el proyecto **ivan-reseller** y los pasos para resolverlo y prevenir futuros llenados de disco.

---

## Problema

El volumen de datos de Postgres (`postgres-volume-kWVb`) puede estar configurado en **500 MB**. Cuando el uso se acerca al límite:

- Railway muestra un aviso de capacidad (por ejemplo, indicador A1 en el volumen).
- Pueden producirse fallos de escritura en la base de datos.
- En casos graves, Postgres no arranca (por ejemplo, si no puede escribir WAL durante el recovery).

---

## Solución inmediata: aumentar el tamaño del volumen (Live resize)

El aumento de tamaño del volumen **solo puede hacerse desde el Dashboard de Railway**; la CLI de Railway no expone un comando para cambiar el tamaño (solo permite `volume list | add | delete | update` para mount-path y nombre).

### Pasos

1. Ir a [Railway Dashboard](https://railway.app).
2. Seleccionar el proyecto **ivan-reseller** y el entorno (por ejemplo **production**).
3. Seleccionar el servicio **Postgres** (no el backend).
4. En la lista de recursos, abrir el volumen **postgres-volume-kWVb** (el que muestra el aviso de capacidad).
5. Ir a la pestaña **Settings**.
6. En **Volume Size** (p. ej. 500 MB), pulsar **Live resize**.
7. Elegir un tamaño mayor:
   - **1 GB**: recomendado como mínimo si el uso actual está cerca de 500 MB.
   - **2 GB** o más: si se espera mucho crecimiento (más productos, ventas, actividad).
8. Confirmar. Railway aplica el cambio sin downtime.

### Verificación

- En la pestaña **Metrics** del volumen o del servicio Postgres, comprobar que el uso de disco queda por debajo del nuevo límite.
- Revisar que el indicador de aviso (A1) desaparezca una vez aplicado el resize.

---

## Buenas prácticas para evitar llenar el disco

- **VACUUM:** Ejecutar `VACUUM ANALYZE` periódicamente para recuperar espacio y actualizar estadísticas (ver sección siguiente).
- **Retención de datos:** Revisar tablas muy grandes o datos históricos que se puedan archivar o purgar (logs, eventos antiguos, etc.).
- **Evitar blobs en la base de datos:** No almacenar ficheros grandes (imágenes, PDFs) en PostgreSQL; usar almacenamiento de objetos (S3, etc.) y en la base solo referencias.

---

## Ejecutar VACUUM (mantenimiento)

El script `backend/scripts/vacuum-postgres.ts` ejecuta `VACUUM ANALYZE` contra la base de datos configurada en `DATABASE_URL`.

### En local (con DATABASE_URL apuntando a Railway o a una copia)

```bash
cd backend
npm run vacuum:postgres
```

O con tsx directamente: `npx tsx scripts/vacuum-postgres.ts`

### En Railway (usando el backend que ya tiene DATABASE_URL)

Desde la raíz del monorepo, en el contexto del proyecto y entorno correctos:

```bash
railway link
railway run --service ivan-reseller-backend -- cd backend && npm run vacuum:postgres
```

O, si ya estás en el directorio `backend` y el proyecto/environment están enlazados:

```bash
railway run npm run vacuum:postgres
```

**Nota:** El servicio que tiene `DATABASE_URL` es el backend; Postgres en Railway es un servicio aparte. Por tanto el script se ejecuta desde el **servicio backend** (o desde tu máquina con `DATABASE_URL` configurada), no dentro del contenedor de Postgres.

Ejecutar este mantenimiento de forma periódica (por ejemplo mensual) o cuando se note un uso de disco alto ayuda a recuperar espacio y mantener el rendimiento.

---

## Referencia: Railway CLI y volúmenes

La Railway CLI permite gestionar volúmenes con comandos como:

- `railway volume list` – listar volúmenes
- `railway volume add --mount-path /ruta` – crear volumen
- `railway volume update --volume <id> --mount-path /nueva/ruta` – cambiar mount path
- `railway volume update --volume <id> --name nuevo-nombre` – renombrar

**No existe** en la CLI un flag para cambiar el **tamaño en GB/MB** del volumen; ese cambio solo está disponible en el Dashboard mediante **Live resize**.

---

**Última actualización:** 2026-03 (plan Railway Postgres capacity fix)
