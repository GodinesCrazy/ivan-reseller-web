# ?? Funcionalidades Avanzadas del Autopilot

**Documentación para usuarios - Funciones recientes**

**Última actualización:** 2025-03-04

---

## Preset: 1 artículo de prueba (más económico)

Ideal para hacer tu primera publicación con el mínimo riesgo.

### Uso

1. Ir a **Autopilot**
2. Buscar el botón **"Usar valores para 1 artículo de prueba (más económico)"**
3. Hacer clic para aplicar el preset automáticamente

### Valores aplicados

| Parámetro | Valor |
|-----------|-------|
| `minProfitUsd` | 1 USD |
| `minSupplierPrice` | 0.50 USD |
| `minRoiPct` | 15 % |
| `maxActiveProducts` | 1 |

Con esto el sistema publicará un solo producto barato de prueba, útil para validar el flujo sin usar mucho capital.

---

## Duplicar productos ganadores (autoRepeatWinners)

Cuando un producto vende bien, el sistema puede crear listings adicionales automáticamente.

### Configuración

En **Autopilot ? Configuración avanzada**:

- **Repetir ganadores** (`autoRepeatWinners`): Activar para habilitar.
- **Máx. duplicados por producto** (`maxDuplicatesPerProduct`): Número máximo de listings del mismo producto (ej.: 2 o 3).

### Funcionamiento

1. El sistema calcula un **WinningScore** (0?100) basado en ROI, velocidad de venta y margen.
2. Si el score es **> 75**, el producto se considera ganador.
3. Si hay capital disponible y no se supera el máximo de duplicados, se crea otro listing del mismo producto.
4. Se respeta el límite de capital de trabajo y el máximo de listings activos.

### Cuándo usar

- Productos que venden bien y quieres más visibilidad.
- Para aumentar ventas sin buscar nuevos productos.

---

## Despublicación automática y reemplazo

El sistema puede despublicar productos de bajo rendimiento y reemplazarlos automáticamente.

### Condiciones de despublicación

Un producto se despublica automáticamente cuando:

1. **Capital insuficiente:** El costo del producto supera el capital disponible (respetando el buffer configurado).
2. **Baja conversión:** Si tiene ?100 visitas y la tasa de conversión está por debajo del mínimo (por defecto 0,5 %).
3. **Muchos días sin ventas:** Si pasan más de X días sin ventas (por defecto 60) y ha tenido visitas.

### Reemplazo automático

Cuando se despublica un producto, el sistema lanza un ciclo del Autopilot para buscar y publicar uno nuevo que lo reemplace. No hace falta intervención manual.

### Variables de entorno (administrador)

- `WORKING_CAPITAL_BUFFER` ? Buffer de capital (por defecto 0.20).
- `MIN_CONVERSION_RATE` ? Tasa mínima de conversión en % (por defecto 0.5).
- `MAX_DAYS_WITHOUT_SALES` ? Días sin ventas antes de despublicar (por defecto 60).

---

## Estado del sistema (Business Diagnostics)

En el **Dashboard** (tab Resumen) hay una sección **"Estado del sistema"** que muestra el estado de los componentes clave.

### Componentes mostrados

| Componente | Descripción |
|------------|-------------|
| **Autopilot** | APIs de scraping y eBay configuradas |
| **Marketplace** | eBay configurado |
| **Supplier** | AliExpress configurado |
| **Payment** | PayPal (y opcionalmente Payoneer) configurado |
| **Database** | Conexión a base de datos OK |
| **Scheduler** | Estado del Autopilot (running/idle) |
| **Listings** | Número total de listings activos |
| **Sales** | Número total de ventas |

Cada componente aparece en **verde (OK)** o **rojo (FAIL)** para identificar rápidamente posibles problemas.

---

## ?? Ver también

- [Guía de Usuario - Sistema Autopilot](./USER_GUIDE.md#-sistema-autopilot)
- [Troubleshooting](./TROUBLESHOOTING.md)
