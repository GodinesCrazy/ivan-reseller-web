import fs from 'fs';
import path from 'path';
import os from 'os';

let chromium: any = null;
try {
  chromium = require('@sparticuz/chromium');
} catch {
  // @sparticuz/chromium no está disponible (normal en Windows)
}

const isWindows = os.platform() === 'win32';

const candidatePaths = [
  () => process.env.PUPPETEER_EXECUTABLE_PATH,
  () => process.env.CHROMIUM_PATH,
  () => process.env.GOOGLE_CHROME_SHIM,
  // Rutas para Windows
  ...(isWindows ? [
    () => path.join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe'),
    () => path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    () => path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ] : []),
  // Rutas para Linux
  ...(!isWindows ? [
    () => '/usr/bin/chromium',
    () => '/usr/bin/chromium-browser',
    () => '/usr/local/bin/chromium',
    () => '/usr/local/bin/chromium-browser',
    () => '/app/.chromium/chromium',
  ] : []),
];

function isExecutable(filePath: string | undefined): filePath is string {
  if (!filePath) return false;
  try {
    if (isWindows) {
      // En Windows, solo verificar que el archivo existe
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } else {
      // En Unix, verificar permisos de ejecución
      fs.accessSync(filePath, fs.constants.X_OK);
      const stats = fs.statSync(filePath);
      return stats.isFile();
    }
  } catch {
    return false;
  }
}

async function ensureChromiumFromPuppeteer(): Promise<string | null> {
  try {
    // Intentar usar Puppeteer directamente para obtener la ruta de Chromium
    const puppeteer = require('puppeteer');
    
    // ✅ En versiones recientes de Puppeteer, el browserFetcher fue removido
    // Intentar obtener la ruta directamente usando puppeteer.executablePath()
    try {
      if (typeof puppeteer.executablePath === 'function') {
        const execPath = puppeteer.executablePath();
        if (execPath && fs.existsSync(execPath)) {
          console.log(`✅ Chromium path from Puppeteer.executablePath(): ${execPath}`);
          return execPath;
        }
      }
    } catch (e) {
      // Continuar con browserFetcher si executablePath no está disponible
    }
    
    // ✅ Método legacy con browserFetcher (Puppeteer < 21)
    if (puppeteer.createBrowserFetcher) {
      const browserFetcher = puppeteer.createBrowserFetcher();
      const revision = process.env.PUPPETEER_CHROMIUM_REVISION || undefined;
      
      // Obtener información del Chromium descargado por Puppeteer
      const localRevisions = await browserFetcher.localRevisions();
      if (localRevisions.length > 0) {
        const revisionToUse = revision || localRevisions[localRevisions.length - 1];
        const revisionInfo = await browserFetcher.revisionInfo(revisionToUse);
        if (revisionInfo && revisionInfo.executablePath && fs.existsSync(revisionInfo.executablePath)) {
          return revisionInfo.executablePath;
        }
      }
      
      // Si no hay revisiones locales, intentar descargar una
      if (!revision && localRevisions.length === 0) {
        try {
          const revisions = await browserFetcher.revisionInfo();
          if (revisions && revisions.length > 0) {
            const latest = revisions[revisions.length - 1];
            const downloaded = await browserFetcher.download(latest.revision);
            if (downloaded && downloaded.executablePath && fs.existsSync(downloaded.executablePath)) {
              return downloaded.executablePath;
            }
          }
        } catch (downloadError: any) {
          console.warn('⚠️  Chromium download failed (may need manual install):', downloadError?.message);
        }
      }
    }
  } catch (error: any) {
    console.warn('⚠️  Puppeteer Chromium resolution failed:', error?.message || error);
  }
  return null;
}

