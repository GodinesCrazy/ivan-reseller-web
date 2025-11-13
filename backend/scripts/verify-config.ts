#!/usr/bin/env tsx
/**
 * Script de verificación de configuración
 * Verifica que todas las variables de entorno necesarias estén configuradas
 */

import { env } from '../src/config/env';
import { prisma } from '../src/config/database';
import { redis, isRedisAvailable } from '../src/config/redis';

interface CheckResult {
  name: string;
  status: 'ok' | 'error' | 'warning';
  message: string;
}

const checks: CheckResult[] = [];

// Verificar DATABASE_URL
checks.push({
  name: 'DATABASE_URL',
  status: env.DATABASE_URL ? 'ok' : 'error',
  message: env.DATABASE_URL 
    ? `✅ Configurada (${env.DATABASE_URL.substring(0, 30)}...)`
    : '❌ No configurada'
});

// Verificar REDIS_URL
checks.push({
  name: 'REDIS_URL',
  status: process.env.REDIS_URL ? 'ok' : 'warning',
  message: process.env.REDIS_URL
    ? `✅ Configurada`
    : '⚠️ No configurada (sistema funcionará sin Redis)'
});

// Verificar JWT_SECRET
checks.push({
  name: 'JWT_SECRET',
  status: env.JWT_SECRET && env.JWT_SECRET.length >= 32 ? 'ok' : 'error',
  message: env.JWT_SECRET && env.JWT_SECRET.length >= 32
    ? `✅ Configurado (${env.JWT_SECRET.length} caracteres)`
    : `❌ No configurado o muy corto (mínimo 32 caracteres)`
});

// Verificar conexión a base de datos
async function checkDatabase() {
  try {
    await prisma.$connect();
    const userCount = await prisma.user.count();
    
    // Verificar que el campo plan existe
    const sampleUser = await prisma.user.findFirst({
      select: { id: true, plan: true }
    });
    
    const hasPlanField = sampleUser !== null;
    
    checks.push({
      name: 'Database Connection',
      status: 'ok',
      message: `✅ Conectada (${userCount} usuarios)`
    });
    
    checks.push({
      name: 'Campo plan en User',
      status: hasPlanField ? 'ok' : 'warning',
      message: hasPlanField
        ? '✅ Campo plan existe en la tabla users'
        : '⚠️ Campo plan no encontrado - ejecuta migración'
    });
    
    await prisma.$disconnect();
  } catch (error: any) {
    checks.push({
      name: 'Database Connection',
      status: 'error',
      message: `❌ Error: ${error.message}`
    });
  }
}

// Verificar conexión a Redis
async function checkRedis() {
  if (!isRedisAvailable) {
    checks.push({
      name: 'Redis Connection',
      status: 'warning',
      message: '⚠️ Redis no disponible (sistema funcionará sin cache distribuido)'
    });
    return;
  }
  
  try {
    await redis.ping();
    checks.push({
      name: 'Redis Connection',
      status: 'ok',
      message: '✅ Conectado'
    });
  } catch (error: any) {
    checks.push({
      name: 'Redis Connection',
      status: 'error',
      message: `❌ Error: ${error.message}`
    });
  }
}

// Ejecutar verificaciones
async function runChecks() {
  console.log('🔍 Verificando configuración del sistema...\n');
  
  await checkDatabase();
  await checkRedis();
  
  // Mostrar resultados
  console.log('📊 Resultados:\n');
  
  let hasErrors = false;
  let hasWarnings = false;
  
  checks.forEach(check => {
    const icon = check.status === 'ok' ? '✅' : check.status === 'error' ? '❌' : '⚠️';
    const color = check.status === 'ok' ? '\x1b[32m' : check.status === 'error' ? '\x1b[31m' : '\x1b[33m';
    console.log(`${color}${icon} ${check.name}: ${check.message}\x1b[0m`);
    
    if (check.status === 'error') hasErrors = true;
    if (check.status === 'warning') hasWarnings = true;
  });
  
  console.log('\n');
  
  if (hasErrors) {
    console.log('❌ Hay errores críticos que deben resolverse');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('⚠️ Hay advertencias, pero el sistema puede funcionar');
    process.exit(0);
  } else {
    console.log('✅ Todas las verificaciones pasaron');
    process.exit(0);
  }
}

runChecks().catch(error => {
  console.error('❌ Error ejecutando verificaciones:', error);
  process.exit(1);
});

