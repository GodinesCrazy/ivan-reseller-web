# ðŸš€ Scripts de Inicio AutomÃ¡tico - Ivan Reseller Web

## ðŸ“ Archivos Disponibles

### 1. `iniciar-sistema.bat` â­ (Principal)
Script completo que prepara el entorno e inicia el sistema automÃ¡ticamente.

**Â¿QuÃ© hace?**
- âœ… Verifica Node.js instalado
- âœ… Libera puertos ocupados (3000, 5173, 8077)
- âœ… Crea archivos `.env` automÃ¡ticamente
- âœ… Instala dependencias (npm install)
- âœ… Configura base de datos Prisma
- âœ… Inicia Backend, Frontend y Scraper Python
- âœ… Abre navegador en http://localhost:5173
- âœ… Muestra credenciales de acceso

### 2. `detener-sistema.bat`
Detiene todos los servicios de Ivan Reseller Web.

**Â¿QuÃ© hace?**
- ðŸ›‘ Cierra procesos en puerto 3000 (Backend)
- ðŸ›‘ Cierra procesos en puerto 5173 (Frontend)
- ðŸ›‘ Cierra procesos en puerto 8077 (Scraper)
- ðŸ›‘ Libera todos los puertos
- âœ… Muestra resumen de procesos detenidos

### 3. `reiniciar-sistema.bat`
Reinicia el sistema completo (detiene + inicia).

**Â¿QuÃ© hace?**
- ðŸ”„ Ejecuta `detener-sistema.bat`
- ðŸ”„ Ejecuta `iniciar-sistema.bat`

---

## ðŸŽ¯ Uso RÃ¡pido

### Inicio Primera Vez (Recomendado)

```cmd
# Doble clic en:
iniciar-sistema.bat
```

El script harÃ¡ **TODO automÃ¡ticamente**:
1. Verifica requisitos
2. Configura entorno
3. Instala dependencias
4. Prepara base de datos
5. Inicia servicios
6. Abre navegador

**Tiempo estimado:** 2-5 minutos (primera vez)

### Inicios Posteriores (RÃ¡pido)

```cmd
# Doble clic en:
iniciar-sistema.bat
```

**Tiempo estimado:** 10-20 segundos

### Detener Sistema

```cmd
# Doble clic en:
detener-sistema.bat
```

### Reiniciar Sistema

```cmd
# Doble clic en:
reiniciar-sistema.bat
```

---

## ðŸ“‹ InformaciÃ³n del Sistema

### URLs de Acceso
- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3000
- **API Health:** http://localhost:3000/health
- **API Status:** http://localhost:3000/api/system/api-status
- **Scraper:** http://localhost:8077 (si Python instalado)

### Credenciales por Defecto
```
Email:    admin@ivanreseller.com
Password: admin123
```

### Puertos Utilizados
- `3000` - Backend (Node.js + Express)
- `5173` - Frontend (React + Vite)
- `8077` - Scraper Python (opcional)

---

## ðŸ”§ ConfiguraciÃ³n Avanzada

### Configurar APIs Externas

DespuÃ©s del primer inicio, edita:
```
backend\.env
```

**APIs Disponibles:**
```bash
# eBay API
EBAY_APP_ID=tu_app_id
EBAY_DEV_ID=tu_dev_id
EBAY_CERT_ID=tu_cert_id

# Amazon SP-API
AMAZON_ACCESS_KEY_ID=tu_access_key
AMAZON_SECRET_ACCESS_KEY=tu_secret
# ... (8 campos mÃ¡s)

# MercadoLibre
MERCADOLIBRE_CLIENT_ID=tu_client_id
MERCADOLIBRE_CLIENT_SECRET=tu_secret

# GROQ AI
GROQ_API_KEY=gsk_tu_api_key

# Scraping
SCRAPERAPI_KEY=tu_api_key
ZENROWS_API_KEY=tu_api_key
TWOCAPTCHA_API_KEY=tu_api_key

# PayPal Payouts
PAYPAL_CLIENT_ID=tu_client_id
PAYPAL_CLIENT_SECRET=tu_secret
PAYPAL_MODE=sandbox

# AliExpress
ALIEXPRESS_APP_KEY=tu_app_key
ALIEXPRESS_APP_SECRET=tu_secret
```

**DespuÃ©s de editar `.env`:**
```cmd
reiniciar-sistema.bat
```

---

## ðŸ› SoluciÃ³n de Problemas

### Problema: "Node.js no estÃ¡ instalado"

**SoluciÃ³n:**
1. Descarga Node.js v18+ desde: https://nodejs.org/
2. Instala con opciones por defecto
3. Reinicia CMD y ejecuta `iniciar-sistema.bat`

### Problema: "Puerto 3000 ocupado"

El script libera puertos automÃ¡ticamente, pero si persiste:

```cmd
# OpciÃ³n 1: Usa detener-sistema.bat
detener-sistema.bat

# OpciÃ³n 2: Manual
netstat -aon | findstr :3000
taskkill /F /PID [PID_ENCONTRADO]
```

### Problema: "Error instalando dependencias"

