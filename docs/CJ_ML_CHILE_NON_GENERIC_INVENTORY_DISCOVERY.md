# CJ → ML Chile — Non-Generic Inventory Discovery Report

## 1. EXECUTIVE SUMMARY
Este informe detalla los resultados del audit técnico profundo realizado sobre la API de CJ Dropshipping para intentar localizar inventario local en Chile mediante rutas no genéricas (metadatos, almacenes, categorías y sondeo ciego).

**Resultado Final**: **NEGATIVO**. 
No se ha encontrado evidencia de inventario local (`countryCode=CL`) disponible a través de la API pública de CJ, incluso utilizando filtros especializados y endpoints logísticos.

---

## 2. METODOLOGÍA DE DESCUBRIMIENTO
Se ejecutaron tres fases de sondeo técnico:
1.  **Auditoría de Almacenes**: Intento de enumeración de warehouses y búsqueda de localizaciones ("Chile", "Santiago").
2.  **Búsqueda Técnica Particionada**: Uso del filtro nativo `countryCode=CL` en combinaciones con CIDs (Category IDs) y semillas de búsqueda.
3.  **Sondeo Ciego de Fletes (The "Acid Test")**: Intento forzado de calcular flete `CL -> CL` para productos top-sellers globales para ver si la operabilidad existe pero está oculta en los metadatos.

---

## 3. RESULTADOS POR VESTIGIO TÉCNICO

### 3.1 Auditoría de Almacenes
- **Endpoints Probados**: `/api2.0/v1/warehouse/detail`, `logistic/getWarehouseByEndCountry`.
- **Resultado**: **FALLIDO**.
  - `warehouse/detail` devolvió `HTTP 400` (posiblemente requiere ser un partner de nivel superior o parámetros privados).
  - `logistic/getWarehouseByEndCountry` devolvió `Interface not found`.
- **Evidencia**: CJ no expone su red de almacenes para Chile en esta capa de API.

### 3.2 Búsqueda Técnica Particionada (`countryCode=CL`)
- **Filtro**: `product/listV2?countryCode=CL`
- **Semillas**: [Broad], 'Phone', 'Home', 'Kitchen'.
- **Muestreo por Categoría**: Se probaron las 14 categorías raíz.
- **Resultado**: **0 IMPACTOS**.
- **Interpretación**: Ni el motor de búsqueda ni el motor de filtrado por país reconocen productos localizados en Chile para esta cuenta.

### 3.3 Auditoría de Categorías (CIDs)
- **Método**: Extracción de CIDs vía `product/getCategory` y escaneo de productos dentro de cada rama.
- **Resultado**: **0 IMPACTOS de stock CL**.
- **Interpretación**: No hay "zonas calientes" de inventario chileno en ninguna categoría estándar.

### 3.4 Sondeo Ciego de Fletes (Acid Test)
- **Método**: Se tomaron 5 productos "ganadores" globales y se les pidió cotización `startCountryCode=CL` -> `endCountryCode=CL`.
- **Resultado**: **FALLIDO (Empty data array)**.
- **Conclusión**: No hay operabilidad logística encubierta para estos productos.

---

## 4. RESPUESTAS OPERACIONALES

**1. ¿Es descubrible el inventario local de Chile vía API?**
**No.** Para este nivel de integración y API Key, el catálogo local es invisible.

**2. ¿Qué bloquea el descubrimiento?**
Principalmente la **falta de metadatos públicos**. CJ no marca sus productos como disponibles en Chile en el catálogo de búsqueda de la API 2.0.

**3. ¿Es el bloqueador la búsqueda genérica?**
No. Incluso saltándose la búsqueda (usando categorías y sondeo directo) el resultado es nulo. El bloqueador es la **ausencia real de catálogo operable** o su **encapsulamiento en cuentas privadas/agentes**.

---

## 5. RECOMENDACIÓN TÉCNICA
- **Estado del Módulo**: El código es robusto y protege al vendedor rechazando productos no operables.
- **Acción Sugerida**:
  - **Sourcing Manual**: El usuario debe obtener CIDs/SKUs directamente de un agente de CJ que confirme stock en Chile y agregarlos por ID.
  - **Pivote Estratégico**: Aceptar que el modelo "Local -> Local" en Chile vía CJ-API no es automatizable por descubrimiento en este momento.

---

## 6. ARTIFACTS DE EVIDENCIA
- [cj-ml-chile-non-generic-discovery-results.json](file:///c:/Ivan_Reseller_Web/backend/cj-ml-chile-non-generic-discovery-results.json)
- [cj-ml-chile-deep-discovery-results.json](file:///c:/Ivan_Reseller_Web/backend/cj-ml-chile-deep-discovery-results.json)
- [cj-ml-chile-final-probe-results.json](file:///c:/Ivan_Reseller_Web/backend/cj-ml-chile-final-probe-results.json)
