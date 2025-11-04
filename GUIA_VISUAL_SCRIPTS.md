# 🎮 GUÍA DE USO - Scripts de Inicio Automático

## 🚀 Inicio en 3 Pasos

```
┌─────────────────────────────────────────────────────────────┐
│  PASO 1: Hacer doble clic en "iniciar-sistema.bat"         │
├─────────────────────────────────────────────────────────────┤
│  El script preparará TODO automáticamente...                │
│  ✅ Verifica Node.js                                        │
│  ✅ Libera puertos                                          │
│  ✅ Crea archivos .env                                      │
│  ✅ Instala dependencias                                    │
│  ✅ Configura base de datos                                 │
│  ✅ Inicia Backend + Frontend                               │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 2: Esperar 10-20 segundos                             │
├─────────────────────────────────────────────────────────────┤
│  El navegador se abrirá automáticamente en:                 │
│  http://localhost:5173                                      │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 3: Login                                              │
├─────────────────────────────────────────────────────────────┤
│  Email:    admin@ivanreseller.com                           │
│  Password: admin123                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Archivos Disponibles

```
c:\Ivan_Reseller_Web\
│
├── 🚀 iniciar-sistema.bat       ⭐ PRINCIPAL - Inicia todo
├── 🛑 detener-sistema.bat          Detiene todo
├── 🔄 reiniciar-sistema.bat        Reinicia todo
├── 🔗 crear-acceso-directo.bat     Crea icono en escritorio
│
├── 📚 SCRIPTS_INICIO.md            Documentación completa
└── 📋 README.md                    Info general del proyecto
```

---

## 🎯 Uso Visual

### 1️⃣ Primera Ejecución (Instalación Completa)

```
🖱️  Doble clic en: iniciar-sistema.bat

⏱️  Tiempo: 2-5 minutos

📋 Qué hace:
   [1/9] 🔍 Verificando Node.js...              ✅
   [2/9] 🔓 Liberando puertos...                ✅
   [3/9] ⚙️  Configurando .env backend...       ✅
   [4/9] ⚙️  Configurando .env frontend...      ✅
   [5/9] 📦 Instalando backend...              ✅ (2 min)
   [6/9] 🗄️  Configurando base de datos...      ✅
   [7/9] 📦 Instalando frontend...             ✅ (1 min)
   [8/9] 🚀 Iniciando servicios...              ✅
   [9/9] 🔍 Verificando servicios...            ✅

🌐 Abriendo navegador en http://localhost:5173...
✅ ¡Sistema listo!
```

### 2️⃣ Ejecuciones Posteriores (Rápido)

```
🖱️  Doble clic en: iniciar-sistema.bat

⏱️  Tiempo: 10-20 segundos

📋 Qué hace:
   [1/9] 🔍 Node.js detectado               ✅ (1 seg)
   [2/9] 🔓 Puertos liberados               ✅ (1 seg)
   [3/9] ⚙️  .env backend existe            ✅ (instant)
   [4/9] ⚙️  .env frontend existe           ✅ (instant)
   [5/9] 📦 node_modules backend existe     ✅ (skip)
   [6/9] 🗄️  Base datos existe              ✅ (skip)
   [7/9] 📦 node_modules frontend existe    ✅ (skip)
   [8/9] 🚀 Servicios iniciados             ✅ (5 seg)
   [9/9] 🔍 Servicios verificados           ✅ (3 seg)

🌐 Navegador abierto
✅ ¡Listo en 15 segundos!
```

### 3️⃣ Detener Sistema

```
🖱️  Doble clic en: detener-sistema.bat

⏱️  Tiempo: 2-3 segundos

📋 Qué hace:
   🔍 Buscando procesos en puerto 3000...
      ✅ Backend detenido
   
   🔍 Buscando procesos en puerto 5173...
      ✅ Frontend detenido
   
   🔍 Buscando procesos en puerto 8077...
      ✅ Scraper detenido

