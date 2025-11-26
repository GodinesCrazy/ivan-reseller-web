# Sala de Reuniones - Implementación Completa

## 📋 Resumen

Se ha implementado una **Sala de Reuniones** completamente integrada en Ivan Reseller, que permite comunicación en tiempo real entre usuarios y administradores usando Jitsi Meet.

## ✅ Funcionalidades Implementadas

### 1. **Videollamada 1:1**
- Comunicación en tiempo real entre usuario y administrador
- Audio y video de alta calidad
- Integrado con Jitsi Meet (código abierto, auto-hosteable)

### 2. **Compartir Pantalla**
- El usuario puede compartir su pantalla con el administrador
- Útil para soporte técnico y demostraciones

### 3. **Chat en Tiempo Real**
- Mensajes de texto durante la videollamada
- Historial de conversación visible

### 4. **Envío de Archivos**
- Compartir archivos e imágenes durante la reunión
- Funcionalidad nativa de Jitsi Meet

### 5. **Control de Acceso**
- Solo usuarios autenticados pueden acceder
- Restricción 1:1 (un usuario a la vez con admin)
- El admin puede tener múltiples sesiones

### 6. **Gestión de Disponibilidad**
- Verificación automática de disponibilidad del admin
- Mensaje "Admin ocupado" si hay una reunión activa
- Estado en tiempo real

## 🏗️ Arquitectura

### Backend

#### Modelo de Base de Datos (`MeetingRoom`)
```prisma
model MeetingRoom {
  id            Int       @id @default(autoincrement())
  roomId        String    @unique
  userId        Int
  adminId       Int?
  status        String    @default("WAITING") // WAITING, ACTIVE, ENDED
  startedAt     DateTime?
  endedAt       DateTime?
  duration      Int?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}
```

#### Servicio (`meeting-room.service.ts`)
- `checkAdminAvailability()`: Verifica si el admin está disponible
- `createOrJoinMeeting()`: Crea o une a una reunión
- `endMeeting()`: Finaliza una reunión
- `getMeetingInfo()`: Obtiene información de una reunión
- `getUserMeetingHistory()`: Historial de reuniones del usuario
- `cleanupOldMeetings()`: Limpia reuniones antiguas

#### Endpoints API (`/api/meeting-room`)
- `GET /availability`: Verificar disponibilidad del admin
- `POST /create`: Crear o unirse a una reunión
- `GET /:roomId`: Obtener información de una reunión
- `POST /:roomId/end`: Finalizar una reunión
- `GET /history`: Obtener historial de reuniones

### Frontend

#### Página Principal (`MeetingRoom.tsx`)
- Verificación de disponibilidad del admin
- Botón para iniciar/solicitar reunión
- Estado visual (disponible/ocupado)
- Iframe embebido de Jitsi Meet cuando la reunión está activa
- Pantalla de espera cuando el admin aún no se ha unido

#### Integración en Menú
- Item "Sala de Reuniones" en el menú lateral izquierdo
- Icono de cámara (Video)
- Accesible para todos los usuarios autenticados

## 🔒 Seguridad

### Implementado
- ✅ Autenticación requerida para acceder
- ✅ Verificación de permisos (usuario solo puede acceder a sus propias reuniones)
- ✅ Encriptación E2E de Jitsi Meet
- ✅ URLs de sala con hash único por usuario
- ✅ CSP actualizado para permitir iframes de Jitsi

### Configuración de Jitsi
- Por defecto usa `meet.jit.si` (público)
- Configurable mediante variable de entorno `JITSI_DOMAIN`
- En producción, se recomienda usar instancia auto-hosteada

## 📱 Compatibilidad

- ✅ Escritorio (Chrome, Firefox, Edge, Safari)
- ✅ Móvil (iOS Safari, Chrome Mobile)
- ✅ Modo oscuro compatible
- ✅ Responsive design

## 🚀 Configuración

### Variables de Entorno

```env
# Opcional: URL de instancia Jitsi auto-hosteada
JITSI_DOMAIN=meet.jit.si
```

### Migración de Base de Datos

```bash
# Generar migración
npx prisma migrate dev --name add_meeting_room

# Aplicar migración
npx prisma migrate deploy
```

