# 🎯 GUÍA VISUAL: APIs Faltantes por Agregar

## 📊 Estado Actual de Implementación

```
IMPLEMENTADAS (9):  ████████████████████████░░░░░░ 60%
FALTANTES (6):      ░░░░░░░░░░░░░░░░░░░░░░░░██████ 40%
```

---

## ✅ LO QUE YA TIENES (9 APIs)

### 🛒 Marketplaces (3 + 3 ambientes = 6 configs)
```
✅ eBay API
   ├─ Sandbox:    4 campos configurables
   └─ Production: 4 campos configurables

✅ Amazon SP-API  
   ├─ Sandbox:    8 campos configurables
   └─ Production: 8 campos configurables

✅ MercadoLibre API
   ├─ Sandbox:    4 campos configurables
   └─ Production: 4 campos configurables
```

### 🤖 Inteligencia Artificial (1 config)
```
✅ GROQ AI
   └─ Production: 1 campo (API Key)
```

### 🕷️ Web Scraping (3 configs)
```
✅ ScraperAPI
   └─ Production: 1 campo (API Key)

✅ ZenRows
   └─ Production: 1 campo (API Key)

✅ 2Captcha
   └─ Production: 1 campo (API Key)
```

### 💰 Pagos (1 + 1 ambiente = 2 configs)
```
✅ PayPal Payouts
   ├─ Sandbox:    3 campos configurables
   └─ Production: 3 campos configurables
```

### 🛍️ Compra Automatizada (1 config)
```
✅ AliExpress Auto-Purchase
   └─ Production: 3 campos (Email, Password, 2FA)
```

---

## ⚠️ LO QUE FALTA AGREGAR (6 APIs)

### 📧 CRÍTICO: Sistema de Emails
```
❌ Email SMTP (Nodemailer)
   └─ Production: 6 campos necesarios
   
   Campos requeridos:
   ┌───────────────────────────────────────────┐
   │ EMAIL_HOST           smtp.gmail.com       │
   │ EMAIL_PORT           587                  │
   │ EMAIL_USER           your@email.com       │
   │ EMAIL_PASSWORD       ****************     │
   │ EMAIL_FROM           noreply@domain.com   │
   │ EMAIL_SECURE         true                 │
   └───────────────────────────────────────────┘

   Servicios compatibles:
   • Gmail (gratis, 500 emails/día)
   • SendGrid (12,000 gratis/mes)
   • Mailgun (5,000 gratis/mes)
   • AWS SES (62,000 gratis/mes)
   • Resend (3,000 gratis/mes)

   ⚠️ SIN ESTO NO FUNCIONAN:
   - Emails de bienvenida
   - Recuperación de contraseña
   - Notificaciones de ventas
   - Reportes automáticos
```

### 📱 IMPORTANTE: Notificaciones SMS
```
❌ Twilio API
   └─ Production: 4 campos necesarios
   
   Campos requeridos:
   ┌───────────────────────────────────────────┐
   │ TWILIO_ACCOUNT_SID   ACxxxxxxxxxxxxx      │
   │ TWILIO_AUTH_TOKEN    ****************     │
   │ TWILIO_PHONE_NUMBER  +1234567890          │
   │ TWILIO_WHATSAPP_NUM  whatsapp:+1234567890 │
   └───────────────────────────────────────────┘

   Funciones:
   • SMS de alertas importantes
   • Notificaciones de ventas urgentes
   • 2FA por SMS
   • WhatsApp Business messages

   Costo: ~$0.0075 por SMS, ~$0.005 por WhatsApp
```

### 💬 ÚTIL: Notificaciones al Equipo
```
❌ Slack API
   └─ Production: 3 campos necesarios
   
   Campos requeridos:
   ┌───────────────────────────────────────────┐
   │ SLACK_BOT_TOKEN      xoxb-xxxxxxxxxxxxx   │
   │ SLACK_WEBHOOK_URL    https://hooks.slack  │
   │ SLACK_CHANNEL_ID     C01XXXXXXXXXX        │
   └───────────────────────────────────────────┘

   Funciones:
   • Alertas de ventas en tiempo real
   • Notificaciones de errores
   • Reportes diarios automáticos
   • Monitoring del sistema

   Costo: GRATIS ✅
```

