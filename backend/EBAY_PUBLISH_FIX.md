# Solución: Publicación eBay falla al ejecutar test localmente

## Problema

Cuando ejecutas `npm run test:search-to-publish` localmente y `DATABASE_URL` apunta a Railway:

- Las credenciales OAuth están encriptadas con `ENCRYPTION_KEY` de Railway
- Tu `.env.local` puede tener otra `ENCRYPTION_KEY`
- Resultado: "Falta token OAuth de eBay"

## Solución recomendada: Ejecutar en el servidor

Configura en `.env` o `.env.local`:

```env
API_URL=https://tu-backend.railway.app
INTERNAL_RUN_SECRET=<copia de Railway Variables>
```

Luego:

```bash
npm run test:search-to-publish
```

El script detectará que tienes `API_URL` e `INTERNAL_RUN_SECRET` y ejecutará el test en el servidor (donde la desencriptación funciona).

## Alternativa: Usar ENCRYPTION_KEY de Railway

Si quieres ejecutar el test localmente:

1. En Railway ? Variables, copia `ENCRYPTION_KEY`
2. En `backend/.env.local`, a?ade o actualiza: `ENCRYPTION_KEY=<valor de Railway>`

Así la desencriptación local usará la misma clave que Railway.

## Diagnóstico

```bash
npm run diagnose:ebay
```

Comprueba credenciales, environment y tokens.