async function ensureChromiumFromSparticuz(): Promise<string | null> {
  if (!chromium) return null;
  
  try {
    // ✅ MODIFICADO: Forzar descarga si no está disponible
    // @sparticuz/chromium descarga automáticamente si no está presente
    let executablePath: string | null = null;
    
    try {
      // Intentar obtener el ejecutable (esto debería descargarlo automáticamente si no existe)
      executablePath = await chromium.executablePath();
      
      // ✅ Verificar que el archivo realmente existe
      if (executablePath && fs.existsSync(executablePath)) {
        // Garantizar permisos de ejecución (por si se extrae en /tmp) - solo en Unix
        if (!isWindows) {
          try {
            fs.chmodSync(executablePath, 0o755);
          } catch {
            // Ignorar si no se puede cambiar permisos
          }
        }

        // ✅ Verificación adicional: intentar acceder al archivo directamente
        // IMPORTANTE: Verificar que el archivo existe Y es accesible JUSTO ANTES de retornarlo
        try {
          // Verificar que el archivo existe realmente (no solo que el path existe)
          if (!fs.existsSync(executablePath)) {
            console.warn(`⚠️  Sparticuz Chromium path retornado pero archivo no existe realmente: ${executablePath}`);
            console.warn(`⚠️  Esto puede ocurrir en Railway si @sparticuz/chromium no descargó el ejecutable correctamente`);
            return null;
          }
          
          // Verificar permisos de acceso
          fs.accessSync(executablePath, fs.constants.F_OK | (isWindows ? 0 : fs.constants.X_OK));
          
          // Verificar que es un archivo (no directorio)
          const stats = fs.statSync(executablePath);
          if (!stats.isFile()) {
            console.warn(`⚠️  Sparticuz Chromium path no es un archivo: ${executablePath}`);
            return null;
          }
          
          // Verificar que es ejecutable
          if (isExecutable(executablePath)) {
            console.log(`✅ Chromium de Sparticuz verificado y ejecutable: ${executablePath}`);
            return executablePath;
          } else {
            // Intentar dar permisos de ejecución
            try {
              if (!isWindows) {
                fs.chmodSync(executablePath, 0o755);
                if (isExecutable(executablePath)) {
                  console.log(`✅ Chromium de Sparticuz verificado (permisos otorgados): ${executablePath}`);
                  return executablePath;
                }
              }
            } catch (chmodError) {
              // Ignorar si no se pueden otorgar permisos
            }
            console.warn(`⚠️  Sparticuz Chromium existe pero no es ejecutable: ${executablePath}`);
            return null;
          }
        } catch (accessError) {
          // El archivo no es accesible o no existe realmente
          console.warn(`⚠️  Sparticuz Chromium path no es accesible: ${executablePath}`, (accessError as Error).message);
          console.warn(`⚠️  Esto puede ocurrir si el archivo fue eliminado o nunca se descargó correctamente`);
          return null;
        }
      } else if (executablePath) {
        // El path existe pero el archivo no está descargado aún
        console.warn(`⚠️  Sparticuz Chromium path retornado pero archivo no existe: ${executablePath}`);
        console.warn(`⚠️  Intentando descargar Chromium de Sparticuz...`);
        
        // Intentar forzar descarga (esto puede tardar varios minutos)
        // Pero no esperamos aquí, mejor usar Puppeteer directamente
        return null;
      }
    } catch (execPathError: any) {
      console.warn('⚠️  Error obteniendo executablePath de Sparticuz:', execPathError?.message);
      // Continuar con Puppeteer como fallback
      return null;
    }

    // Algunas distros extraen el binario dentro de un directorio llamado "chromium" sin extensión
    if (executablePath) {
      const altPath = path.join(path.dirname(executablePath), 'chromium');
      if (fs.existsSync(altPath) && isExecutable(altPath)) {
        return altPath;
      }
    }
  } catch (error) {
    console.warn('⚠️  Sparticuz chromium download failed:', (error as Error).message);
  }
  return null;
}

