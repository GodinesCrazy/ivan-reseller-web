# Opportunity import — final verdict

## Veredicto

**OPPORTUNITY_IMPORT_PARTIALLY_FIXED** → en entornos con **credenciales AliExpress Affiliate (production)** configuradas para el usuario, el flujo pasa a ser **OPPORTUNITY_IMPORT_FIXED_AND_OPERATIONAL** para el ciclo canario típico (búsqueda → import → Products con SKU/envío/total coherentes).

Sin credenciales Affiliate, el producto conserva metadatos de import correctos en la raíz de `productData` pero puede seguir bloqueado por `missingSku` / `missingShipping` hasta otro enriquecimiento (scrape, DS API, o configuración).

## Por qué no “100 % siempre”

- La API puede no devolver SKUs o envío para un ítem concreto.
- URLs sin ID de producto extraíble y sin `aliExpressItemId` no pueden enriquecerse por este camino.
- Auditoría preventiva completa y publish readiness siguen siendo etapas posteriores explícitas.

## Evidencia en código

- Raíz `productData` con `preventivePublish` / `opportunityImport` / `importSource`.
- `opportunity-import-enrichment.service.ts` persistiendo `aliexpressSku` y envío cuando la API responde.
- `hasMachineVerifiablePublishContext` acepta `shippingCost === 0`.
- `preventiveAuditPending` para política en imports `PENDING`.

## Próximo salto de calidad (fuera de este PR conceptual)

- Enriquecimiento asíncrono con reintentos si Affiliate falla por timeout.
- Paridad en **AIOpportunityFinder** u otros entrypoints que llamen `POST /api/products` sin `importSource`.
