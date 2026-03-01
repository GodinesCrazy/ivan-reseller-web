# Finance Intelligence Architecture

## Overview

The Finance Intelligence System is a quantitative framework for capital management, risk assessment, and automatic publication optimization in dropshipping. It extends the existing Finance module without removing prior logic.

---

## 1. Sales Ledger (Forensic Complete)

### Endpoint
`GET /api/finance/sales-ledger?range=week|month|quarter|year`

### Fields Per Sale
| Field | Description |
|-------|-------------|
| orderId | Order identifier |
| productId | Product ID |
| productTitle | Product name |
| marketplace | ebay, amazon, mercadolibre, etc. |
| salePrice | Sale price |
| supplierCost | AliExpress/supplier cost |
| supplierShipping | Product shipping cost |
| marketplaceFee | Marketplace fee |
| paymentFee | Payment processing fee |
| tax | Import/tax amount |
| platformCommission | Platform commission |
| totalCost | Sum of all costs |
| grossProfit | salePrice - totalCost |
| netProfit | After platform commission |
| marginPercent | grossProfit / salePrice |
| roiPercent | grossProfit / supplierCost |
| payoutExecuted | Whether payout ran |
| payoutDate | Date of payout |
| marketplaceUrl | Listing URL |
| supplierUrl | AliExpress URL |
| dataIntegrityIssue | Array of missing data flags |

### Mandatory Formulas
```
totalCost = supplierCost + supplierShipping + marketplaceFee + paymentFee + tax + platformCommission
grossProfit = salePrice - totalCost
marginPercent = grossProfit / salePrice
roiPercent = grossProfit / supplierCost  (avoid division by 0)
```

### Data Integrity Rule
If any financial field is missing or unknown:
- Add to `dataIntegrityIssue[]`
- Do **not** silently use 0

---

## 2. Working Capital Intelligence

### Endpoint
`GET /api/finance/working-capital-detail`

### Response
```json
{
  "detail": {
    "totalCapital": number,
    "availableCash": number,
    "retainedByMarketplace": number,
    "inPayoneer": number,
    "inPayPal": number,
    "inTransit": number,
    "committedToOrders": number,
    "exposureFromActiveListings": number,
    "inventoryCapitalLeverageRatio": number,
    "optimalLeverageRatio": number,
    "riskLevel": "LOW" | "MEDIUM" | "HIGH"
  }
}
```

---

## 3. Leverage Model (finance-leverage.model.ts)

### Definitions
- **supplierExposure** = SUM(supplierCost of active listings)
- **ICLR** (Inventory Capital Leverage Ratio) = supplierExposure / totalCapital

### Optimal Leverage Ratio (OLR)
```
OLR = (1 / P_simultaneous_sale) * safetyFactor
```

Where:
- `P_simultaneous_sale = estimatedProbabilityOfSalePerDay * avgActiveListings`
- `estimatedProbabilityOfSalePerDay = historicalSales / historicalActiveListings / avgDays`
- `safetyFactor = 0.7` (configurable)

OLR is clamped between **1.5** and **4.0**.

### RiskLevel
- **LOW**:   ICLR < OLR * 0.75
- **MEDIUM**: 0.75 ? ICLR/OLR < 1.0
- **HIGH**:  ICLR ? OLR

---

## 4. Capital Allocation Engine (capital-allocation.engine.ts)

### Main Function: `calculateMaxNewListingsAllowed(userId, totalCapital, estimatedSupplierCost?)`

### Rules
```
maxExposureAllowed = totalCapital * OLR
currentExposure = supplierExposure
remainingExposure = maxExposureAllowed - currentExposure
```

- **remainingExposure ? 0** ? Block new publications
- **remainingExposure > 0** ? Allow publishing up to remainingExposure

Per product:
```
allowedUnits = floor(remainingExposure / estimatedSupplierCost)
```

### Autopilot Integration
Before publishing, the autopilot consults `canPublishProduct()`:
- If over limit ? stop publication, log warning
- If within limit ? proceed

---

## 5. Product Performance Engine (product-performance.engine.ts)

### Metrics Per Product
- totalSales, avgMargin, avgROI
- salesVelocity (sales per day)
- returnRate (returns / total sales)
- capitalEfficiency (revenue / supplierCost)

### WinningScore
```
WinningScore = (avgROI * 0.4) + (salesVelocity * 0.3) + (marginPercent * 0.2) - (returnRate * 0.1)
```
Normalized to 0?100.

### Repetition Rule
If:
- WinningScore > 75
- capital-allocation allows
- No market saturation

Then:
- Increment units published
- Duplicate listing if marketplace allows
- Prioritize in autopilot

---

## 6. Finance Risk Engine (finance-risk.engine.ts)

### Worst Case Scenario
All sales occur simultaneously:
```
worstCaseCost = SUM(supplierCost of active listings)
capitalBuffer = totalCapital - worstCaseCost
bufferPercent = capitalBuffer / totalCapital
```

### Cash Conversion Cycle (CCC)
```
CCC = DaysInventory + DaysReceivable - DaysPayable
```

### Capital Turnover
```
capitalTurnover = totalRevenue / totalCapital
```

---

## 7. Security Limits

- OLR clamped 1.5?4.0
- safetyFactor configurable (default 0.7)
- Publishing blocked when ICLR ? OLR
- No silent 0 for missing financial data

---

## 8. File Layout

| File | Purpose |
|------|---------|
| `backend/src/services/sales-ledger.service.ts` | Sales ledger computation |
| `backend/src/services/working-capital-detail.service.ts` | Working capital detail |
| `backend/src/services/finance-leverage.model.ts` | OLR/ICLR model |
| `backend/src/services/capital-allocation.engine.ts` | Capital allocation & Autopilot gate |
| `backend/src/services/product-performance.engine.ts` | WinningScore & top products |
| `backend/src/services/finance-risk.engine.ts` | Risk metrics |
| `backend/src/api/routes/finance.routes.ts` | API routes |
| `frontend/src/pages/FinanceDashboard.tsx` | Tabs & UI |

---

## 9. Success Criteria

- [x] Complete breakdown per sale
- [x] Visibility of capital allocation
- [x] Real and optimal leverage calculated
- [x] Publications blocked when risk exceeded
- [x] Winners identified automatically
- [x] Repetition of winners under control
- [x] Capital usage optimized
- [x] Scalability without additional capital
