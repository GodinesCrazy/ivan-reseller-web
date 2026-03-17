# Cómo activar un ciclo optimizado

Guía para poner en marcha los ciclos de dropshipping automáticos con la configuración optimizada (Sales Acceleration ya está **Enabled** en tu Control Center).

---

## Requisitos previos (ya los tienes)

- **Database, Redis, Workers:** ok (Control Center).
- **Autonomous mode:** enabled.
- **Marketplaces:** 5 configured · **Supplier:** Yes.
- **Sales Acceleration Mode:** Enabled (precios agresivos, hasta 40 publicaciones/día, 15/hora, SEO en títulos).

Falta solo **iniciar el Autopilot** para que los ciclos se ejecuten.

---

## Pasos para activar un ciclo optimizado

### 1. Ir a Autopilot

En el menú izquierdo: **Flujo principal** → **Autopilot**.

### 2. Revisar configuración (opcional)

En la misma página suele haber sección de **Configuración** o **Config** del Autopilot. Comprueba que tengas:

- **Target marketplaces:** Mercado Libre y/o eBay (según quieras).
- **Intervalo entre ciclos:** p. ej. 15 minutos (`cycleIntervalMinutes`).
- **Límites:** capital de trabajo, beneficio mínimo por producto, ROI mínimo (los valores por defecto suelen ser razonables; si quieres más agresivo, baja un poco `minProfitUsd` o `minRoiPct`).

No es obligatorio cambiar nada si ya está guardado con `enabled: true`; con **Start Autopilot** basta para que corra.

### 3. Iniciar el Autopilot

- Busca el botón **"Start Autopilot"** (verde, con icono de Play).
- Haz clic en **Start Autopilot**.
- Deberías ver: *"Autopilot started. First cycle running…"* y el estado pasará a **"En ejecución"**.

A partir de ahí:

- Se ejecuta un **primer ciclo** de inmediato (buscar oportunidades → filtrar → analizar → publicar).
- Los siguientes ciclos se programan solos cada **X minutos** (el intervalo configurado, p. ej. 15).

### 4. Comprobar que está corriendo

- **En Autopilot:** estado **"En ejecución"**, fase del ciclo (Buscar → Filtrar → Analizar → Publicar) y **"Último ciclo"** con fecha/hora reciente.
- **En Control Center:** en **System Readiness** debe aparecer **"Ciclos de dropshipping: En ejecución (Autopilot activo)"** y **"Último ciclo: &lt;fecha&gt;"**.

### 5. Dejar que trabaje

- No hace falta hacer nada más: los ciclos se repiten automáticamente.
- Sales Acceleration ya está activo, así que el motor usará precios competitivos (top 25% más baratos) y los límites de 40/día y 15/hora.
- Si quieres parar: en Autopilot, **Stop Autopilot**.

---

## Si "Ciclos de dropshipping" sigue en Parados

- **Autopilot no iniciado:** entra en **Autopilot** y pulsa **Start Autopilot** (paso 3).
- **Config no guardada con enabled:** en la UI de Autopilot, guarda la configuración con la opción de "habilitar" o "enabled" activada; luego **Start Autopilot**.
- **Usuario sin PayPal:** el ciclo corre con el primer usuario activo que tenga `paypalPayoutEmail`. Si el admin no lo tiene, configura el email de PayPal en el perfil/cuenta.

---

## Resumen en una línea

**Ir a Autopilot → Start Autopilot** y comprobar en Control Center que **"Ciclos de dropshipping"** pase a **En ejecución**.
