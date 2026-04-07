# P25 External Freight Operator Playbook

## Authoritative Blocker Summary
### What is already proven working
- Affiliate discovery works.
- Dropshipping product capability works.
- Dropshipping order capability is modeled separately and remains usable enough for this phase.
- ML Chile upstream admission truth works:
  - Chile destination acknowledgement exists
  - CL-buyable SKU truth exists
  - admitted candidate rows already exist

### What is already proven not to be the blocker
- not category selection
- not seller selection
- not Chile support detection
- not CL-SKU buyability detection
- not freight parsing or selector logic
- not router/signature transport to the freight endpoint

### What the blocker now is
The only valid freight route is:
- `dropshipping app + dropshipping_session`

That route reaches `aliexpress.logistics.buyer.freight.calculate` live, but fails with:
- `code = 29`
- `sub_code = isv.appkey-not-exists`
- `msg = Invalid app Key`

### Why ML Chile is paused
Strict ML Chile readiness requires real supplier freight truth.
Until the freight-capable AliExpress app/session path is externally repaired, the system cannot truthfully populate:
- `shippingCost`
- `importTax`
- `totalCost`
- `strictMlChileReadyCount >= 1`

### Why more internal funnel work would be wasteful
The software is already clean enough to continue once freight is unlocked.
More internal iterations before the platform fix would only repeat already disproven work.

## AliExpress Developers Console Checklist
### Step 1
- What to open: AliExpress Developers / Open Platform app list
- What to verify: the exact dropshipping app intended for Ivan Reseller
- Evidence to capture: app name, app type/family, app status, app key
- Good: one clearly identified dropshipping app matches the backend intent
- Bad: multiple candidate apps, ambiguous family, or the intended app cannot be identified

### Step 2
- What to open: the identified dropshipping app details
- What to verify: AppKey and AppSecret correspond to the backend-stored dropshipping credentials
- Evidence to capture: visible AppKey in console and secure confirmation that AppSecret belongs to the same app
- Good: backend AppKey prefix `522578...` matches the intended console app
- Bad: backend key does not match the intended app, or the app key belongs to another product family

### Step 3
- What to open: app status / lifecycle page
- What to verify: whether the app is Online, Test, Draft, pending review, or otherwise limited
- Evidence to capture: screenshot or text of current status
- Good: app is in the state required for live freight API usage
- Bad: app is still test-only, pending, disabled, or inconsistent with live production use

### Step 4
- What to open: API or permissions section for the dropshipping app
- What to verify: whether `aliexpress.logistics.buyer.freight.calculate` appears as approved, enabled, or entitled
- Evidence to capture: screenshot or text of the method list and approval state
- Good: the freight method is visible and allowed for this app
- Bad: the method is absent, denied, pending, or belongs to another app family

### Step 5
- What to open: app category/product-family section
- What to verify: that the app is actually the dropshipping/Open Platform app expected to carry the live session
- Evidence to capture: app category/family labels
- Good: app family is consistent with the backend dropshipping credential path
- Bad: app family is affiliate-only, another product line, or otherwise mismatched

### Step 6
- What to open: OAuth/auth binding section for the same dropshipping app
- What to verify: the current session-bearing auth flow is tied to this exact app family
- Evidence to capture: callback/auth configuration and confirmation of successful reauth if performed
- Good: the reauthorized session belongs to the same dropshipping app used for freight
- Bad: session belongs to another app family or cannot be reauthorized cleanly

### Step 7
- What to open: developer support docs or console notes for the freight method
- What to verify: whether buyer freight requires separate provisioning, approval, or another app type
- Evidence to capture: screenshot, text, or support reply
- Good: either current app is entitled or the required separate provisioning path is explicit
- Bad: entitlement is unavailable for this app family and no recovery path is identified

### Step 8
- What to open: secrets/credentials section after any fix
- What to verify: whether secret rotation or stale binding requires backend credential refresh
- Evidence to capture: note whether AppKey/AppSecret changed and whether reauth produced new session tokens
- Good: backend can now be updated to the correct live app/session pair
- Bad: credentials remain inconsistent or stale after attempted fix