export async function resolveChromiumExecutable(): Promise<string | null> {
  // ✅ MODIFICADO: Retornar null en lugar de lanzar error para permitir que Puppeteer use su propio Chromium
  // ✅ Detectar si estamos en Railway o entorno serverless similar
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID;
  const isHeroku = process.env.HEROKU_APP_ID;
  const isServerless = isRailway || isHeroku || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
  
  if (isServerless) {
    console.log('🌐 Entorno serverless detectado, priorizando Sparticuz Chromium...');
    
    // ✅ En entornos serverless, priorizar Sparticuz (optimizado para contenedores)
    const sparticuzPath = await ensureChromiumFromSparticuz();
    if (sparticuzPath && fs.existsSync(sparticuzPath)) {
      process.env.PUPPETEER_EXECUTABLE_PATH = sparticuzPath;
      process.env.CHROMIUM_PATH = sparticuzPath;
      console.log(`✅ Chromium obtenido de Sparticuz (serverless): ${sparticuzPath}`);
      return sparticuzPath;
    }
    
    console.warn('⚠️  Sparticuz Chromium no disponible, intentando Puppeteer...');
    
    // ✅ Si Sparticuz falla, intentar descargar Chromium de Puppeteer
    const puppeteerPath = await ensureChromiumFromPuppeteer();
    if (puppeteerPath && fs.existsSync(puppeteerPath)) {
      process.env.PUPPETEER_EXECUTABLE_PATH = puppeteerPath;
      process.env.CHROMIUM_PATH = puppeteerPath;
      console.log(`✅ Chromium obtenido de Puppeteer (serverless): ${puppeteerPath}`);
      return puppeteerPath;
    }
    
    // ✅ Si ambos fallan, retornar null para que Puppeteer use su propio Chromium (descargará automáticamente)
    console.warn('⚠️  No se encontró Chromium preinstalado, Puppeteer usará su propio Chromium (puede tardar en descargar)');
    return null;
  } else {
    // ✅ En entornos normales, primero intentar rutas del sistema
    for (const getter of candidatePaths) {
      const candidate = getter();
      if (isExecutable(candidate)) {
        console.log(`✅ Chromium encontrado en: ${candidate}`);
        return candidate!;
      }
    }
  }

  // ✅ Intentar con Puppeteer (puede descargar Chromium automáticamente)
  const puppeteerPath = await ensureChromiumFromPuppeteer();
  if (puppeteerPath && fs.existsSync(puppeteerPath)) {
    process.env.PUPPETEER_EXECUTABLE_PATH = puppeteerPath;
    process.env.CHROMIUM_PATH = puppeteerPath;
    console.log(`✅ Chromium obtenido de Puppeteer: ${puppeteerPath}`);
    return puppeteerPath;
  }

  // ✅ Fallback: Sparticuz (útil en AWS Lambda y Railway)
  const sparticuzPath = await ensureChromiumFromSparticuz();
  if (sparticuzPath && fs.existsSync(sparticuzPath)) {
    process.env.PUPPETEER_EXECUTABLE_PATH = sparticuzPath;
    process.env.CHROMIUM_PATH = sparticuzPath;
    console.log(`✅ Chromium obtenido de Sparticuz: ${sparticuzPath}`);
    return sparticuzPath;
  }

  // ✅ Si nada funciona, retornar null para que Puppeteer use su propio Chromium
  console.warn('⚠️  No se encontró Chromium en rutas del sistema, Puppeteer usará su propio Chromium');
  return null;
}

export async function getChromiumLaunchConfig(extraArgs: string[] = []) {
  const executablePath = await resolveChromiumExecutable();
  
  // ✅ Si no hay executablePath, Puppeteer usará su propio Chromium
  // En ese caso, NO incluir chromium.args ya que pueden no ser compatibles
  const args = executablePath && chromium?.args
    ? Array.from(new Set([...(chromium.args || []), ...extraArgs, '--no-sandbox']))
    : Array.from(new Set([...extraArgs, '--no-sandbox']));

  return {
    executablePath: executablePath || undefined, // undefined = usar Chromium de Puppeteer
    args,
    headless: true,
    defaultViewport: executablePath && chromium?.defaultViewport ? chromium.defaultViewport : { width: 1920, height: 1080 },
  };
}

