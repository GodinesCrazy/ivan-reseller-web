import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Debug: Mostrar información sobre DATABASE_URL antes de validar
function getDatabaseUrl(): string {
  // Intentar múltiples nombres de variables comunes en Railway
  // Railway puede usar diferentes nombres según la configuración
  const possibleNames = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'DATABASE_PRISMA_URL',
    'PGDATABASE',
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_URL_POOLING',
  ];

  let dbUrl = '';
  let foundName = '';

  for (const name of possibleNames) {
    if (process.env[name]) {
      dbUrl = process.env[name];
      foundName = name;
      break;
    }
  }

  // Si no encontramos ninguna, buscar variables que contengan "DATABASE" o "POSTGRES"
  if (!dbUrl) {
    const dbRelatedVars = Object.keys(process.env).filter(
      k => (k.includes('DATABASE') || k.includes('POSTGRES')) && 
           process.env[k]?.startsWith('postgres')
    );
    
    if (dbRelatedVars.length > 0) {
      console.log(`⚠️  DATABASE_URL no encontrada, pero se encontraron variables relacionadas: ${dbRelatedVars.join(', ')}`);
      // Intentar usar la primera que parezca válida
      for (const varName of dbRelatedVars) {
        const value = process.env[varName];
        if (value && (value.startsWith('postgresql://') || value.startsWith('postgres://'))) {
          dbUrl = value;
          foundName = varName;
          console.log(`   → Usando ${varName} como DATABASE_URL`);
          break;
        }
      }
    }
  }

  if (dbUrl) {
    // Verificar si es una referencia de Railway sin resolver
    if (dbUrl.startsWith('{{') && dbUrl.endsWith('}}')) {
      console.error('❌ ERROR: Variable Reference no resuelta por Railway');
      console.error(`   Valor recibido: ${dbUrl}`);
      console.error('   Railway debería resolver automáticamente las referencias {{Service.Variable}}');
      console.error('   Solución: Copia el valor real de la variable en lugar de usar la referencia');
      console.error('');
      return ''; // Retornar vacío para que el código muestre el error apropiado
    }
    
    try {
      // Verificar si la URL está incompleta o mal formada
      if (dbUrl.includes('://:@') || dbUrl.endsWith('://') || dbUrl === 'postgresql://' || dbUrl === 'postgres://') {
        console.error('❌ ERROR: DATABASE_URL está incompleta o mal formada');
        console.error(`   Valor recibido: ${dbUrl}`);
        console.error('   La URL debe tener el formato completo:');
        console.error('   postgresql://usuario:contraseña@host:puerto/base_de_datos');
        console.error('');
        console.error('🔧 SOLUCIÓN:');
        console.error('   1. Ve a Railway Dashboard → Postgres → Variables');
        console.error('   2. Busca DATABASE_PUBLIC_URL');
        console.error('   3. Click en el ojo 👁️ para VER el valor completo');
        console.error('   4. Click en copiar 📋 para copiar TODO el valor');
        console.error('   5. Ve a ivan-reseller-web → Variables → DATABASE_URL');
        console.error('   6. Pega el valor completo (debe empezar con postgresql://)');
        console.error('');
        return '';
      }
      
      // Mostrar información de debugging (sin mostrar la contraseña completa)
      const url = new URL(dbUrl);
      
      // Verificar que tenga los componentes necesarios
      if (!url.hostname || !url.username || !url.pathname) {
        console.error('❌ ERROR: DATABASE_URL está incompleta');
        console.error(`   Hostname: ${url.hostname || 'FALTA'}`);
        console.error(`   Username: ${url.username || 'FALTA'}`);
        console.error(`   Database: ${url.pathname || 'FALTA'}`);
        console.error('   La URL debe tener host, usuario y base de datos');
        return '';
      }
      
      const maskedPassword = url.password ? 
        (url.password.substring(0, 4) + '***' + url.password.substring(url.password.length - 4)) : 
        '***';
      const maskedUrl = `${url.protocol}//${url.username}:${maskedPassword}@${url.host}${url.pathname}`;
      
      console.log('🔍 DATABASE_URL encontrada:');
      console.log(`   Variable: ${foundName}`);
      console.log(`   ${maskedUrl}`);
      console.log(`   Host: ${url.hostname}`);
      console.log(`   Port: ${url.port || '5432'}`);
      console.log(`   Database: ${url.pathname.replace('/', '')}`);
      console.log(`   User: ${url.username}`);
    } catch (e) {
      console.error('⚠️  No se pudo parsear DATABASE_URL:', e);
      console.error(`   Valor recibido: ${dbUrl}`);
      console.error('');
      console.error('🔧 SOLUCIÓN:');
      console.error('   1. Ve a Railway Dashboard → Postgres → Variables');
      console.error('   2. Busca DATABASE_PUBLIC_URL');
      console.error('   3. Click en el ojo 👁️ para VER el valor completo');
      console.error('   4. Click en copiar 📋 para copiar TODO el valor');
      console.error('   5. Ve a ivan-reseller-web → Variables → DATABASE_URL');
      console.error('   6. Pega el valor completo (debe empezar con postgresql://)');
      console.error('');
    }
  } else {
    console.error('❌ ERROR: DATABASE_URL no encontrada');
    const allDbVars = Object.keys(process.env).filter(
      k => k.includes('DATABASE') || k.includes('POSTGRES') || k.includes('PG')
    );
    console.error(`   Variables relacionadas encontradas: ${allDbVars.length > 0 ? allDbVars.join(', ') : 'ninguna'}`);
  }

  return dbUrl;
}

