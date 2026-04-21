#!/usr/bin/env ts-node
/**
 * CJ -> Shopify USA - Buyer Flow Validation
 * Verifica el estado exacto del storefront password gate y la PDP buyer-facing
 *
 * Uso: npx ts-node scripts/cj-shopify-usa-buyer-flow-validation.ts
 */

import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const PRODUCT_HANDLE = 'neck-pillow-travel-pillow-cjjjjfzt00492-pink';
const SHOPIFY_STORE = 'ivanreseller-2.myshopify.com';
const BASE_URL = process.env.CJ_SHOPIFY_USA_VALIDATION_BASE_URL ||
  process.env.API_URL ||
  'https://ivan-reseller-backend-production.up.railway.app';

interface ValidationResult {
  timestamp: string;
  storefrontCheck: {
    storeDomain: string;
    productHandle: string;
    storefrontUrl: string;
    status: number | null;
    finalUrl: string | null;
    passwordGate: boolean;
    markers: string[];
    htmlSnippet: string;
    error?: string;
  };
  checkoutCheck: {
    canAccessCheckout: boolean;
    addToCartUrl: string;
    status: number | null;
    error?: string;
  };
  recommendations: {
    storefrontGateLiftable: boolean;
    manualActionRequired: boolean;
    actionDescription: string;
  };
}