### 🤖 OPCIONAL: IA Alternativa
```
⚪ OpenAI API (opcional)
   └─ Production: 1 campo necesario
   
   Campo requerido:
   ┌───────────────────────────────────────────┐
   │ OPENAI_API_KEY       sk-xxxxxxxxxxxxx     │
   └───────────────────────────────────────────┘

   Uso sugerido:
   • Complemento a GROQ para tareas complejas
   • GPT-4 para análisis avanzado
   • Traducción de descripciones
   • Análisis de sentimiento

   Costo: Variable según modelo
   NOTA: No urgente, GROQ ya funciona bien
```

### 💳 OPCIONAL: Pagos Alternativos
```
⚪ Stripe API (opcional)
   └─ Production: 3 campos necesarios
   
   Campos requeridos:
   ┌───────────────────────────────────────────┐
   │ STRIPE_PUBLISHABLE_KEY  pk_live_xxxxxxxx  │
   │ STRIPE_SECRET_KEY       sk_live_xxxxxxxx  │
   │ STRIPE_WEBHOOK_SECRET   whsec_xxxxxxxxxx  │
   └───────────────────────────────────────────┘

   Uso sugerido:
   • Suscripciones de usuarios
   • Pagos con tarjeta
   • Cobro de comisiones de plataforma

   Costo: 2.9% + $0.30 por transacción
   NOTA: PayPal ya funciona, Stripe es alternativa
```

### 🔗 OPCIONAL: Webhooks
```
⚪ Webhooks Configuration
   └─ URLs a configurar en cada plataforma
   
   URLs necesarias:
   ┌───────────────────────────────────────────┐
   │ eBay Webhooks                             │
   │ /api/webhooks/ebay/orders                 │
   │ /api/webhooks/ebay/inventory              │
   │                                           │
   │ Amazon Webhooks                           │
   │ /api/webhooks/amazon/orders               │
   │ /api/webhooks/amazon/inventory            │
   │                                           │
   │ MercadoLibre Webhooks                     │
   │ /api/webhooks/mercadolibre/orders         │
   │ /api/webhooks/mercadolibre/questions      │
   │                                           │
   │ PayPal Webhooks                           │
   │ /api/webhooks/paypal/payout               │
   └───────────────────────────────────────────┘

   Funciones:
   • Recibir notificaciones automáticas
   • Sincronización en tiempo real
   • Actualización de inventario

   NOTA: No crítico, sistema puede trabajar con polling
```

---

## 🎯 PLAN DE IMPLEMENTACIÓN

### PASO 1: Email SMTP (1 día) ⚠️ CRÍTICO
```javascript
// Agregar en backend/src/routes/settings.routes.ts línea ~180

{
  id: 10,
  name: 'Email SMTP',
  category: 'notifications',
  status: 'not_configured',
  environment: 'production',
  lastUsed: null,
  requestsToday: 0,
  limit: 500,
  fields: [
    { 
      key: 'EMAIL_HOST', 
      label: 'SMTP Host', 
      required: true, 
      type: 'text', 
      placeholder: 'smtp.gmail.com',
      help: 'SMTP server address (e.g., smtp.gmail.com, smtp.sendgrid.net)'
    },
    { 
      key: 'EMAIL_PORT', 
      label: 'SMTP Port', 
      required: true, 
      type: 'text', 
      placeholder: '587',
      help: 'Usually 587 for TLS, 465 for SSL, 25 for unencrypted'
    },
    { 
      key: 'EMAIL_USER', 
      label: 'Email User', 
      required: true, 
      type: 'text', 
      placeholder: 'your@email.com',
      help: 'SMTP authentication username (usually your email)'
    },
    { 
      key: 'EMAIL_PASSWORD', 
      label: 'Email Password', 
      required: true, 
      type: 'password',
      help: 'SMTP password or app-specific password'
    },
    { 
      key: 'EMAIL_FROM', 
      label: 'From Address', 
      required: true, 
      type: 'text', 
      placeholder: 'noreply@ivanreseller.com',
      help: 'Email address shown as sender'
    },
    { 
      key: 'EMAIL_SECURE', 
      label: 'Use TLS/SSL', 
      required: false, 
      type: 'text', 
      placeholder: 'true',
      help: 'true for TLS (port 587), false for unencrypted'
    }
  ],
  description: 'SMTP server for sending transactional emails. Compatible with Gmail, SendGrid, Mailgun, AWS SES, Resend, etc.',
  documentation: 'https://nodemailer.com/smtp/'
}
```