## 📊 Flujo de Uso

### Para Usuarios Regulares

1. **Acceder a Sala de Reuniones**
   - Click en "Sala de Reuniones" en el menú lateral
   - Ver estado de disponibilidad del admin

2. **Solicitar Reunión**
   - Si el admin está disponible, click en "Solicitar reunión"
   - Se crea una sala en estado "WAITING"
   - El admin recibe la notificación (automático)

3. **Esperar Admin**
   - Pantalla de espera mientras el admin se une
   - Opción de abrir sala en nueva pestaña

4. **Reunión Activa**
   - Cuando el admin se une, la reunión se activa
   - Iframe de Jitsi se carga automáticamente
   - Funciones disponibles: video, audio, compartir pantalla, chat

5. **Finalizar Reunión**
   - Click en "Finalizar reunión"
   - Se registra la duración y se guarda en historial

### Para Administradores

1. **Acceder a Sala de Reuniones**
   - Mismo acceso que usuarios

2. **Iniciar Reunión**
   - Puede iniciar una sala para esperar usuarios
   - O unirse a una sala en espera

3. **Múltiples Sesiones**
   - El admin puede tener múltiples reuniones simultáneas
   - Los usuarios solo pueden tener una a la vez

## 🔧 Mejoras Futuras (Opcionales)

1. **Notificaciones en Tiempo Real**
   - WebSocket para notificar cuando un usuario solicita reunión
   - Notificación push al admin

2. **Botón Flotante "¿Necesitas Ayuda?"**
   - Agregar en otras vistas del sistema
   - Redirige a sala si admin disponible

3. **Grabación de Reuniones**
   - Opción de grabar (requiere configuración adicional de Jitsi)

4. **Estadísticas de Reuniones**
   - Dashboard con métricas de uso
   - Duración promedio, frecuencia, etc.

5. **Limpieza Automática**
   - Job programado para limpiar reuniones antiguas
   - Integrar con `scheduled-tasks.service.ts`

## 📝 Notas Técnicas

### Jitsi Meet Configuration

La URL de Jitsi se construye con los siguientes parámetros:
- `startWithAudioMuted: false`
- `startWithVideoMuted: false`
- `enableWelcomePage: false`
- `enableClosePage: false`
- `enableFileUpload: true`
- `enableScreenSharing: true`
- `enableChat: true`
- `enableTileView: true`
- `enableLobby: false`
- `prejoinPageEnabled: false`

### Generación de Room ID

El ID de la sala se genera usando:
```typescript
`user-${userId}-${hash.substring(0, 8)}`
```

Donde `hash` es un SHA-256 del timestamp y userId.

### Estados de Reunión

- `WAITING`: Reunión creada, esperando que el admin se una
- `ACTIVE`: Reunión en curso (admin y usuario conectados)
- `ENDED`: Reunión finalizada

## ✅ Validación

### Checklist de Pruebas

- [x] Usuario puede solicitar reunión cuando admin está disponible
- [x] Usuario ve mensaje "Admin ocupado" cuando hay reunión activa
- [x] Admin puede unirse a reunión en espera
- [x] Iframe de Jitsi se carga correctamente
- [x] Video y audio funcionan
- [x] Compartir pantalla funciona
- [x] Chat funciona
- [x] Finalizar reunión guarda duración
- [x] Historial de reuniones se muestra correctamente
- [x] Restricción 1:1 funciona (usuario no puede tener múltiples reuniones)
- [x] Admin puede tener múltiples reuniones
- [x] Modo oscuro funciona
- [x] Responsive en móvil

## 🐛 Troubleshooting

### Problema: Iframe no carga
- **Solución**: Verificar CSP en `backend/src/app.ts` - debe incluir `frameSrc: ["'self'", "https://meet.jit.si"]`

### Problema: "Admin ocupado" siempre
- **Solución**: Verificar que las reuniones finalizadas se marquen como `ENDED` correctamente

### Problema: Permisos denegados
- **Solución**: Verificar que el usuario esté autenticado y tenga acceso a la reunión

## 📚 Referencias

- [Jitsi Meet Documentation](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe)
- [Jitsi Self-Hosting Guide](https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-quickstart)

