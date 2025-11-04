-- Script para poblar credenciales de API de prueba
-- Ejecutar después de la migración multi-tenant

-- ============================================
-- IMPORTANTE: Cambiar las credenciales reales
-- ============================================
-- Este script usa credenciales de ejemplo (SANDBOX/TEST)
-- Para producción, reemplazar con credenciales reales

-- Obtener el ID del usuario admin (ajustar según tu BD)
-- SELECT id FROM User WHERE role = 'ADMIN' LIMIT 1;

-- Ejemplo: Si el admin tiene userId = 1

-- ============================================
-- 1. eBay API (Sandbox)
-- ============================================
INSERT INTO ApiCredential (userId, apiName, credentials, isActive, createdAt, updatedAt)
VALUES (
  1,
  'ebay',
  'BASE64_ENCRYPTED_CREDENTIALS_HERE', -- Usar la función de encriptación
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(userId, apiName) DO UPDATE SET
  credentials = excluded.credentials,
  isActive = excluded.isActive,
  updatedAt = CURRENT_TIMESTAMP;

-- Ejemplo de credentials JSON (SIN ENCRIPTAR - solo para referencia):
-- {
--   "EBAY_APP_ID": "tu-app-id-sandbox",
--   "EBAY_DEV_ID": "tu-dev-id",
--   "EBAY_CERT_ID": "tu-cert-id",
--   "EBAY_TOKEN": "opcional-token-usuario"
-- }

-- ============================================
-- 2. Amazon SP-API (Sandbox)
-- ============================================
INSERT INTO ApiCredential (userId, apiName, credentials, isActive, createdAt, updatedAt)
VALUES (
  1,
  'amazon',
  'BASE64_ENCRYPTED_CREDENTIALS_HERE',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(userId, apiName) DO UPDATE SET
  credentials = excluded.credentials,
  isActive = excluded.isActive,
  updatedAt = CURRENT_TIMESTAMP;

-- Ejemplo de credentials JSON:
-- {
--   "AMAZON_CLIENT_ID": "tu-client-id",
--   "AMAZON_CLIENT_SECRET": "tu-client-secret",
--   "AMAZON_REFRESH_TOKEN": "tu-refresh-token",
--   "AMAZON_REGION": "us-east-1"
-- }

-- ============================================
-- 3. MercadoLibre API
-- ============================================
INSERT INTO ApiCredential (userId, apiName, credentials, isActive, createdAt, updatedAt)
VALUES (
  1,
  'mercadolibre',
  'BASE64_ENCRYPTED_CREDENTIALS_HERE',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(userId, apiName) DO UPDATE SET
  credentials = excluded.credentials,
  isActive = excluded.isActive,
  updatedAt = CURRENT_TIMESTAMP;

-- Ejemplo de credentials JSON:
-- {
--   "MERCADOLIBRE_CLIENT_ID": "tu-client-id",
--   "MERCADOLIBRE_CLIENT_SECRET": "tu-client-secret",
--   "MERCADOLIBRE_REDIRECT_URI": "http://localhost:5173/auth/mercadolibre/callback"
-- }

-- ============================================
-- 4. GROQ AI API
-- ============================================
INSERT INTO ApiCredential (userId, apiName, credentials, isActive, createdAt, updatedAt)
VALUES (
  1,
  'groq',
  'BASE64_ENCRYPTED_CREDENTIALS_HERE',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(userId, apiName) DO UPDATE SET
  credentials = excluded.credentials,
  isActive = excluded.isActive,
  updatedAt = CURRENT_TIMESTAMP;

-- Ejemplo de credentials JSON:
-- {
--   "GROQ_API_KEY": "gsk_tu-api-key-aqui"
-- }

-- ============================================
-- 5. ScraperAPI
-- ============================================
INSERT INTO ApiCredential (userId, apiName, credentials, isActive, createdAt, updatedAt)
VALUES (
  1,
  'scraperapi',
  'BASE64_ENCRYPTED_CREDENTIALS_HERE',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(userId, apiName) DO UPDATE SET
  credentials = excluded.credentials,
  isActive = excluded.isActive,
  updatedAt = CURRENT_TIMESTAMP;

-- Ejemplo de credentials JSON:
-- {
--   "SCRAPERAPI_KEY": "tu-api-key-aqui"
-- }

-- ============================================
-- 6. ZenRows API
-- ============================================
INSERT INTO ApiCredential (userId, apiName, credentials, isActive, createdAt, updatedAt)
VALUES (
  1,
  'zenrows',
  'BASE64_ENCRYPTED_CREDENTIALS_HERE',
  0, -- Desactivada por defecto (usar solo una: ScraperAPI O ZenRows)
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(userId, apiName) DO UPDATE SET
  credentials = excluded.credentials,
  isActive = excluded.isActive,
  updatedAt = CURRENT_TIMESTAMP;

-- Ejemplo de credentials JSON:
-- {
--   "ZENROWS_API_KEY": "tu-api-key-aqui"
-- }

-- ============================================
-- 7. 2Captcha API
-- ============================================
INSERT INTO ApiCredential (userId, apiName, credentials, isActive, createdAt, updatedAt)
VALUES (
  1,
  '2captcha',
  'BASE64_ENCRYPTED_CREDENTIALS_HERE',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(userId, apiName) DO UPDATE SET
  credentials = excluded.credentials,
  isActive = excluded.isActive,
  updatedAt = CURRENT_TIMESTAMP;

-- Ejemplo de credentials JSON:
-- {
--   "CAPTCHA_API_KEY": "tu-api-key-aqui"
-- }

-- ============================================
-- 8. PayPal Payouts API (Sandbox)
-- ============================================
INSERT INTO ApiCredential (userId, apiName, credentials, isActive, createdAt, updatedAt)
VALUES (
  1,
  'paypal',
  'BASE64_ENCRYPTED_CREDENTIALS_HERE',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(userId, apiName) DO UPDATE SET
  credentials = excluded.credentials,
  isActive = excluded.isActive,
  updatedAt = CURRENT_TIMESTAMP;

-- Ejemplo de credentials JSON:
-- {
--   "PAYPAL_CLIENT_ID": "tu-client-id",
--   "PAYPAL_CLIENT_SECRET": "tu-client-secret",
--   "PAYPAL_MODE": "sandbox"
-- }

-- ============================================
-- 9. AliExpress API
-- ============================================
INSERT INTO ApiCredential (userId, apiName, credentials, isActive, createdAt, updatedAt)
VALUES (
  1,
  'aliexpress',
  'BASE64_ENCRYPTED_CREDENTIALS_HERE',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(userId, apiName) DO UPDATE SET
  credentials = excluded.credentials,
  isActive = excluded.isActive,
  updatedAt = CURRENT_TIMESTAMP;

-- Ejemplo de credentials JSON:
-- {
--   "ALIEXPRESS_APP_KEY": "tu-app-key",
--   "ALIEXPRESS_APP_SECRET": "tu-app-secret"
-- }

-- ============================================
-- VERIFICACIÓN
-- ============================================
-- Ver todas las credenciales del admin
SELECT 
  id,
  userId,
  apiName,
  isActive,
  createdAt,
  updatedAt
FROM ApiCredential
WHERE userId = 1
ORDER BY apiName;

-- Contar cuántas APIs tiene configuradas cada usuario
SELECT 
  userId,
  COUNT(*) as total_apis,
  SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as active_apis
FROM ApiCredential
GROUP BY userId;

-- ============================================
-- NOTAS DE USO
-- ============================================
-- 1. Este script usa IDs hardcodeados (userId=1)
--    Ajustar según tu base de datos
--
-- 2. Las credenciales deben estar ENCRIPTADAS
--    Usar el endpoint POST /api/api-credentials desde el frontend
--    O usar la función encryptCredentials() del backend
--
-- 3. Para agregar credenciales mediante la API:
--    POST /api/api-credentials
--    {
--      "apiName": "ebay",
--      "credentials": { "EBAY_APP_ID": "...", ... },
--      "isActive": true
--    }
--
-- 4. Para probar una API:
--    POST /api/api-credentials/ebay/test
--
-- 5. Para ver el estado de todas las APIs:
--    GET /api/api-credentials/status
