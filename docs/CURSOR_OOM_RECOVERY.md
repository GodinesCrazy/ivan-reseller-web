# Recuperación OOM en Cursor (Out of Memory)

Si Cursor cierra con el error: **"La ventana finalizó inesperadamente (motivo: 'oom', código: '-536870904')"**, sigue estos pasos.

## Soluciones inmediatas (cuando ya ocurrió el crash)

### 1. Borrar historial de chat reciente
- Abre el panel **Chat History**
- Borra los chats más largos o recientes (suelen consumir más memoria)
- Los chats de más de ~2 horas son los que más impacto tienen

### 2. Limpiar workspace storage (solución más efectiva)
1. **Cierra Cursor por completo**
2. Abre: `C:\Users\ivanm\AppData\Roaming\Cursor\User\workspaceStorage`
3. Borra la carpeta **más recientemente modificada** (es la del workspace actual)
4. Reabre Cursor

Se perderán: disposición de paneles, historial de chat del workspace y estado de editores. El código del proyecto no se afecta.

## Prevención (ya aplicada en tu configuración)

Se añadieron en `settings.json`:
- **files.watcherExclude**: no vigilar `node_modules`, `dist`, `.git`, etc.
- **search.exclude**: excluir esas carpetas del índice de búsqueda
- **typescript.tsserver.maxTsServerMemory**: límite 4GB para el servidor TypeScript
- **editor.minimap.enabled**: false

## Buenas prácticas

1. **Sesiones cortas**: reinicia el chat cada 1–2 horas.
2. **Menos pestañas**: cierra archivos que no uses.
3. **Monitorear memoria**: en Windows, usa el Administrador de tareas; si el proceso “Renderer” de Cursor supera ~3,2 GB, cierra y reabre Cursor.
4. **Actualizaciones**: valora desactivar las actualizaciones automáticas; algunas versiones recientes de Cursor han aumentado el consumo de memoria.

## Si el problema continúa

- Comprueba extensiones pesadas y desactívalas temporalmente.
- Abre solo una ventana de Cursor por proyecto.
- Considera usar una versión estable anterior (p. ej. 2.3.34) si las más recientes son problemáticas.
