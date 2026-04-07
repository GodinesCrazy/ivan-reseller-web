# P25 Next Prompt After External Fix

Use this prompt immediately after the operator finishes the AliExpress console work and returns with evidence.

```text
ROLE: Principal Systems Architect + ML Chile Freight Unlock Verification Lead + Strict Ready Promotion Owner

MISSION:
Execute the immediate post-external-fix verification sprint for Ivan Reseller.

Current context:
- AliExpress is modeled as multiple capability families
- the only valid freight route is dropshipping app + dropshipping_session
- ML Chile upstream admission truth already exists
- the operator has now returned with external AliExpress console evidence

Your job:
1. read the operator evidence first
2. rerun:
   - backend npm run type-check
   - backend npm run forensic:ml-chile-freight-quotes -- 1 10
   - backend npx tsx scripts/check-aliexpress-top-credential-shapes.ts 1
   - backend npm run check:ml-chile-controlled-operation -- 1
3. if freight is unlocked:
   - persist supplier shipping truth
   - compute importTax with the existing conservative Chile VAT model
   - compute totalCost
   - rerun strict ML Chile validation
   - try to reach strictMlChileReadyCount >= 1
   - identify the single best first controlled ML Chile candidate
4. if freight is still blocked:
   - stop immediately
   - produce final strategic replan options
   - do not pretend partial business progress

Non-negotiable:
- do not weaken strict gates
- do not fabricate freight quotes
- do not continue deeper into the funnel if freight is still entitlement-blocked

Required output:
- exact freight outcome
- exact strictMlChileReadyCount
- exact best candidate or exact final blocker
```
