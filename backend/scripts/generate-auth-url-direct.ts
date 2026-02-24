#!/usr/bin/env tsx
/**
 * Generate AliExpress OAuth Authorization URL directly
 * Uses AppKey from image: 524880
 */

const APP_KEY = '524880';
const REDIRECT_URI = 'https://ivan-reseller-backend-production.up.railway.app/api/aliexpress/callback';
const OAUTH_BASE = 'https://api-sg.aliexpress.com/oauth';

const authUrl = `${OAUTH_BASE}/authorize?response_type=code&client_id=${APP_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

console.log('========================================================');
console.log('ALIEXPRESS OAUTH AUTHORIZATION URL');
console.log('========================================================\n');
console.log('?? INFORMACIÓN DE LA APP:');
console.log('----------------------------------------');
console.log('App Name: IvanReseller Affiliate API');
console.log('AppKey: 524880');
console.log('Callback URL:', REDIRECT_URI);
console.log('Tracking ID: ivanreseller');
console.log('');
console.log('?? PASOS PARA OBTENER EL CÓDIGO:');
console.log('----------------------------------------');
console.log('1. Abre la URL de abajo en tu navegador');
console.log('2. Inicia sesión en AliExpress si es necesario');
console.log('3. Autoriza la aplicación');
console.log('4. Serás redirigido a una URL como esta:');
console.log(`   ${REDIRECT_URI}?code=TU_CODIGO_AQUI`);
console.log('5. Copia el valor del parámetro "code" de la URL');
console.log('6. Ejecuta: npx tsx scripts/test-aliexpress-full-flow.ts TU_CODIGO_AQUI\n');
console.log('?? URL DE AUTORIZACIÓN:');
console.log('----------------------------------------');
console.log(authUrl);
console.log('----------------------------------------\n');
console.log('?? IMPORTANTE:');
console.log('   - Necesitas tener el App Secret configurado en .env.local');
console.log('   - El App Secret se obtiene haciendo clic en "View" en la consola de AliExpress');
console.log('   - Una vez que tengas el código, el script de test hará todo automáticamente\n');
