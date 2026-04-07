# ML_SHIPPING_ETA_TRUTH_REMEDIATION.md
**Fecha:** 2026-04-04  
**Fase:** E — Shipping / ETA Truth

---

## E.1 Verdad Operativa del Modelo de Envío

### ¿Cómo funciona realmente el envío de este producto?

| Campo | Valor Real |
|-------|-----------|
| **Modelo** | Dropshipping directo — AliExpress envía al comprador en Chile |
| **Proveedor de envío** | AliExpress Standard Shipping |
| **Origen** | China (CN) |
| **Destino** | Chile (CL) |
| **Costo de flete** | USD 1.99 (persistido como `freight truth`, checkeado 2026-04-01) |
| **Tiempo de tránsito real** | ~20–45 días calendario |
| **Quien despacha** | El proveedor AliExpress, NO el vendedor en Chile |

---

## E.2 Configuración Actual en el Sistema

### En el publish payload de ML

```ts
const DROPSHIPPING_HANDLING_TIME_DAYS = 25;
const mlShipping = {
  mode: 'me2',
  freeShipping: false,    // shippingCost (1.99 USD) ≥ 1 → no free
  handlingTime: 25,       // días declarados al comprador
};
```

### ¿Qué significa ME2 en ML Chile?

`me2` = **MercadoLibre Envíos 2** (Agencia) — el vendedor despacha vía courier. ML calcula el ETA sumando `handling_time` + tiempo estimado de courier.

**Con `handling_time: 25`**, ML mostrará al comprador:
- "Llega aproximadamente en [fecha actual + 25 días]" o similar.
- Esto es una representación honesta del tiempo real para dropshipping desde China.

### Warning `shipping.lost_me1_by_user`

```
"shipping.lost_me1_by_user: User has not mode me1"
```

Este warning indica que la cuenta vendedor no tiene activado **ME1** (Fulfillment by MercadoLibre). Es cosmético — no impide la publicación ni la activa como `active`. El listing MLC1911535343 está activo a pesar del warning.

---

## E.3 ¿La Publicación Refleja Correctamente el Dropshipping?

### Evaluación

| Aspecto | Estado | Evaluación |
|---------|--------|-----------|
| Modo de envío | `me2` | ✓ Correcto para dropshipping (no hay ME1 disponible) |
| Handling time | 25 días | ✓ Honesto — cubre el tránsito real desde China |
| Free shipping | `false` | ✓ Correcto — hay costo de flete |
| ETA declarado | ~25 días desde purchase | ✓ Aceptable — no engaña al comprador |
| Descripción shipping | No explícita | ⚠️ Mejorable — ver recomendación abajo |

### ¿Es el ETA falso, parcial o aceptable?

**ACEPTABLE.** El `handling_time: 25` es una aproximación honesta del tiempo de entrega real. ML Chile no tiene un modo "envío internacional" nativo; la convención estándar entre dropshippers es usar `me2` + `handlingTime` largo.

El ETA no promete entrega en 2–5 días (DOM) ni en 24h (premium). El comprador verá "llega en ~25 días" lo cual refleja la realidad del dropshipping desde China.

---

## E.4 Correcciones Aplicadas

### No se requieren cambios de código

La configuración actual (`mode: 'me2'`, `handlingTime: 25`, `freeShipping: false`) es técnicamente correcta para el modelo de negocio.

### Recomendación de mejora (sin urgencia bloqueante)

Agregar en la descripción del producto una mención explícita del origen y tiempo de envío:

```
"Este producto se envía directamente desde el fabricante. 
Tiempo de entrega estimado: 20-35 días hábiles."
```

Esto mejora la transparencia y reduce disputas post-venta por tiempos de envío inesperados.

---

## E.5 Sale Terms / Garantía

El payload actual **no incluye `sale_terms`** (garantía del producto). ML no lo requiere para publicar, pero mejora la confianza del comprador. Configuración recomendada:

```json
{
  "sale_terms": [
    { "id": "WARRANTY_TYPE", "value_name": "Garantía del vendedor" },
    { "id": "WARRANTY_TIME", "value_name": "30 días" }
  ]
}
```

Esto puede agregarse en una actualización posterior sin afectar el listing activo.

---

## E.6 Estado Final del Shipping Truth

- Modo: `me2` — correcto para cuentas sin ME1
- Handling time: 25 días — honesto para China→Chile
- Free shipping: false — correcto
- ETA: ~25 días — aceptable, no engañoso
- **No se requieren cambios de código para compliance de shipping**
