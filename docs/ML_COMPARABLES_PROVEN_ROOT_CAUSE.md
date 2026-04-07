## ML comparables — causa raíz pendiente de telemetría

- El bloqueo actual se manifiesta como:
  - búsqueda autenticada sin resultados utilizables O no ejecutada, seguida por
  - catálogo público `/sites/{site}/search` con HTTP 403 desde la IP de backend.
- La telemetría recién añadida permitirá distinguir:
  - falta de credenciales / token,
  - fallos en búsqueda autenticada (HTTP + error),
  - `siteId` equivocado,
  - cero resultados genuinos,
  - 403 público tras cero resultados autenticados.

