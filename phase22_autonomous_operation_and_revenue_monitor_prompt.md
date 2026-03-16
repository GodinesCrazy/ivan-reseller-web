# PROMPT FINAL — Autonomous Operation + Revenue Monitor

```markdown
# Ivan Reseller Web — Autonomous Operation, Backend Discovery and Revenue Optimization

You are performing a platform-level operational verification and revenue optimization for the SaaS platform Ivan Reseller Web.

The platform is deployed using:
- GitHub
- Railway (backend)
- Vercel (frontend)

The system is designed to run in autonomous dropshipping mode when:
- AUTONOMOUS_OPERATION_MODE = true

Your mission is to confirm the system is fully operational and ensure it actively generates revenue.

---

# CRITICAL RULES

- Do not remove existing functionality.
- Do not introduce breaking changes.
- Focus on validation, monitoring and optimization.
- All existing engines must remain intact.

---

# OBJECTIVE

Confirm that Ivan Reseller Web:
- is deployed correctly
- runs autonomous automation
- publishes listings automatically
- collects marketplace metrics
- detects orders
- generates revenue

Then implement a continuous **Autonomous Revenue Monitor** to maximize profitability.

---

# TASK 1 — DISCOVER BACKEND DOMAIN

Automatically discover the backend URL from repository configuration.

Search:
- environment variables
- Railway configuration
- deployment docs
- frontend API configuration

Look for variables such as:
- BACKEND_URL
- API_BASE_URL
- VITE_API_URL
- RAILWAY_PUBLIC_DOMAIN

Determine the Railway public backend domain.

Expected format: https://<project>.up.railway.app

---

# TASK 2 — VERIFY READINESS ENDPOINT

Construct endpoint: https://<backend-domain>/api/system/readiness-report

Send request and verify response.

Expected indicators:
- database OK
- Redis OK
- BullMQ OK
- canEnableAutonomous true

---

# TASK 3 — VERIFY AUTONOMOUS MODE

Confirm whether autonomous operation is active.

Indicators:
- AUTONOMOUS_OPERATION_MODE = true
- automationModeStatus = enabled
- workers processing jobs
- queues active

---

# TASK 4 — VERIFY AUTOMATION PIPELINE

Confirm the system pipeline is functioning:
- Trend Radar
- Market Intelligence
- Competitor Intelligence
- Auto Listing Strategy
- Publishing
- Listing Metrics
- Dynamic Optimization
- Winner Detection
- Strategy Brain
- Autonomous Scaling

Verify scheduled jobs are executing.

---

# TASK 5 — VERIFY LISTING ACTIVITY

Query the system for:
- active listings
- recently published listings
- listings with impressions
- listings with clicks
- listings with conversions

---

# TASK 6 — VERIFY REVENUE GENERATION

Check if the system is generating revenue.

Inspect:
- orders table
- sales records
- conversion metrics

Calculate:
- total orders
- total revenue
- estimated profit

---

# TASK 7 — VERIFY MARKETPLACE INTEGRATIONS

Validate integrations with:
- MercadoLibre Chile
- eBay US

Check:
- listing creation
- listing validation
- inventory sync
- order detection
- metrics ingestion

---

# TASK 8 — VERIFY FRONTEND DEPLOYMENT

Confirm:
- frontend deployed on Vercel
- frontend connected to backend
- dashboard metrics match backend data

---

# TASK 9 — IMPLEMENT AUTONOMOUS REVENUE MONITOR

Create a new system module: **AutonomousRevenueMonitor**

Purpose: continuously monitor system profitability and optimize operations.

---

## REVENUE MONITOR FUNCTIONS

The monitor should analyze:
- revenue per product
- conversion rates
- price competitiveness
- market saturation
- listing performance

---

## AUTOMATIC OPTIMIZATION ACTIONS

If revenue is low or stagnant:
- adjust listing prices
- change product selection strategy
- increase or decrease listing publishing frequency

Examples:
- reduce price if conversion low
- stop publishing saturated products
- increase publishing when profitable products detected

---

## PROFIT OPTIMIZATION

Use:
- competitor intelligence
- fee intelligence
- conversion optimization

to maximize:
- profit per listing
- total system revenue.

---

# TASK 10 — CONTINUOUS MONITORING

Run the revenue monitor periodically.

Suggested schedule: every 6 hours

Analyze:
- recent sales
- conversion performance
- profit margins

---

# TASK 11 — SYSTEM REPORT

Return final report containing:
- backend URL
- readiness status
- autonomous mode status
- worker health
- listing activity
- orders detected
- revenue generated
- revenue optimization actions

---

# FINAL OBJECTIVE

Ivan Reseller Web must operate as a fully autonomous marketplace automation system capable of:
- detecting trends
- analyzing competitors
- publishing listings automatically
- collecting marketplace metrics
- detecting sales
- optimizing prices
- scaling profitable products
- maximizing total revenue
```

---

# Qué logrará este prompt

Cuando lo ejecutes en Cursor, Cursor hará automáticamente:
- descubrimiento del backend
- prueba de readiness
- verificación del modo autónomo
- verificación del pipeline completo
- comprobación de listings
- comprobación de ventas
- comprobación de ingresos
y además implementará el **Autonomous Revenue Monitor**, que permitirá al sistema **optimizar continuamente las ganancias**.

---

# Resultado esperado

El sistema quedará funcionando así:

```
Trend Radar
    ↓
Market Intelligence
    ↓
Competitor Intelligence
    ↓
Auto Listing Strategy
    ↓
Publishing
    ↓
Metrics
    ↓
Optimization
    ↓
Winner Detection
    ↓
Scaling
    ↓
Revenue Monitor
```

Esto convierte a Ivan Reseller Web en **un sistema autónomo completo de generación de ingresos**.