### PASO 2: Twilio SMS (1 día) 📱
```javascript
// Agregar después de Email SMTP

{
  id: 11,
  name: 'Twilio SMS',
  category: 'notifications',
  status: 'not_configured',
  environment: 'production',
  lastUsed: null,
  requestsToday: 0,
  limit: 1000,
  fields: [
    { 
      key: 'TWILIO_ACCOUNT_SID', 
      label: 'Account SID', 
      required: true, 
      type: 'text', 
      placeholder: 'ACxxxxxxxxxxxxx',
      help: 'Your Twilio Account SID from console.twilio.com'
    },
    { 
      key: 'TWILIO_AUTH_TOKEN', 
      label: 'Auth Token', 
      required: true, 
      type: 'password',
      help: 'Your Twilio Auth Token (keep secret)'
    },
    { 
      key: 'TWILIO_PHONE_NUMBER', 
      label: 'Phone Number', 
      required: true, 
      type: 'text', 
      placeholder: '+1234567890',
      help: 'Your Twilio phone number with country code'
    },
    { 
      key: 'TWILIO_WHATSAPP_NUMBER', 
      label: 'WhatsApp Number', 
      required: false, 
      type: 'text', 
      placeholder: 'whatsapp:+1234567890',
      help: 'Your Twilio WhatsApp-enabled number (optional)'
    }
  ],
  description: 'Twilio for SMS and WhatsApp notifications. Cost: ~$0.0075 per SMS, ~$0.005 per WhatsApp message.',
  documentation: 'https://www.twilio.com/docs/sms'
}
```

### PASO 3: Slack API (1 día) 💬
```javascript
// Agregar después de Twilio

{
  id: 12,
  name: 'Slack Notifications',
  category: 'notifications',
  status: 'not_configured',
  environment: 'production',
  lastUsed: null,
  requestsToday: 0,
  limit: 10000,
  fields: [
    { 
      key: 'SLACK_BOT_TOKEN', 
      label: 'Bot User Token', 
      required: true, 
      type: 'password', 
      placeholder: 'xoxb-xxxxxxxxxxxxx',
      help: 'Bot User OAuth Token from api.slack.com/apps'
    },
    { 
      key: 'SLACK_WEBHOOK_URL', 
      label: 'Webhook URL', 
      required: false, 
      type: 'text',
      help: 'Incoming Webhook URL (optional, alternative to bot token)'
    },
    { 
      key: 'SLACK_CHANNEL_ID', 
      label: 'Channel ID', 
      required: true, 
      type: 'text', 
      placeholder: 'C01XXXXXXXXXX',
      help: 'ID of the channel to post notifications (right-click channel → Copy link)'
    }
  ],
  description: 'Slack for team notifications and alerts. Free to use. Perfect for monitoring sales and system events.',
  documentation: 'https://api.slack.com/messaging/webhooks'
}
```

---

## 📋 CHECKLIST DE TRABAJO

### Backend (3 días)
```
[ ] Agregar Email SMTP (ID: 10) a settings.routes.ts
    └─ 6 campos: Host, Port, User, Password, From, Secure

[ ] Agregar Twilio API (ID: 11) a settings.routes.ts
    └─ 4 campos: Account SID, Auth Token, Phone, WhatsApp

[ ] Agregar Slack API (ID: 12) a settings.routes.ts
    └─ 3 campos: Bot Token, Webhook URL, Channel ID

[ ] Agregar OpenAI API (ID: 13) OPCIONAL
    └─ 1 campo: API Key

[ ] Agregar Stripe API (ID: 14) OPCIONAL
    └─ 3 campos: Publishable Key, Secret Key, Webhook Secret

[ ] Implementar sistema de categorías en la respuesta
    └─ Agrupar por: marketplaces, ia, scraping, payments, notifications

[ ] Validar que encriptación funcione para todos los nuevos campos
```

