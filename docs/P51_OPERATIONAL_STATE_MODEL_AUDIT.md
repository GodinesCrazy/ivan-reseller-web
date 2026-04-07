## P51 - Operational State Model Audit

### Required state families

The UI should distinguish at least these operational families:

1. discovery
2. candidate validation
3. image remediation
4. publication
5. external marketplace review
6. listing active
7. order ingestion
8. supplier purchase
9. tracking
10. delivery
11. released funds
12. realized profit

### Current UI model

The current UI mostly uses a legacy generalized pipeline:

- scrape
- analyze
- publish
- purchase
- fulfillment
- customerService

This appears in:

- `WorkflowSummaryWidget.tsx`
- `ProductWorkflowPipeline.tsx`
- some dashboard/autopilot narratives

### Main failures

1. Image remediation is missing as a first-class operational stage.
   - The MercadoLibre Chile path proved image remediation is a real blocking stage.
   - Current UI does not model it as an explicit lifecycle stage.

2. External marketplace review is missing or collapsed into vague publish status.
   - `under_review`
   - `waiting_for_patch`
   - policy review
   - active after patch
   These are operationally different and must not be collapsed into "published".

3. Listing active is not clearly separated from publication attempt success.
   - The system can create a listing, then lose active policy-clean state later.
   - UI needs:
     - publish attempt result
     - current marketplace state
     - last sync time

4. Commercial proof stages are not modeled rigorously.
   - order ingestion
   - supplier purchase proof
   - tracking proof
   - delivery truth
   - released funds
   - realized profit
   are currently scattered or absent.

5. Readiness is overloaded.
   - setup readiness
   - technical readiness
   - publication readiness
   - commercial readiness
   are different things but are often presented in one dashboard language.

### Specific label problems

- `PUBLISHED`
  - Misleading when live marketplace item is under review or patch-blocked.
- `Utilidades`
  - Too broad if based on incomplete financial proof.
- `Generando utilidades: Si`
  - Unsafe unless tied to released-funds and realized-profit truth.
- `Autonomous mode`
  - Must distinguish:
    - enabled in config
    - scheduler running
    - agents healthy
    - business pipeline unblocked

### Target state model

Per product/listing, the frontend should show exactly:

1. discovery_state
2. candidate_validation_state
3. image_compliance_state
4. publication_attempt_state
5. external_marketplace_state
6. listing_live_state
7. order_ingestion_state
8. supplier_purchase_state
9. tracking_state
10. delivery_state
11. payout_state
12. realized_profit_state

Each state must carry:

- current value
- last evidence timestamp
- blocker if blocked
- next required action
- source of truth

### Judgment

The current operational state model is incomplete and partially misleading. It is usable for internal technical orientation, but not safe enough for real autonomous dropshipping operations without truth fixes.