🛑 Se detuvieron 3 proceso(s)
✅ Puertos liberados
```

### 4️⃣ Reiniciar Sistema

```
🖱️  Doble clic en: reiniciar-sistema.bat

⏱️  Tiempo: 15-25 segundos

📋 Qué hace:
   [1/2] 🛑 Deteniendo sistema...           ✅ (3 seg)
   [2/2] 🚀 Iniciando sistema...            ✅ (12 seg)

✅ Sistema reiniciado
```

---

## 🖼️ Crear Icono en Escritorio

```
🖱️  Doble clic en: crear-acceso-directo.bat

📋 Qué hace:
   ✅ Crea icono "Ivan Reseller Web" en escritorio
   ✅ Al hacer doble clic, ejecuta iniciar-sistema.bat
   ✅ Icono: 🚀 (icono de cohete del sistema)
```

**Resultado:**
```
📁 Escritorio
   └── 🚀 Ivan Reseller Web.lnk  ← ¡Doble clic aquí!
```

---

## 🎨 Ventanas del Sistema

Cuando inicias `iniciar-sistema.bat`, se crean 3 ventanas minimizadas:

```
┌──────────────────────────────────────────┐
│ 🟢 Ivan Reseller - Backend              │  Puerto 3000
│    Logs del servidor Express             │
│    Mantenla abierta mientras trabajas    │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ 🔵 Ivan Reseller - Frontend             │  Puerto 5173
│    Logs del servidor Vite                │
│    Mantenla abierta mientras trabajas    │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ 🟡 Ivan Reseller - Scraper              │  Puerto 8077
│    Logs del scraper Python (opcional)    │
│    Solo si Python está instalado         │
└──────────────────────────────────────────┘
```

**Ubicación:** Minimizadas en la barra de tareas
**Para verlas:** Busca "Ivan Reseller" en ventanas abiertas

---

## 🌐 URLs del Sistema

```
┌────────────────────────────────────────────────────────────┐
│  FRONTEND (Interfaz Web)                                   │
│  http://localhost:5173                                     │
│  └─ Dashboard, Productos, Configuración, etc.              │
├────────────────────────────────────────────────────────────┤
│  BACKEND (API REST)                                        │
│  http://localhost:3000                                     │
│  └─ Endpoints de la API                                    │
├────────────────────────────────────────────────────────────┤
│  API HEALTH (Estado del backend)                           │
│  http://localhost:3000/health                              │
│  └─ {"status": "ok", "timestamp": "..."}                   │
├────────────────────────────────────────────────────────────┤
│  API STATUS (Estado de las 9 APIs)                         │
│  http://localhost:3000/api/system/api-status              │
│  └─ Muestra qué APIs están configuradas                    │
├────────────────────────────────────────────────────────────┤
│  PRISMA STUDIO (Base de datos visual)                      │
│  cd backend && npx prisma studio                           │
│  http://localhost:5555                                     │
│  └─ Ver/editar datos de la base de datos                   │
└────────────────────────────────────────────────────────────┘
```

---

## 🔐 Credenciales y Acceso

```
┌───────────────────────────────────────────┐
│  USUARIO ADMINISTRADOR                    │
├───────────────────────────────────────────┤
│  Email:    admin@ivanreseller.com         │
│  Password: admin123                       │
│  Rol:      ADMIN                          │
│  Permisos: TODOS                          │
└───────────────────────────────────────────┘

Acceso: http://localhost:5173
```

**⚠️ Cambiar en Producción:**
1. Ir a Configuración → Perfil
2. Cambiar email y contraseña
3. Actualizar `JWT_SECRET` en `backend/.env`

---

## 📊 Estado Visual del Sistema

### ✅ Sistema Funcionando Correctamente

```
┌─────────────────────────────────────────┐
│ ✅ Backend:   http://localhost:3000     │
│ ✅ Frontend:  http://localhost:5173     │
│ ✅ Scraper:   http://localhost:8077     │
│ ✅ Database:  ./backend/prisma/dev.db   │
│ ✅ Navegador: Abierto automáticamente   │
└─────────────────────────────────────────┘

