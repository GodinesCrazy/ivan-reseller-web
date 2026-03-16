# Ivan Reseller Web — Deployment Validation and Winner Product Detection Engine

You are continuing development of the production SaaS system Ivan Reseller Web.

The system architecture currently consists of:

Backend: Node.js / TypeScript running on Railway
Database: PostgreSQL (Railway)
Queue system: Redis + BullMQ (Railway)
Frontend: React + Vite SPA deployed on Vercel

Phase 1 and Phase 2 systems have already been implemented.

You must now:

1. Validate the frontend deployment on Vercel
2. Ensure the frontend communicates correctly with the Railway backend
3. Confirm that Phase 2 systems are operational
4. Implement the next strategic module: Winner Product Detection Engine

You must perform these tasks autonomously whenever possible.

Do not request manual steps from the user unless absolutely unavoidable.

---

# CRITICAL RULES

Do not remove any existing functionality.

Do not break Phase 1 or Phase 2 systems.

Only extend the system safely.

All current features must remain operational.

---

# PHASE 1 + PHASE 2 SYSTEM VERIFICATION

Confirm the following components are operational:

Inventory Sync Service
Listing Metrics system
Analytics API
Listing Optimization Worker
Marketplace Rate Limiting
Product Research UI
Image Processing Pipeline
Multi-supplier architecture
CTR / click metrics
Analytics dashboard

Verify that BullMQ workers initialize correctly when Redis is available.

Verify Prisma migrations run via:

prisma migrate deploy

Never use prisma migrate dev in production.

---

# VERCEL DEPLOYMENT VALIDATION

Check the Vercel configuration.

The frontend is located in:

frontend/

Confirm the following settings:

Root directory: frontend
Build command: npm run build
Output directory: dist

Verify that the SPA routing works correctly.

If necessary, ensure vercel.json exists and supports SPA routing.

Example behavior:

All non-asset routes should serve index.html.

---

# API PROXY VALIDATION

The frontend calls the backend using:

/api

Verify that requests are correctly forwarded to the Railway backend.

If necessary, configure Vercel rewrites so that:

/api/*

is proxied to the Railway backend URL.

Ensure this configuration exists automatically in vercel.json.

Example concept:

/api/:path* → https://railway-backend-url/:path*

Confirm that environment variables such as:

VITE_API_URL

are correctly handled.

The frontend should use same-origin /api in production.

---

# FRONTEND BUILD VALIDATION

Verify that the Vite build produces a valid production bundle.

Ensure the following:

npm run build generates dist/
dist/index.html loads the compiled assets
asset paths resolve correctly

If any configuration issues are detected, repair them automatically.

---

# PHASE 3 IMPLEMENTATION

Implement a Winner Product Detection Engine.

This system automatically detects products that perform well and should be scaled.

---

# WINNER DETECTION LOGIC

Create a service:

winner-detection.service.ts

This service should analyze data from:

listing_metrics
sales data
impressions
clicks
conversion rates

Define criteria such as:

minimum impressions
minimum conversion rate
minimum sales velocity

Example logic:

if impressions > threshold
and conversionRate > threshold
and sales increasing
then mark product as winner

Store results in a new table if necessary:

winning_products

Include fields such as:

productId
marketplace
score
detectedAt
reason

---

# WINNER DETECTION WORKER

Create a BullMQ worker:

winner-detection

Schedule it daily.

The worker should:

scan listing_metrics
evaluate product performance
store detected winners
trigger scaling actions

---

# AUTOMATIC SCALING ACTIONS

When a winner is detected, the system may:

increase listing visibility
republish product to other marketplaces
trigger dynamic pricing adjustments
add product to "high priority monitoring"

Ensure scaling integrates with existing marketplace services.

---

# ANALYTICS INTEGRATION

Extend the analytics dashboard.

Add a section:

Winning Products

Display:

product
marketplace
sales velocity
conversion rate
winner score

---

# FINAL OBJECTIVE

Ivan Reseller Web must evolve into a data-driven dropshipping automation SaaS.

The platform should automatically:

collect marketplace performance data
detect successful products
optimize listings
scale winning products

All improvements must integrate with existing architecture without removing current systems.