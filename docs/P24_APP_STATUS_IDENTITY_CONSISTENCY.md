# P24 App Status Identity Consistency

## Objective
Reduce ambiguity between what the operator believes and what the code/runtime is actually using.

## Live Identity Snapshot
### Affiliate app family
- App key prefix: `524880...`
- Session tokens: absent
- Observed role: discovery capability only

### Dropshipping app family
- App key prefix: `522578...`
- Session tokens: present
- Observed role: dropshipping product and order-family capability, and the only serious freight candidate path

## Consistency Truth
- App family separation is real in runtime data
- Freight is currently attempted only through the dropshipping family
- Cross-family freight pairing remains invalid by evidence

## Still Not Proven In Code
- AliExpress console app status wording such as `Online`, `Test`, or equivalent
- callback binding details at the AliExpress developer-console layer

## Practical Conclusion
App identity ambiguity inside the repo is materially reduced, but console-side app status still needs manual verification outside the codebase.