const databaseUrl = getDatabaseUrl();

// Validación mejorada de DATABASE_URL con mejor mensaje de error
const databaseUrlSchema = z.string().min(1, 'DATABASE_URL no puede estar vacía')
  .url('DATABASE_URL debe ser una URL válida')
  .refine(
    (url) => url.startsWith('postgresql://') || url.startsWith('postgres://'),
    { 
      message: 'DATABASE_URL debe empezar con postgresql:// o postgres://',
    }
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  API_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: databaseUrlSchema,
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Optional external APIs
  EBAY_APP_ID: z.string().optional(),
  EBAY_DEV_ID: z.string().optional(),
  EBAY_CERT_ID: z.string().optional(),
  MERCADOLIBRE_CLIENT_ID: z.string().optional(),
  MERCADOLIBRE_CLIENT_SECRET: z.string().optional(),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  GROQ_API_KEY: z.string().optional(),
  SCRAPERAPI_KEY: z.string().optional(),
});

// Asegurar que DATABASE_URL esté en process.env
// Esto es crítico para que Prisma funcione correctamente
if (!process.env.DATABASE_URL && databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  console.log('✅ DATABASE_URL configurada desde variable alternativa');
}

// Validar DATABASE_URL antes de parsear todo el schema
if (process.env.DATABASE_URL) {
  const dbUrlValue = process.env.DATABASE_URL.trim();
  if (dbUrlValue.length === 0) {
    console.error('❌ ERROR: DATABASE_URL está vacía');
    console.error('   Ve a Railway Dashboard → ivan-reseller-web → Variables');
    console.error('   Verifica que DATABASE_URL tenga un valor válido');
    process.exit(1);
  }
  if (!dbUrlValue.startsWith('postgresql://') && !dbUrlValue.startsWith('postgres://')) {
    console.error('❌ ERROR: DATABASE_URL tiene formato inválido');
    console.error(`   Valor actual: ${dbUrlValue.substring(0, 50)}...`);
    console.error('   Debe empezar con: postgresql:// o postgres://');
    console.error('   Ve a Railway Dashboard → Postgres → Variables → DATABASE_URL');
    console.error('   Copia el valor completo y pégalo en ivan-reseller-web → Variables → DATABASE_URL');
    process.exit(1);
  }
} else {
  console.error('❌ ERROR: DATABASE_URL no está configurada');
  console.error('   Ve a Railway Dashboard → ivan-reseller-web → Variables');
  console.error('   Agrega DATABASE_URL con el valor de Postgres → Variables → DATABASE_URL');
  process.exit(1);
}

// Si aún no tenemos DATABASE_URL, el schema de Zod fallará con un mensaje claro
let env: z.infer<typeof envSchema>;
try {
  env = envSchema.parse(process.env);
} catch (error: any) {
  if (error.name === 'ZodError') {
    console.error('❌ ERROR DE VALIDACIÓN DE VARIABLES DE ENTORNO:');
    error.errors.forEach((err: any) => {
      console.error(`   - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export { env };
export default env;
