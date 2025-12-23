#!/usr/bin/env node

/**
 * Script de sincronización de documentación enterprise
 * Copia archivos MD desde docs/ a frontend/src/content/docs/
 * 
 * Ejecutar antes de build/dev para mantener la documentación sincronizada
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Archivos a sincronizar
const docsToSync = [
  'SETUP_LOCAL.md',
  'DEPLOYMENT_RAILWAY.md',
  'SECURITY.md',
  'TROUBLESHOOTING.md',
  'ARCHITECTURE.md',
  'USER_GUIDE.md',
  'ADMIN_GUIDE.md',
];

const sourceDir = join(rootDir, 'docs');
const targetDir = join(rootDir, 'frontend', 'src', 'content', 'docs');

// Crear directorio destino si no existe
if (!existsSync(targetDir)) {
  mkdirSync(targetDir, { recursive: true });
  console.log(`✅ Creado directorio: ${targetDir}`);
}

let synced = 0;
let errors = 0;

// Sincronizar cada archivo
for (const doc of docsToSync) {
  const sourcePath = join(sourceDir, doc);
  const targetPath = join(targetDir, doc);

  try {
    if (!existsSync(sourcePath)) {
      console.warn(`⚠️  Archivo fuente no encontrado: ${sourcePath}`);
      errors++;
      continue;
    }

    const content = readFileSync(sourcePath, 'utf-8');
    writeFileSync(targetPath, content, 'utf-8');
    console.log(`✅ Sincronizado: ${doc}`);
    synced++;
  } catch (error) {
    console.error(`❌ Error sincronizando ${doc}:`, error.message);
    errors++;
  }
}

console.log(`\n📊 Resumen: ${synced} archivos sincronizados, ${errors} errores`);
process.exit(errors > 0 ? 1 : 0);

