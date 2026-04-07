# P22 External Platform Action Plan

## Objective
Provide the minimum manual operator checklist required outside the codebase to recover AliExpress freight compatibility.

## Action 1 — Verify Current Dropshipping App Entitlement
- Why it matters: the native dropshipping app/session pair reaches the freight endpoint but is rejected with `Invalid app Key`
- Evidence: live freight forensic rerun on `dropshipping_native`
- Success looks like: operator confirms the current app is entitled for `aliexpress.logistics.buyer.freight.calculate`
- Failure implies: the current app family cannot unlock freight and a different app path is required

## Action 2 — Verify Method Permission in AliExpress/Open Platform Console
- Why it matters: method-level permission may be separate from generic dropshipping access
- Evidence: endpoint reached, but method rejects the app key specifically
- Success looks like: the freight method appears as allowed/approved for the active app
- Failure implies: external approval or a different app type is required

## Action 3 — Verify App Key / App Secret Match the Intended Product Family
- Why it matters: the platform is explicitly complaining about app-key validity at method level
- Evidence: `isv.appkey-not-exists`
- Success looks like: operator confirms the stored dropshipping app key belongs to the intended freight-capable app
- Failure implies: stored credentials are linked to the wrong AliExpress app

## Action 4 — Reauthorize on the Correct App Family If Needed
- Why it matters: if freight requires a different app family, the current tokens are attached to the wrong app
- Evidence: affiliate app lacks session tokens; dropshipping app has session tokens but fails entitlement
- Success looks like: a session-bearing credential exists for the freight-capable app family
- Failure implies: the current credential architecture cannot support freight as designed

## Action 5 — Confirm Whether Buyer Freight Requires a Separately Provisioned App
- Why it matters: the observed behavior is consistent with method-level entitlement separation
- Evidence: native dropshipping path fails even though session tokens are present
- Success looks like: operator confirms a dedicated or specifically approved freight-capable app is not needed, or provisions one if it is
- Failure implies: ML Chile must remain paused until external provisioning is completed

## Manual Success Condition
After external action, rerun:
- `npm run forensic:ml-chile-freight-quotes -- 1 8`

External recovery is only successful if at least one admitted Chile candidate receives a real freight quote.
