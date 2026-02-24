#!/usr/bin/env tsx
/**
 * Script maestro: ejecuta en orden
 * 1. verify-paypal-credentials.ts
 * 2. setup-paypal-sandbox-test-users.ts
 * 3. test-final-real-payout.ts
 * Termina con SYSTEM_FULLY_OPERATIONAL solo si todo pasa.
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
import { spawn } from 'child_process';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

const scriptsDir = path.join(process.cwd(), 'scripts');

function runScript(scriptName: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', path.join(scriptsDir, scriptName)], {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true,
      env: { ...process.env },
    });
    child.on('close', (code, signal) => {
      resolve(code ?? (signal ? 1 : 0));
    });
    child.on('error', () => resolve(1));
  });
}

async function main(): Promise<number> {
  console.log('[VERIFICATION] 0. Extraer credenciales desde APIS2.txt');
  const code0 = await runScript('extract-paypal-from-apis2.ts');
  if (code0 !== 0) {
    console.error('[VERIFICATION] extract-paypal-from-apis2 falló (¿existe APIS2.txt en raíz o backend?).');
    return 1;
  }
  console.log('[VERIFICATION] 1. Verificar credenciales PayPal');
  const code1 = await runScript('verify-paypal-credentials.ts');
  if (code1 !== 0) {
    console.error('[VERIFICATION] verify-paypal-credentials falló.');
    return 1;
  }

  console.log('[VERIFICATION] 2. Configurar cuentas Sandbox (admin + user email)');
  let code2 = await runScript('setup-paypal-sandbox-test-users.ts');
  if (code2 !== 0) {
    console.log('[VERIFICATION] setup-paypal-sandbox-test-users requiere PAYPAL_ADMIN_EMAIL y PAYPAL_USER_EMAIL. Intentando setup-payout-config...');
    code2 = await runScript('setup-payout-config.ts');
  }
  if (code2 !== 0) {
    console.error('[VERIFICATION] Configuración de emails Sandbox falló.');
    return 1;
  }

  console.log('[VERIFICATION] 3. Prueba final payout real');
  const code3 = await runScript('test-final-real-payout.ts');
  if (code3 !== 0) {
    console.error('[VERIFICATION] test-final-real-payout falló.');
    return 1;
  }

  console.log('SYSTEM_FULLY_OPERATIONAL');
  console.log('SYSTEM_FULLY_AUTOMATED_REVENUE_MODE = TRUE');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