async function checkStorefrontAccess(): Promise<ValidationResult['storefrontCheck']> {
  const storefrontUrl = `https://${SHOPIFY_STORE}/products/${PRODUCT_HANDLE}`;

  try {
    const response = await fetch(storefrontUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = await response.text();
    const finalUrl = response.url;

    const markers = [
      'Enter store using password',
      '/password',
      'Opening soon',
      'store using password',
      'password',
      'coming soon',
      'not open to the public'
    ].filter((marker) =>
      html.toLowerCase().includes(marker.toLowerCase()) ||
      finalUrl.toLowerCase().includes(marker.toLowerCase())
    );

    const passwordGate = finalUrl.includes('/password') ||
      html.includes('Enter store using password') ||
      html.includes('Opening soon');

    return {
      storeDomain: SHOPIFY_STORE,
      productHandle: PRODUCT_HANDLE,
      storefrontUrl,
      status: response.status,
      finalUrl,
      passwordGate,
      markers,
      htmlSnippet: html.replace(/\s+/g, ' ').slice(0, 400)
    };
  } catch (error) {
    return {
      storeDomain: SHOPIFY_STORE,
      productHandle: PRODUCT_HANDLE,
      storefrontUrl,
      status: null,
      finalUrl: null,
      passwordGate: true,
      markers: ['FETCH_ERROR'],
      htmlSnippet: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function checkCheckoutAccess(): Promise<ValidationResult['checkoutCheck']> {
  // Intentar acceder al carrito directamente
  const cartUrl = `https://${SHOPIFY_STORE}/cart`;

  try {
    const response = await fetch(cartUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = await response.text();
    const finalUrl = response.url;

    const canAccess = !finalUrl.includes('/password') &&
      !html.includes('Enter store using password') &&
      response.status === 200;

    return {
      canAccessCheckout: canAccess,
      addToCartUrl: `https://${SHOPIFY_STORE}/cart/add?id=${PRODUCT_HANDLE}&quantity=1`,
      status: response.status
    };
  } catch (error) {
    return {
      canAccessCheckout: false,
      addToCartUrl: `https://${SHOPIFY_STORE}/cart/add?id=${PRODUCT_HANDLE}&quantity=1`,
      status: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function determineRecommendations(
  storefront: ValidationResult['storefrontCheck'],
  checkout: ValidationResult['checkoutCheck']
): ValidationResult['recommendations'] {
  const isBlocked = storefront.passwordGate;

  if (isBlocked) {
    return {
      storefrontGateLiftable: false, // No se puede levantar vía API sin scope especial
      manualActionRequired: true,
      actionDescription: `
El password gate del storefront está ACTIVO y requiere acción manual en Shopify Admin.

PASO MANUAL REQUERIDO:
1. Acceder a: https://${SHOPIFY_STORE}/admin
2. Navegar a: Online Store > Preferences
3. En sección "Password protection", desmarcar "Enable password"
4. Guardar cambios

ALTERNATIVA (via Shopify CLI si está configurado):
shopify store:disable-password --store=${SHOPIFY_STORE}

EVIDENCIA DEL BLOQUEO:
- URL verificada: ${storefront.storefrontUrl}
- URL final: ${storefront.finalUrl}
- Status HTTP: ${storefront.status}
- Marcadores encontrados: ${storefront.markers.join(', ') || 'Ninguno'}
      `.trim()
    };
  }

  return {
    storefrontGateLiftable: true,
    manualActionRequired: false,
    actionDescription: 'Storefront ya está público y accesible. El password gate está DESACTIVADO.'
  };
}

async function main() {
  console.log('[BUYER FLOW VALIDATION] Iniciando verificación...\n');

  const timestamp = new Date().toISOString();

  console.log('1. Verificando acceso al storefront...');
  const storefrontCheck = await checkStorefrontAccess();

  console.log(`   URL: ${storefrontCheck.storefrontUrl}`);
  console.log(`   Status: ${storefrontCheck.status}`);
  console.log(`   Final URL: ${storefrontCheck.finalUrl}`);
  console.log(`   Password Gate: ${storefrontCheck.passwordGate ? 'ACTIVO' : 'INACTIVO'}`);
  console.log(`   Marcadores: ${storefrontCheck.markers.join(', ') || 'Ninguno'}`);

  console.log('\n2. Verificando acceso al checkout...');
  const checkoutCheck = await checkCheckoutAccess();
  console.log(`   Checkout accesible: ${checkoutCheck.canAccessCheckout ? 'SÍ' : 'NO'}`);
  console.log(`   Status: ${checkoutCheck.status}`);

  console.log('\n3. Determinando recomendaciones...');
  const recommendations = determineRecommendations(storefrontCheck, checkoutCheck);
  console.log(`   Requiere acción manual: ${recommendations.manualActionRequired ? 'SÍ' : 'NO'}`);
  console.log(`   Descripción: ${recommendations.actionDescription}`);

  const result: ValidationResult = {
    timestamp,
    storefrontCheck,
    checkoutCheck,
    recommendations
  };

  const outputPath = path.resolve(
    process.cwd(),
    'cj-shopify-usa-buyer-flow-validation-result.json'
  );

  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`\n✅ Resultado guardado en: ${outputPath}`);

  // Reporte final
  console.log('\n' + '='.repeat(70));
  console.log('REPORTE FINAL - BUYER FLOW VALIDATION');
  console.log('='.repeat(70));
  console.log(`Producto: Neck Pillow Travel Pillow`);
  console.log(`Handle: ${PRODUCT_HANDLE}`);
  console.log(`Store: ${SHOPIFY_STORE}`);
  console.log(`Timestamp: ${timestamp}`);
  console.log('-'.repeat(70));
  console.log(`ESTADO DEL STOREFRONT: ${storefrontCheck.passwordGate ? '🔒 BLOQUEADO' : '🔓 PÚBLICO'}`);
  console.log(`PDP ACCESIBLE: ${!storefrontCheck.passwordGate ? '✅ SÍ' : '❌ NO'}`);
  console.log(`CHECKOUT ACCESIBLE: ${checkoutCheck.canAccessCheckout ? '✅ SÍ' : '❌ NO'}`);
  console.log('-'.repeat(70));
  console.log('SIGUIENTE PASO:');
  console.log(recommendations.manualActionRequired
    ? '⚠️  Requiere acción manual en Shopify Admin para levantar el password gate'
    : '✅ Storefront listo para órdenes de prueba');
  console.log('='.repeat(70));

  process.exit(storefrontCheck.passwordGate ? 1 : 0);
}

void main().catch(async (error) => {
  console.error('[BUYER FLOW VALIDATION] Error:', error);
  process.exit(1);
});
