# P25 Success Failure Decision Table

## Case A
- Condition: freight method is visible + entitled + app key matches + reauth succeeds
- Next action: rerun the post-fix verification runbook immediately
- Expected implication: freight may now unlock and ML Chile can re-enter strict landed-cost completion

## Case B
- Condition: app is valid but freight method is not entitled
- Next action: request/complete the required AliExpress platform approval or provisioning path
- Expected implication: no internal code change should continue before entitlement is granted

## Case C
- Condition: backend app key does not match the intended dropshipping app
- Next action: correct backend credentials to the intended dropshipping app and reauthorize that app family
- Expected implication: previous runtime freight failures were caused by wrong app identity, not by funnel logic

## Case D
- Condition: app is still in test, wrong state, wrong family, or otherwise not valid for live freight
- Next action: promote/fix the app state or move to the correct live app family
- Expected implication: current production freight call remains invalid until app state/family is corrected

## Case E
- Condition: AliExpress confirms freight is not available to this app family
- Next action: identify the required freight-capable app/product line and provision it explicitly
- Expected implication: ML Chile remains paused on external freight dependency until that app exists and is authorized