```cmd
# Limpia node_modules y reinstala
cd backend
rmdir /S /Q node_modules
cd ..\frontend
rmdir /S /Q node_modules
cd ..

# Vuelve a ejecutar
iniciar-sistema.bat
```

### Problema: "Base de datos corrupta"

```cmd
cd backend
del prisma\dev.db
npx prisma migrate deploy
npm run prisma:seed
cd ..
```

### Problema: "Frontend no conecta con Backend"

Verifica `frontend\.env`:
```bash
VITE_API_URL=http://localhost:3000
```

### Problema: "PÃ¡gina en blanco"

1. Abre DevTools (F12)
2. Ve a Console
3. Busca errores
4. AsegÃºrate que Backend responde: http://localhost:3000/health

---

## ðŸ“Š Logs y DepuraciÃ³n

### Ver Logs del Backend

```cmd
# Las ventanas se minimizan automÃ¡ticamente
# BÃºscalas en la barra de tareas:
"Ivan Reseller - Backend"
```

O manualmente:
```cmd
cd backend
npm run dev
```

### Ver Logs del Frontend

```cmd
# Busca la ventana:
"Ivan Reseller - Frontend"
```

O manualmente:
```cmd
cd frontend
npm run dev
```

### Ver Base de Datos

```cmd
cd backend
npx prisma studio
```

Abre en: http://localhost:5555

---

## ðŸŽ›ï¸ Comandos Ãštiles

### Ver Estado del Sistema

```cmd
# Ver procesos Node.js activos
tasklist | findstr node.exe

# Ver puertos ocupados
netstat -ano | findstr "3000 5173 8077"
```

### Limpiar Todo y Empezar de Cero

```cmd
# Detener sistema
detener-sistema.bat

# Eliminar archivos temporales
cd backend
rmdir /S /Q node_modules
del prisma\dev.db
del .env

cd ..\frontend
rmdir /S /Q node_modules
del .env

cd ..

# Iniciar de nuevo (instalarÃ¡ todo)
iniciar-sistema.bat
```

### Actualizar Dependencias

```cmd
# Backend
cd backend
npm update

# Frontend
cd frontend
npm update

cd ..
```

---

## âš¡ Modo Desarrollador

### Inicio Sin Minimizar Ventanas

Edita `iniciar-sistema.bat`, busca estas lÃ­neas:

```batch
:: Cambiar /MIN por /NORMAL para ver las ventanas
start "Ivan Reseller - Backend" /NORMAL cmd /c "cd /d "%CD%\backend" && npm run dev:skip"
start "Ivan Reseller - Frontend" /NORMAL cmd /c "cd /d "%CD%\frontend" && npm run dev"
```

### Build de ProducciÃ³n

```cmd
# Backend
cd backend
npm run build
npm run start:prod

# Frontend
cd frontend
npm run build
npm run preview
```

---

## ðŸ“š DocumentaciÃ³n Relacionada

- `COMO_INICIAR_Y_PROBAR.md` - GuÃ­a completa de inicio
- `AUDITORIA_VALIDACION_APIS.md` - Sistema de validaciÃ³n de APIs
- `README.md` - DocumentaciÃ³n general del proyecto
- `DEPLOYMENT_STEPS.md` - Despliegue en producciÃ³n

---

## ðŸ†˜ Soporte

### Si los scripts no funcionan:

1. **Verifica requisitos:**
   - Windows 10/11
   - Node.js v18+
   - CMD o PowerShell
   - Permisos de administrador (si es necesario)

2. **Revisa logs:**
   - Abre las ventanas minimizadas
   - Busca errores en rojo

3. **Prueba manualmente:**
   ```cmd
   cd backend
   npm install
   npm run dev
   ```
   
   En otra terminal:
   ```cmd
   cd frontend
   npm install
   npm run dev
   ```

4. **Consulta documentaciÃ³n:**
   - Lee `COMO_INICIAR_Y_PROBAR.md`
   - Revisa `backend\package.json` scripts

---

## âœ¨ CaracterÃ­sticas

- âœ… **PreparaciÃ³n automÃ¡tica completa**
- âœ… **DetecciÃ³n de conflictos de puertos**
- âœ… **CreaciÃ³n automÃ¡tica de .env**
- âœ… **InstalaciÃ³n de dependencias**
- âœ… **ConfiguraciÃ³n de base de datos**
- âœ… **Inicio en ventanas separadas**
- âœ… **Apertura automÃ¡tica del navegador**
- âœ… **VerificaciÃ³n de servicios**
- âœ… **Scripts de detener/reiniciar**
- âœ… **Mensajes coloridos y claros**
- âœ… **Manejo de errores robusto**

---

## ðŸ“ Notas

- Los scripts `.bat` funcionan en **Windows** (7/8/10/11)
- Para **Linux/Mac**, usa `start-system.ps1` (PowerShell)
- Las ventanas se minimizan para no estorbar
- El navegador se abre automÃ¡ticamente despuÃ©s de 11 segundos
- La primera ejecuciÃ³n tarda mÃ¡s (instala todo)
- Ejecuciones posteriores son instantÃ¡neas

---

**Â¡Sistema listo para usar! ðŸš€**

Ejecuta `iniciar-sistema.bat` y comienza a trabajar en segundos.
