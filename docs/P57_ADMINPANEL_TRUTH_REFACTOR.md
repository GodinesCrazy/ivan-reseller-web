# P57 — AdminPanel Truth Refactor

Date: 2026-03-24  
Sprint: P57 — Secondary truth surfaces convergence

## Objective

Refactor `AdminPanel.tsx` so technical/admin controls are separated from operational/commercial truth. Prevent admin controls or settings from being read as real operational success.

## Completed Changes

### 1. Banner: Technical Admin Context

- **Added:** Top banner (before page title):
  - "Panel técnico y de administración — gestión de usuarios, comisiones y configuración de plataforma."
  - "No sustituye verdad operativa canónica (Órdenes, Ventas, Finance, Control Center)."
  - Link to `/control-center`.

### 2. Stats Labels

| Stat | Before | After |
|------|--------|-------|
| Ingresos Totales | Ingresos Totales | Ingresos Totales (agregado admin) |
| Comisiones Mensuales | Comisiones Mensuales | Comisiones Mensuales (agregado) |

### 3. Stats Subtitles

- **Ingresos Totales:** Added "Desde ledger admin — no es proof operativo"
- **Comisiones Mensuales:** Added "Desde ledger admin"

## Distinctions Now Clear

| Concern | Where It Lives |
|---------|----------------|
| Technical configuration | AdminPanel (API keys, connectors, platform settings) |
| Connector/admin controls | AdminPanel |
| Operational truth | Orders, Control Center, OrderDetail |
| Marketplace readiness | Control Center, ProductPreview |
| Commercial proof | Finance, Sales proof ladder, Control Center |

## Ambiguities Removed

| Before | After |
|--------|-------|
| Admin stats could be read as operational proof | "agregado admin" / "Desde ledger admin — no es proof operativo" |
| No explicit separation from canonical truth | Banner links to Control Center and lists canonical pages |

## Verification

- AdminPanel clearly labeled as technical/admin.
- Stats explicitly marked as ledger aggregates, not operational proof.
- Link to Control Center for canonical truth.
