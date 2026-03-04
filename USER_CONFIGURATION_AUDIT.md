# User Configuration Audit ? Ivan Reseller

**Purpose:** Determine whether the user can configure each of the following from the web UI. If not, the item is marked as **MISSING USER CONTROLS** and where it could be added is noted.

---

## Checklist

| Configuration | Status | Where it exists / Where to add |
|---------------|--------|---------------------------------|
| max active listings | **MISSING USER CONTROLS** | Backend `AutopilotConfig.maxActiveProducts` exists in type but is not in `updateConfigSchema` or any UI. Add to Settings/Autopilot or Autopilot page and to `PUT /api/autopilot/config`. |
| profit margin | **MISSING USER CONTROLS** | Backend has `minProfitUsd` and `minRoiPct` in autopilot config and in `updateConfigSchema`; WorkflowConfig has `minProfitUsd`/`minRoiPct` in DB. No dedicated UI control for ?profit margin? or min profit/ROI on Autopilot or Settings. Add to Autopilot Settings (or WorkflowConfig). |
| min supplier price | **MISSING USER CONTROLS** | Not in backend autopilot config or workflow config. Add to Autopilot/Settings and backend config (e.g. SystemConfig or UserWorkflowConfig). |
| max supplier price | **MISSING USER CONTROLS** | Not in backend autopilot config or workflow config. Add to Autopilot/Settings and backend config. |
| product categories | **MISSING USER CONTROLS** | Backend has `searchQueries` (keywords) in autopilot config, not ?categories? as a filter. No UI to set search queries or category filters on Autopilot page. Add search queries / categories to Autopilot Settings. |
| max duplicates per product | **MISSING USER CONTROLS** | Not in backend or frontend. Add to Autopilot Settings and backend (e.g. autopilot_config or UserWorkflowConfig). |
| auto repeat winners | **MISSING USER CONTROLS** | `product-performance.engine` has `shouldRepeatWinner` logic but no user toggle. Add to Autopilot Settings (e.g. ?Auto duplicate winning products?) and backend. |
| delete listings after X days | **MISSING USER CONTROLS** | `listing-lifetime.service` has `maxLifetimeDaysDefault` in system config, not per-user and not in UI. Add to Settings/Autopilot or Listing Lifetime page and optionally per-user config. |
| repricing interval | **MISSING USER CONTROLS** | Backend uses `DYNAMIC_PRICING_INTERVAL_HOURS` (env). No UI to set interval. Add to Settings/Pricing or Autopilot Settings and backend (e.g. SystemConfig or user setting). |
| target marketplace | **EXISTS** | Autopilot page: checkboxes for eBay, MercadoLibre, Amazon; saved via `PUT /api/autopilot/config` with `targetMarketplaces`. |
| target country | **MISSING USER CONTROLS** | Opportunities have `targetCountry` for tax/shipping; no user-level ?default target country? in Settings or Autopilot. Add to Regional/Settings or Autopilot Settings. |
| shipping policy | **MISSING USER CONTROLS** | Not in UserSettings, WorkflowConfig, or Autopilot config. Add to Settings/Marketplace or product publish flow if needed. |

---

## Details

### Exists (target marketplace)

- **Page:** `frontend/src/pages/Autopilot.tsx`
- **API:** `GET /api/autopilot/config` (returns `config.targetMarketplaces`), `PUT /api/autopilot/config` (body: `targetMarketplaces: string[]`)
- User can select one or more of eBay, MercadoLibre, Amazon; at least one required.

### Partially in backend, no UI

- **cycleIntervalMinutes, maxOpportunitiesPerCycle, searchQueries, workingCapital, minProfitUsd, minRoiPct** are in `updateConfigSchema` in `autopilot.routes.ts` and in `AutopilotConfig` in `autopilot.service.ts`. They are persisted in SystemConfig `autopilot_config`. None of these are exposed as form fields on the Autopilot page or a dedicated Autopilot Settings page.
- **workingCapital** is editable on the WorkflowConfig page and persisted via `PUT /api/workflow/config` and `PUT /api/workflow/working-capital`.

### Where to add missing controls

1. **New section ?Autopilot Settings?** (either on the existing Autopilot page or under Settings): max active listings, profit margin (or min profit/ROI), min/max supplier price, product categories (or search queries), max duplicates per product, auto repeat winners, delete listings after X days, repricing interval, target country.
2. **Backend:** Extend `PUT /api/autopilot/config` (and `GET /api/autopilot/config`) to accept and return these fields; store in SystemConfig `autopilot_config` (global) or in a per-user table (e.g. extend UserWorkflowConfig or add AutopilotUserSettings).
3. **Settings/Pricing:** Page or tab for repricing interval and any pricing rules (if added later).
4. **Settings/Marketplace or Regional:** Target country, shipping policy (if product/marketplace level).

---

## Conclusion

Only **target marketplace** is fully configurable from the web. All other listed items are either missing entirely or only in backend/env with no user-facing controls. Adding an **Autopilot Settings** (and optionally Pricing/Marketplace) section and extending the autopilot config API will close most gaps.