### Frontend (4 días)
```
[ ] Agregar tabs/categorías en APIConfiguration.tsx
    ├─ 🛒 Marketplaces
    ├─ 🤖 Inteligencia Artificial
    ├─ 🕷️ Web Scraping
    ├─ 💰 Pagos
    ├─ 📧 Notificaciones
    └─ 🛍️ Compra Automatizada

[ ] Implementar toggle Sandbox/Production para cada marketplace
    └─ Mostrar campos duplicados con prefijos _SANDBOX_ y _PRODUCTION_

[ ] Agregar formularios para las 3 nuevas APIs
    ├─ Email SMTP (6 campos)
    ├─ Twilio (4 campos)
    └─ Slack (3 campos)

[ ] Implementar botón "Test Connection" para cada API
    └─ Validar credenciales antes de guardar

[ ] Agregar tooltips/help text para cada campo

[ ] Mostrar documentación inline con links

[ ] Indicadores visuales mejorados
    ├─ ✅ Configurado y funcionando
    ├─ ⚠️ Configurado pero con errores
    └─ ❌ No configurado
```

### Testing (2 días)
```
[ ] Test Email SMTP con Gmail
[ ] Test Email SMTP con SendGrid
[ ] Test Twilio SMS en sandbox
[ ] Test Slack notifications
[ ] Test toggle Sandbox/Production
[ ] Test encriptación de nuevos campos
[ ] Test "Test Connection" para cada API
[ ] Validar que UI muestre todas las categorías
[ ] Test responsive design
[ ] Test casos de error (credenciales inválidas)
```

---

## 💰 COSTOS ESTIMADOS

```
CONFIGURACIÓN MÍNIMA (solo críticos):
┌────────────────────────────────────┐
│ Email SMTP (Gmail):    $0/mes      │
│ Total añadido:         $0/mes      │
└────────────────────────────────────┘
Costo total sistema: $39/mes (sin cambios)


CONFIGURACIÓN RECOMENDADA:
┌────────────────────────────────────┐
│ Email SMTP (Gmail):    $0/mes      │
│ Twilio SMS:            $20/mes     │
│ Slack:                 $0/mes      │
│ Total añadido:         $20/mes     │
└────────────────────────────────────┘
Costo total sistema: $59/mes


CONFIGURACIÓN COMPLETA:
┌────────────────────────────────────┐
│ Email SMTP (SendGrid): $19.95/mes │
│ Twilio SMS+WhatsApp:   $50/mes    │
│ Slack:                 $0/mes      │
│ OpenAI API:            $100/mes    │
│ Stripe:                $0 + fees   │
│ Total añadido:         $169.95/mes │
└────────────────────────────────────┘
Costo total sistema: $208.95/mes + fees
```

---

## ⏱️ TIEMPO ESTIMADO

```
Backend (settings.routes.ts):  3 días
Frontend (API Configuration):  4 días
Testing:                       2 días
                              ─────────
TOTAL:                        9 días
```

### Desglose Detallado:
```
DÍA 1: Agregar Email SMTP al backend + testing
DÍA 2: Agregar Twilio y Slack al backend + testing
DÍA 3: Agregar categorías y estructura al endpoint
DÍA 4: Frontend - Implementar tabs/categorías
DÍA 5: Frontend - Formularios nuevas APIs
DÍA 6: Frontend - Toggle Sandbox/Production
DÍA 7: Frontend - Test Connection + tooltips
DÍA 8: Testing completo de todas las APIs
DÍA 9: Bug fixes + documentación
```

---

## ✅ RESULTADO FINAL

Una vez completado, tendrás:

```
✅ 15 APIs configurables desde la web
✅ Sistema de emails funcionando
✅ Notificaciones SMS y WhatsApp
✅ Alertas de Slack al equipo
✅ Toggle Sandbox/Production para marketplaces
✅ Categorización clara de APIs
✅ Test de conexión antes de guardar
✅ Documentación inline
✅ Sistema 100% completo
```

---

**¿Listo para empezar? Los próximos 3 archivos a editar:**
1. `backend/src/routes/settings.routes.ts` - Agregar las 3 nuevas APIs
2. `frontend/src/pages/APIConfiguration.tsx` - Actualizar UI con categorías
3. `frontend/src/pages/APISettings.tsx` - Actualizar gestión avanzada
