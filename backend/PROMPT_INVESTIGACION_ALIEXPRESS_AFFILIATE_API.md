# Prompt para investigaci�n: AliExpress Affiliate API (integraci�n correcta)

Copia y pega todo el bloque siguiente en ChatGPT para que investigue a fondo la integraci�n oficial de la API de AliExpress Affiliate y el flujo OAuth, y te devuelva instrucciones precisas y actualizadas.

---

## Bloque para copiar (desde "Necesito que investigues" hasta "implementaci�n correcta.")

```
Necesito que investigues a fondo la integraci�n oficial de la API de AliExpress Affiliate (AliExpress Open Platform / Portals API) y me des instrucciones precisas, actualizadas y basadas en documentaci�n o ejemplos oficiales para implementarla correctamente. El problema concreto que tengo es que al intercambiar el c�digo de autorizaci�n por un access_token recibo siempre el error "IncompleteSignature" (la firma no cumple los est�ndares de la plataforma). Tengo un c�digo de autorizaci�n real obtenido del flujo OAuth en el navegador; el fallo ocurre en el paso de token exchange.

CONTEXTO DE MI IMPLEMENTACI�N ACTUAL:

1) Flujo OAuth
   - URL de autorizaci�n: GET https://api-sg.aliexpress.com/oauth/authorize?response_type=code&client_id={app_key}&redirect_uri={redirect_uri}
   - Tras autorizar, AliExpress redirige a mi callback con ?code=... (el c�digo es real y lo recibo bien).
   - Intercambio de c�digo por token: GET https://api-sg.aliexpress.com/rest/auth/token/create con query params: app_key, code, sign_method, timestamp, redirect_uri, sign. Uso timestamp en milisegundos (Date.now()).

2) Firma que estoy usando (seg�n doc "Case 2: System Interfaces")
   - Base de la firma: api_path + concatenaci�n de par�metros ordenados alfab�ticamente (key1value1key2value2...), sin incluir "sign" ni app_secret en la base.
   - Para token: api_path = "/rest/auth/token/create". Par�metros para firmar: app_key, code, sign_method, timestamp (tambi�n prob� incluyendo redirect_uri).
   - Algoritmo: sign = hex(sha256(signature_base_string)). Prob� tanto may�sculas como min�sculas en el hex.
   - Orden de los par�metros en la URL: no necesariamente alfab�tico; sign va al final.

3) Affiliate API (para despu�s del token)
   - Endpoint: POST https://api-sg.aliexpress.com/sync con method=aliexpress.affiliate.product.query (u otros m�todos affiliate).
   - Misma idea de firma Case 2 con api_path tipo "/aliexpress/affiliate/product/query" y par�metros ordenados.

LO QUE NECESITO QUE INVESTIGUES Y ME RESPONDAS:

A) Token exchange (GET /rest/auth/token/create)
   - Enlace a la documentaci�n oficial actual de AliExpress Open Platform que describe exactamente c�mo se debe firmar esta petici�n (nombre del documento, secci�n, si es "Case 2" u otro caso).
   - Lista exacta de par�metros que deben formar parte de la base de la firma (?redirect_uri entra o no? ?solo app_key, code, sign_method, timestamp?).
   - Formato exacto del timestamp: milisegundos, segundos, o fecha en formato concreto (ej. ISO, GMT+8).
   - F�rmula exacta de la firma: qu� string se construye (orden de concatenaci�n, si el path es /auth/token/create o /rest/auth/token/create, si hay prefijo/sufijo con app_secret, HMAC o SHA256 puro).
   - Formato del valor "sign": hex en may�sculas, min�sculas, o base64.
   - Si existe un SDK oficial (Node.js/JavaScript o otro) que implemente este flujo y en qu� repositorio o documento se encuentra.

B) Affiliate API (product query y m�todos similares)
   - Documentaci�n oficial del m�todo aliexpress.affiliate.product.query (y en general de la Affiliate/Portals API): URL base, m�todo HTTP (POST/GET), par�metros obligatorios y opcionales.
   - C�mo se firma la petici�n para la API Affiliate: mismo esquema que el token (Case 2) o distinto; path exacto que se usa en la base de la firma (ej. /aliexpress/affiliate/product/query o ruta completa).
   - Orden recomendado de par�metros en el body o en la query seg�n la documentaci�n.

C) Errores frecuentes
   - Qu� suele causar "IncompleteSignature" en la pr�ctica (par�metros faltantes o sobrantes en la firma, encoding incorrecto, orden equivocado, formato de timestamp, etc.).
   - Si hay diferencias entre el entorno de pruebas (sandbox) y producci�n en cuanto a URLs o firma.

D) Salida que espero de ti
   - Un resumen paso a paso (checklist) para implementar correctamente: (1) intercambio de c�digo por token y (2) llamada a aliexpress.affiliate.product.query.
   - Para cada paso: f�rmula exacta de la firma en pseudoc�digo o en una sola frase inequ�voca (ej. "sign = toUpperCase(hex(sha256(api_path + sorted_key_value_concat)))").
   - Si conoces ejemplos de c�digo oficial (en cualquier lenguaje) que muestren la firma para token/create o para la Affiliate API, ind�calos o descr�belos.

Responde en espa?ol. Prioriza documentaci�n oficial de Alibaba/AliExpress (developer.alibaba.com, open.aliexpress.com o equivalentes) y especificaciones actuales; si algo ha cambiado en fechas recientes, menci�nalo. El objetivo es que con tu respuesta pueda corregir mi implementaci�n sin tener que volver a preguntar a soporte de AliExpress.
```

---

## Uso

1. Abre ChatGPT.
2. Copia **solo el contenido del bloque** (desde ?Necesito que investigues? hasta ?sin tener que volver a preguntar a soporte de AliExpress.?).
3. P�galo en el chat y env�a.
4. Con la respuesta, podr�s contrastar tu c�digo en:
   - `backend/src/services/aliexpress-signature.service.ts`
   - `backend/src/services/aliexpress-oauth.service.ts`
   - `backend/src/services/aliexpress-affiliate-api.service.ts`

Si ChatGPT te devuelve f�rmulas concretas o enlaces, an�talos y apl�calos en esos archivos; si hace falta, puedo ayudarte a traducir esas instrucciones en cambios concretos de c�digo.
