# Gu?a paso a paso: Resolver el login manual de AliExpress y quitar el banner rojo

## Requisitos previos
- Debes tener **email y contrase?a de AliExpress** configurados en la app (Configuraci?n ? Other Credentials / Credenciales de AliExpress).
- Si no los tienes, ve primero a **Configuraci?n** y configura las credenciales de AliExpress.

---

## Pasos para completar el login manual

### Paso 1: Ir a la p?gina de login manual
Cuando ves el banner rojo "ESTADO DE ALIEXPRESS - Acci?n requerida":

1. Haz clic en el badge **"Acci?n requerida"** (recuadro rojo en el Navbar) (arriba), haz clic en **"Iniciar sesi?n manual"** (el enlace que aparece junto al estado de AliExpress).
2. O ve a: **Oportunidades** ? busca algo (ej. "organizador cocina") ? si el sistema detecta que necesita login, te redirigir? autom?ticamente.
3. O escribe en el navegador: `https://www.ivanreseller.com/manual-login/new` (generar?s una nueva sesi?n).

---

### Paso 2: Generar una nueva sesi?n (si no tienes token)
Si llegas a la p?gina y dice "La sesi?n no existe o ha expirado":
- Haz clic en **"Generar nueva sesi?n"**.
- Te redirigir? a `/manual-login/[token]` con una sesi?n v?lida.

---

### Paso 3: Abrir la p?gina de AliExpress
1. Haz clic en el bot?n **"Abrir login de AliExpress"**.
2. Se abrir? una nueva pesta?a con la p?gina oficial de AliExpress.
3. Inicia sesi?n en AliExpress con tu email y contrase?a (completa el CAPTCHA si te lo pide).

---

### Paso 4: Copiar las cookies de la sesi?n
1. Una vez que hayas iniciado sesi?n en AliExpress (la pesta?a nueva), abre la **consola del navegador**:
   - Pulsa **F12** (o clic derecho ? Inspeccionar).
   - Ve a la pesta?a **Console**.
2. Pega este c?digo y pulsa **Enter**:

```javascript
copy(JSON.stringify(
  document.cookie.split(';').map(c => {
    const [name, ...rest] = c.trim().split('=');
    return { name, value: rest.join('='), domain: '.aliexpress.com', path: '/' };
  })
))
```

3. Esto copiar? las cookies al portapapeles en formato JSON.

---

### Paso 5: Pegar y guardar las cookies en Ivan Reseller
1. Vuelve a la pesta?a de Ivan Reseller (la p?gina de login manual).
2. Pega las cookies en el cuadro de texto (Ctrl+V).
3. Haz clic en **"Guardar sesi?n"**.

---

### Paso 6: Verificar
- Deber?as ver: **"Sesi?n guardada correctamente. Puedes cerrar esta ventana"**.
- El **banner rojo desaparecer?** y pasar? a **"Sesi?n activa"** (verde) en unos segundos.
- Refresca la p?gina (F5) si el banner no se actualiza solo.

---

## Alternativa: Guardar cookies desde Configuraci?n
Si ya tienes las cookies copiadas:
1. Ve a **Configuraci?n** ? **API Settings** (o **Other Credentials**).
2. Busca la secci?n de **AliExpress**.
3. Si hay un campo para pegar cookies, p?galas ah? y guarda.
4. O usa el endpoint de guardar cookies si est? disponible en la UI.

---

## Soluci?n de problemas

| Problema | Soluci?n |
|----------|----------|
| "Debes configurar email y password en Other Credentials" | Ve a Configuraci?n y configura las credenciales de AliExpress primero. |
| "La sesi?n ha expirado" | Las sesiones duran ~20 minutos. Genera una nueva sesi?n. |
| El banner sigue rojo tras guardar | Refresca la p?gina (F5) o espera 30 segundos. El estado se actualiza autom?ticamente. |
| Pop-up bloqueado | Si "Abrir login de AliExpress" no abre la ventana, permite pop-ups para ivanreseller.com en el navegador. |

---

## Despliegue (Backend y Frontend)

### Backend (Railway)
1. Ve a [Railway](https://railway.app) y abre tu proyecto.
2. El backend se despliega automáticamente si está conectado a GitHub.
3. Si no: Deployments ? Redeploy o conecta el repo y activa auto-deploy desde `main`.
4. Verifica que las variables de entorno estén configuradas (ALIEXPRESS_APP_KEY, etc.).

### Frontend (Vercel)
1. Ve a [Vercel](https://vercel.com) y abre tu proyecto.
2. El frontend se despliega automáticamente al hacer push a GitHub.
3. Si no: Deployments ? Redeploy Latest.
4. Haz hard refresh (Ctrl+Shift+R) en el navegador para evitar caché.
