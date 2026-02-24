# Variables para Railway (desde APIS2.txt)

A?ade estas variables en Railway ? ivan-reseller-backend ? Variables para que el test-post-sale-flow funcione en producciùn.

## PayPal Live (obligatorio para test en AUTOPILOT_MODE=production)

```
PAYPAL_CLIENT_ID=AYH1OkxAJq60rZTPyiblNtFil5yxnKUwlXzwUU3UECyvtPXgSBXbvtu5-Pc3n3ZqBNF5gRGWi-x12xso
PAYPAL_CLIENT_SECRET=EKjZYTFfUq__cWgKOPwr7bxNDgnjy7H07XiF8WyKngMUgF6Tp8ZKsSA73bAXVqPPzRBO2q4zTGudP2Xj
PAYPAL_ENVIRONMENT=production
```

(O en Railway dashboard: PAYPAL_ENVIRONMENT = `production` o `live` segùn lo que lea tu cùdigo.)

Tras anadirlas, redeploy. Para probar (PowerShell en backend): $env:API_URL="https://ivan-reseller-backend-production.up.railway.app"; $env:INTERNAL_RUN_SECRET="<valor de rail.txt>"; npm run test:post-sale-flow
