# Security Notes - Ivan Reseller Web

## 🔐 Webhooks - Validación de Firmas

### eBay
- **Header:** `X-EBAY-SIGNATURE`
- **Formato:** `sha256={hash}`
- **Algoritmo:** HMAC-SHA256
- **Payload:** Body raw (string o JSON stringified)
- **Secret:** `WEBHOOK_SECRET_EBAY`

### MercadoLibre
- **Header:** `x-signature`
- **Formato:** `sha256={hash},{user_id}` (opcional user_id)
- **Algoritmo:** HMAC-SHA256
- **Payload:** Body raw
- **Secret:** `WEBHOOK_SECRET_MERCADOLIBRE`

### Amazon
- **Header:** `x-amzn-signature`
- **Formato:** Base64 o hex
- **Algoritmo:** HMAC-SHA256
- **Payload:** Body raw
- **Secret:** `WEBHOOK_SECRET_AMAZON`

### Feature Flags
```env
WEBHOOK_VERIFY_SIGNATURE=true              # Global
WEBHOOK_VERIFY_SIGNATURE_EBAY=true         # Por marketplace
WEBHOOK_VERIFY_SIGNATURE_MERCADOLIBRE=true
WEBHOOK_VERIFY_SIGNATURE_AMAZON=true
```

**⚠️ IMPORTANTE:** 
- En producción: `WEBHOOK_VERIFY_SIGNATURE=true` (rechaza webhooks sin firma)
- En desarrollo: Puede usar `WEBHOOK_ALLOW_INVALID_SIGNATURE=true` temporalmente
- **NUNCA** usar `WEBHOOK_ALLOW_INVALID_SIGNATURE=true` en producción

---

## 💰 Auto-Purchase - Guardrails de Seguridad

### Feature Flags Críticos
```env
AUTO_PURCHASE_ENABLED=false  # ⚠️ DEFAULT: false (no habilitar sin revisión)
AUTO_PURCHASE_DRY_RUN=true   # Recomendado para testing
```

### Límites de Seguridad
```env
AUTO_PURCHASE_DAILY_LIMIT=1000    # $1000 por día por usuario
AUTO_PURCHASE_MONTHLY_LIMIT=10000 # $10k por mes por usuario
AUTO_PURCHASE_MAX_PER_ORDER=500   # $500 máximo por orden
```

### Validaciones Implementadas
1. ✅ Feature flag global (`AUTO_PURCHASE_ENABLED`)
2. ✅ Límite diario por usuario
3. ✅ Límite mensual por usuario
4. ✅ Límite máximo por orden
5. ✅ Validación de capital disponible
6. ✅ Idempotencia (evita doble compra)
7. ✅ Modo dry-run (simulación sin ejecutar)

### Checklist Pre-Habilitación
- [ ] Límites configurados según capacidad financiera
- [ ] Validación de capital robusta verificada
- [ ] Idempotencia probada
- [ ] Dry-run ejecutado exitosamente
- [ ] Monitoreo configurado
- [ ] Alertas configuradas para límites

---

## 🔑 Secretos y Credenciales

### Variables de Entorno Sensibles
```env
JWT_SECRET=              # Mínimo 32 caracteres, único
ENCRYPTION_KEY=          # 32 caracteres, para encriptar credenciales
DATABASE_URL=            # Credenciales de base de datos
REDIS_URL=               # Si usa autenticación
WEBHOOK_SECRET_EBAY=
WEBHOOK_SECRET_MERCADOLIBRE=
WEBHOOK_SECRET_AMAZON=
PAYPAL_CLIENT_SECRET=
EBAY_CERT_ID=
MERCADOLIBRE_CLIENT_SECRET=
```

### Buenas Prácticas
- ✅ Usar secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
- ✅ Rotar secretos regularmente
- ✅ Nunca commitear secretos en código
- ✅ Usar diferentes secretos por ambiente
- ✅ Auditoría de acceso a secretos

---

## 🛡️ Rate Limiting

### Configuración Recomendada Producción
```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_DEFAULT=200      # Requests por 15 min
RATE_LIMIT_ADMIN=1000       # Requests por 15 min
RATE_LIMIT_LOGIN=5          # Intentos login por 15 min
```

### Multi-Instancia
- Si Redis está disponible, rate limits son compartidos entre instancias
- Si Redis no está disponible, cada instancia tiene su propio límite (puede permitir 2x más requests)

---

## 🔒 CORS

### Configuración
```env
CORS_ORIGIN=https://tu-dominio.com  # Frontend URL
```

**⚠️ IMPORTANTE:**
- No usar `*` en producción
- Configurar dominio específico
- Incluir protocolo (`https://`)

---

## 🚨 Incident Response

### Si se detecta compra automática no autorizada
1. **Inmediato:** `AUTO_PURCHASE_ENABLED=false`
2. Revisar logs de `[AutoPurchaseGuardrails]`
3. Identificar usuario y orden
4. Revisar límites configurados
5. Verificar si guardrails funcionaron correctamente

### Si se detectan webhooks no firmados siendo aceptados
1. **Inmediato:** Verificar `WEBHOOK_VERIFY_SIGNATURE=true`
2. Revisar logs de `[WebhookSignature]`
3. Verificar secretos configurados
4. Rotar secretos si es necesario

### Si hay rate limiting bypass
1. Verificar `RATE_LIMIT_ENABLED=true`
2. Verificar que Redis está disponible (para multi-instancia)
3. Revisar logs para identificar patrón
4. Ajustar límites si es necesario

---

## 📋 Auditoría

### Logs a Monitorear
- `[WebhookSignature]` - Validación de firmas
- `[AutoPurchaseGuardrails]` - Compra automática
- `[RateLimit]` - Rate limiting
- `[Auth]` - Autenticación y autorización

### Eventos a Alertar
- Webhooks rechazados por firma inválida
- Compra automática bloqueada por límites
- Rate limit excedido
- Intentos de login fallidos masivos
- Errores de autenticación

---

## ✅ Checklist Seguridad Pre-Deploy

- [ ] Todos los secretos configurados y seguros
- [ ] `AUTO_PURCHASE_ENABLED=false` (o con límites conservadores)
- [ ] `WEBHOOK_VERIFY_SIGNATURE=true` para todos
- [ ] Rate limiting habilitado
- [ ] CORS configurado correctamente
- [ ] `NODE_ENV=production`
- [ ] Logs no exponen información sensible
- [ ] Health checks funcionando
- [ ] Backups de base de datos configurados

