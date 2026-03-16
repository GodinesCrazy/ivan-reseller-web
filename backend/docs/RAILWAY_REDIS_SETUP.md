# Redis en Railway: Redis y Workers en "ok"

## Por que Redis y Workers salen "degraded"

En el Control Center, **Redis** y **Workers** aparecen en estado "degraded" cuando en el backend de Railway **no esta configurada la variable `REDIS_URL`** (o esta vacia). El sistema de salud comprueba:

- **Redis**: Si hay `REDIS_URL`, hace ping al servidor Redis. Si no hay URL, devuelve "degraded".
- **Workers**: Dependen de Redis y BullMQ (colas). Si Redis no esta configurado o no responde, Workers tambien se marcan "degraded".

Sin Redis configurado la app sigue funcionando (cache y colas en memoria o deshabilitadas), pero el panel mostrara esos estados en amarillo hasta que configures Redis en produccion.

## Redis ya existe pero esta parado

Si en Railway ya tienes un servicio **Redis** pero el Control Center sigue mostrando Redis y Workers en "degraded", es posible que el despliegue de Redis este parado. El mensaje **"The database deployment has stopped running"** en el panel de Redis DB indica que la instancia no esta en ejecucion.

**Pasos para corregirlo:**

1. **Reiniciar Redis**
   - En Railway, abre el servicio **Redis DB** (o el nombre que tenga tu Redis).
   - Ve a la pestaña **Deployments** o **Settings**.
   - Pulsa **Restart** o **Redeploy** para volver a levantar Redis. Si algo falla, usa **Open logs** para revisar el error.

2. **Enlazar REDIS_URL al backend**
   - Cuando Redis este **Online**, entra en el servicio **ivan-reseller-backend** > **Variables**.
   - Anade o referenciar la variable **REDIS_URL**. Si Redis esta en el mismo proyecto, usa **Reference** y elige la variable que expone Redis (p. ej. `REDIS_URL` o `REDIS_PRIVATE_URL`). Si no hay referencia, copia la URL de conexion desde Redis (Connect o Variables) y pegala como valor de `REDIS_URL` en el backend.

3. **Redesplegar el backend**
   - Guarda las variables. Railway redesplegara el backend. Asi tomara `REDIS_URL` y podra conectar a Redis.

4. **Comprobar**
   - En **ivanreseller.com** > **Control Center**, Redis y Workers deberian pasar a "ok" (verde) si Redis esta en marcha y el backend tiene `REDIS_URL` correcta.

## Pasos para anadir Redis en Railway

1. **Anadir el servicio Redis**
   - En tu proyecto de Railway, abre el proyecto donde esta el backend.
   - Pulsa **"+ New"** o **"Add Service"**.
   - Busca **Redis** en el catalogo / marketplace de Railway y anade un nuevo servicio Redis (o "Database" > Redis si esta disponible).
   - Railway creara el servicio y expondra una URL de conexion (por ejemplo `redis://default:password@host:port`).

2. **Enlazar Redis al backend**
   - Entra en el servicio **backend** (tu API Node).
   - Ve a la pestaña **Variables**.
   - Railway suele ofrecer **"Add variable"** o **"Reference"** para usar variables de otro servicio. Si anadiste Redis como servicio del mismo proyecto, busca la variable que Redis expone (p. ej. `REDIS_URL` o `REDIS_PRIVATE_URL`) y enlazala al backend.
   - Si no hay referencia automatica: en **Variables** del backend, crea una variable **`REDIS_URL`** y pega la URL de conexion que te da el servicio Redis (en Redis > Connect o Variables veras la URL).

3. **Redis externo (alternativa)**
   - Si usas un Redis externo (p. ej. Upstash, Redis Cloud), en el servicio backend anade la variable **`REDIS_URL`** con la URL de conexion que te proporcione el proveedor.

4. **Redesplegar**
   - Guarda los cambios. Railway redesplegara el backend. Si el backend ya estaba desplegado, puedes forzar un redeploy desde el servicio backend.

## Comprobar que todo esta ok

1. Tras el redeploy, abre la app en **ivanreseller.com** e inicia sesion.
2. Ve a **Control Center**.
3. En **System Readiness**, **Redis** y **Workers** deberian mostrarse en verde ("ok") si `REDIS_URL` esta definida y Redis responde al ping.

Si siguen en "degraded", revisa en Railway que el servicio backend tenga la variable `REDIS_URL` y que el valor sea una URL valida (p. ej. `redis://...`). Revisa los logs del backend por mensajes de conexion a Redis.
