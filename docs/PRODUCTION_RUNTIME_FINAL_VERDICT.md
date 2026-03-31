# Veredicto — runtime producción (post-fix)

## Estado

Corregidos: verificación DS inválida, mensaje de boot AliExpress engañoso, orden ML autenticado-antes-público, hint en auth-status, probe ML alineado con Opportunities.

## Condicional

Si ML u AliExpress siguen fallando por política del proveedor (403 irreductible, product probe con ID no válido para la app), **ESTIMADO** permanece justificado; el sistema debe **mostrar el motivo**, no ocultarlo.

## Deploy

Tras push: verificar `/api/version`, OAuth dropshipping (logs sin InvalidApiPath), Opportunities con usuario con token ML.
