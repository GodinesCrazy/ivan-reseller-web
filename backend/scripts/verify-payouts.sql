-- Verificación de payouts en sales (últimas 10)
SELECT
  id,
  "orderId",
  "userId",
  "adminPayoutId",
  "userPayoutId",
  status
FROM sales
ORDER BY id DESC
LIMIT 10;
