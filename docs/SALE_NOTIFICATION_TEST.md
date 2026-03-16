# Prueba de notificación de venta (email, sonido, navegador)

## Requisitos

- Backend con variables opcionales: `EMAIL_ENABLED=true`, `SMTP_*`, `SALE_NOTIFICATION_EMAIL=ivanmarty5338@gmail.com` (para recibir copia del aviso de venta).
- Frontend abierto con sesión iniciada y permiso de notificaciones del navegador concedido.

## Pasos

1. **Email:** Configurar en backend `SALE_NOTIFICATION_EMAIL=ivanmarty5338@gmail.com` y SMTP (y opcionalmente `EMAIL_ENABLED=true`). Disparar una notificación de venta (webhook real o flujo de venta) o enviar una notificación de prueba con tipo venta. Comprobar que llega correo a ivanmarty5338@gmail.com con asunto "[Ivan Reseller] Nueva venta recibida" y detalles.
2. **Sonido:** Con la app abierta, enviar notificación de prueba (POST /api/notifications/test con token) o simular una venta. Comprobar que se reproduce el sonido (archivo en `frontend/public/sounds/sonido_venta.mp3` o pitido de respaldo).
3. **Navegador:** Con permiso de notificaciones concedido, recibir una notificación de venta y comprobar que aparece la notificación del sistema con título y cuerpo, y que al hacer clic se abre la app en `/sales`.

## Notificación de prueba (backend)

Autenticado como usuario, llamar:

```http
POST /api/notifications/test
Authorization: Bearer <token>
```

El endpoint envía una notificación de prueba al usuario actual. Si el tipo es de venta (SALE_CREATED) y está configurado email/SALE_NOTIFICATION_EMAIL, se enviará también el correo.
