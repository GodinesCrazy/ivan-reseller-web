# Ivan Reseller Web — Market Intelligence Engine and Full Deployment Automation

You are continuing development of the production SaaS system Ivan Reseller Web.

The platform currently runs with the following architecture:

- Backend: Node.js / TypeScript on Railway  
- Database: PostgreSQL on Railway  
- Queues: Redis + BullMQ on Railway  
- Frontend: React + Vite SPA deployed on Vercel  

Phase 1, Phase 2, and Phase 3 systems are implemented.

The system already includes:

- Inventory Sync  
- Listing Metrics  
- Analytics Dashboard  
- Product Research UI  
- Image Processing Pipeline  
- Multi-Supplier Architecture  
- Winner Product Detection Engine  

Your task now is to:

1. Remove remaining manual deployment steps
2. Ensure full frontend/backend auto-configuration
3. Implement the Market Intelligence Engine
4. Enable automatic discovery of high-potential products

Perform these tasks autonomously whenever possible.

Do not require manual configuration unless unavoidable.

---

# CRITICAL RULES

- Do not remove existing systems.
- Do not break Phase 1–3 functionality.
- Only extend and stabilize the architecture.

---

# TASK 1 — AUTOMATIC BACKEND DETECTION

Remove dependency on manual VITE_API_URL configuration.

Update frontend runtime configuration so the API base is determined automatically.

**Logic:**

- If `VITE_API_URL` exists → use it.  
- Else if `window.location.hostname` contains `vercel.app` → call backend via `/api` proxy.  
- Else fallback to localhost development URL.

Ensure the frontend can communicate with Railway backend without manual setup.

---

# TASK 2 — AUTOMATIC CORS CONFIGURATION

Ensure backend CORS configuration automatically accepts the frontend domain.

Detect allowed origins dynamically:

- Vercel deployments
- localhost development
- Railway internal calls

Modify backend CORS middleware so the frontend works without manually editing environment variables.

---

# TASK 3 — VERIFY PRODUCTION CONNECTIVITY

Run a connectivity validation between frontend and backend.

Check:

- frontend → /api routes  
- API authentication  
- analytics endpoints  
- product research endpoints  

Ensure all endpoints respond correctly.

---

# TASK 4 — MARKET INTELLIGENCE ENGINE

Create a new subsystem:

**Market Intelligence Engine**

**Purpose:**

Automatically discover high-potential products based on market signals.

---

## DATA SOURCES

Collect signals from:

- AliExpress product data  
- Marketplace listing metrics  
- Competitor analysis results  
- Google Trends data  

Combine these signals to evaluate product opportunities.

---

## MARKET SIGNALS

Evaluate signals such as:

- search demand  
- trend momentum  
- market saturation  
- price competitiveness  
- supplier reliability  
- estimated margin  

---

## OPPORTUNITY SCORING

Create a scoring algorithm:

`opportunityScore` = weighted combination of:

- trendScore  
- demandScore  
- competitionScore  
- marginScore  
- supplierScore  

Normalize scores to a 0–100 scale.

Store results in a new table:

**market_opportunities**

**Fields:**

- productId  
- source  
- score  
- trendScore  
- demandScore  
- competitionScore  
- marginScore  
- supplierScore  
- detectedAt  

---

## OPPORTUNITY DISCOVERY WORKER

Create a BullMQ worker:

**market-intelligence**

Schedule it to run daily.

The worker should:

- collect signals  
- calculate opportunity scores  
- store results in market_opportunities  
- update existing opportunities if scores change  

---

## INTEGRATION WITH EXISTING SYSTEMS

Integrate the Market Intelligence Engine with:

- Product Research UI  
- Opportunity Finder  
- Winner Detection Engine  

Ensure opportunities can be:

- viewed in the UI  
- added to opportunities list  
- tracked for performance  

---

## FRONTEND EXTENSION

Extend the Product Research UI.

Add a section:

**Market Opportunities**

Display:

- product  
- score  
- trend indicator  
- competition indicator  
- margin estimate  

Allow the user to:

- save opportunities  
- launch listing creation  
- monitor product performance  

---

# FINAL OBJECTIVE

Ivan Reseller Web must evolve into a fully automated dropshipping intelligence platform.

The system should automatically:

- analyze market signals  
- detect promising products  
- publish listings  
- measure performance  
- identify winners  
- scale successful products  

All improvements must integrate safely with the existing architecture.
