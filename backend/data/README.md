# Adaptive Selector System - Data Directory

Este directorio almacena los patrones de selectores aprendidos por el sistema adaptativo.

## Archivos

- `selector-patterns.json` - Patrones de selectores con tasas de éxito y fallbacks

## Descripción

El **Selector Adapter Service** aprende automáticamente qué selectores funcionan mejor para cada elemento y guarda esta información para futuras ejecuciones.

### Características:

1. **Auto-learning**: Cuando encuentra un elemento con éxito, guarda el selector usado
2. **Success tracking**: Mantiene tasa de éxito de cada selector
3. **Prioritization**: Los selectores más exitosos se prueban primero
4. **Fallback chains**: Múltiples selectores alternativos para cada elemento

### Formato del archivo:

```json
{
  "productTitle": {
    "primary": "h1[data-pl='product-title']",
    "fallbacks": [
      "h1.product-title-text",
      ".product-title h1",
      "h1[class*='title']"
    ],
    "successRate": 0.95,
    "lastSuccess": "2025-10-29T10:30:00.000Z",
    "description": "Product title on detail page"
  }
}
```

### Notas:

- El sistema actualiza automáticamente este archivo
- No modificar manualmente a menos que sea necesario
- Backup automático cada 100 actualizaciones exitosas