🎉 ¡Puedes empezar a trabajar!
```

### ❌ Sistema con Problemas

```
┌─────────────────────────────────────────┐
│ ❌ Backend:   No responde               │
│ ❌ Frontend:  Error de conexión         │
└─────────────────────────────────────────┘

🔧 Soluciones:
   1. Ejecuta: detener-sistema.bat
   2. Espera 5 segundos
   3. Ejecuta: iniciar-sistema.bat
   
   Si persiste:
   - Revisa logs en ventanas minimizadas
   - Lee SCRIPTS_INICIO.md sección "Solución de Problemas"
```

---

## 🎓 Flujo de Trabajo Típico

### Día Normal de Trabajo

```
8:00 AM  🖱️  Doble clic en: iniciar-sistema.bat
8:00 AM  ⏳ Esperar 15 segundos...
8:00 AM  🌐 Navegador abre automáticamente
8:01 AM  🔐 Login con credenciales
8:01 AM  💼 Empezar a trabajar

Durante el día:
   - Las ventanas están minimizadas
   - Sistema corre en segundo plano
   - Navegador en http://localhost:5173
   
6:00 PM  🖱️  Doble clic en: detener-sistema.bat
6:00 PM  ✅ Sistema detenido
6:00 PM  🏠 Ir a casa
```

### Desarrollo de Nuevas Funcionalidades

```
1. 🚀 Inicia: iniciar-sistema.bat
2. 💻 Edita código en VSCode
3. 🔥 Hot Reload automático (frontend + backend)
4. 🧪 Prueba cambios en navegador
5. 🔄 Si hay errores graves: reiniciar-sistema.bat
6. 🛑 Al terminar: detener-sistema.bat
```

---

## 🆘 Ayuda Rápida

### Problema: "No puedo acceder a http://localhost:5173"

```
✅ Solución Rápida:
   1. Abre: http://localhost:3000/health
   2. Si no responde → Backend no está corriendo
   3. Ejecuta: reiniciar-sistema.bat
```

### Problema: "Página en blanco"

```
✅ Solución Rápida:
   1. Presiona F12 (DevTools)
   2. Ve a Console
   3. Busca errores en rojo
   4. Si dice "CORS" → Verifica backend/.env
   5. Si dice "Network Error" → Reinicia backend
```

### Problema: "Los scripts no funcionan"

```
✅ Solución Rápida:
   1. Verifica Node.js instalado: node --version
   2. Si no está instalado → Descarga de nodejs.org
   3. Reinicia CMD después de instalar
   4. Ejecuta: iniciar-sistema.bat
```

---

## 📚 Documentación Completa

```
📖 SCRIPTS_INICIO.md
   └─ Guía completa de 2000+ líneas
   └─ Solución de problemas detallada
   └─ Comandos avanzados
   └─ Configuración de APIs
   └─ Modo desarrollador

📖 COMO_INICIAR_Y_PROBAR.md
   └─ Guía de pruebas del sistema
   └─ Verificación de APIs
   └─ Escenarios de prueba
   └─ Validación de funcionalidades

📖 AUDITORIA_VALIDACION_APIS.md
   └─ Sistema de validación de APIs
   └─ Detección automática
   └─ Activación/desactivación de features
```

---

## 🎉 ¡Listo para Usar!

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     🚀 SISTEMA IVAN RESELLER WEB LISTO                   ║
║                                                           ║
║     1. Doble clic en: iniciar-sistema.bat                ║
║     2. Espera 15 segundos                                ║
║     3. Login en http://localhost:5173                    ║
║     4. ¡Empieza a trabajar!                              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

**¿Necesitas ayuda?**
- 📖 Lee `SCRIPTS_INICIO.md`
- 🐛 Revisa logs en ventanas minimizadas
- 🔧 Ejecuta `reiniciar-sistema.bat`

---

**Sistema creado con ❤️ para facilitar tu trabajo**
