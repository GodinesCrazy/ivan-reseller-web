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

async function ensureChromiumFromPuppeteer(): Promise<string | undefined> {
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
  return undefined;
}

async function ensureChromiumFromSparticuz(): Promise<string | undefined> {
  if (!chromium) return undefined;
  
  try {
    // ✅ RESTAURADO: Lógica simple que funcionaba antes
    // @sparticuz/chromium descarga automáticamente si no está presente
    const executablePath = await chromium.executablePath();
    if (!executablePath) {
      return undefined;
    }

    // Garantizar permisos de ejecución (por si se extrae en /tmp) - solo en Unix
    if (!isWindows) {
      try {
        fs.chmodSync(executablePath, 0o755);
      } catch {
        // Ignorar si no se puede cambiar permisos
      }
    }

    if (isExecutable(executablePath)) {
      return executablePath;
    }

    // Algunas distros extraen el binario dentro de un directorio llamado "chromium" sin extensión
    const altPath = path.join(path.dirname(executablePath), 'chromium');
    if (isExecutable(altPath)) {
      return altPath;
    }
  } catch (error) {
    console.warn('⚠️  Sparticuz chromium download failed:', (error as Error).message);
  }
  return undefined;
}

export async function resolveChromiumExecutable(): Promise<string | undefined> {
  // ✅ RESTAURADO: Lógica simple que funcionaba antes
  // Detectar si estamos en Railway o entorno serverless similar
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID;
  const isHeroku = process.env.HEROKU_APP_ID;
  const isServerless = isRailway || isHeroku || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
  
  if (isServerless) {
    console.log('🌐 Entorno serverless detectado, priorizando Sparticuz Chromium...');
    
    // ✅ En entornos serverless, priorizar Sparticuz (optimizado para contenedores)
    const sparticuzPath = await ensureChromiumFromSparticuz();
    if (sparticuzPath && isExecutable(sparticuzPath)) {
      process.env.PUPPETEER_EXECUTABLE_PATH = sparticuzPath;
      process.env.CHROMIUM_PATH = sparticuzPath;
      console.log(`✅ Chromium obtenido de Sparticuz (serverless): ${sparticuzPath}`);
      return sparticuzPath;
    }
    
    // ✅ Si Sparticuz falla o no es ejecutable, intentar chromium del sistema (Railway/Nixpacks)
    // Railway/Nixpacks instala chromium y lo enlaza a /app/.chromium/chromium
    for (const getter of candidatePaths) {
      const candidate = getter();
      if (candidate && isExecutable(candidate)) {
        process.env.PUPPETEER_EXECUTABLE_PATH = candidate;
        process.env.CHROMIUM_PATH = candidate;
        console.log(`✅ Chromium encontrado del sistema (serverless): ${candidate}`);
        return candidate;
      }
    }
    
    // ✅ Si no se encuentra chromium del sistema, intentar descargar Chromium de Puppeteer
    const puppeteerPath = await ensureChromiumFromPuppeteer();
    if (puppeteerPath) {
      process.env.PUPPETEER_EXECUTABLE_PATH = puppeteerPath;
      process.env.CHROMIUM_PATH = puppeteerPath;
      console.log(`✅ Chromium obtenido de Puppeteer (serverless): ${puppeteerPath}`);
      return puppeteerPath;
    }
    
    // ✅ Si ambos fallan, retornar undefined para que Puppeteer use su propio Chromium
    console.warn('⚠️  No se encontró Chromium preinstalado, Puppeteer usará su propio Chromium');
    return undefined;
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
  if (puppeteerPath) {
    process.env.PUPPETEER_EXECUTABLE_PATH = puppeteerPath;
    process.env.CHROMIUM_PATH = puppeteerPath;
    console.log(`✅ Chromium obtenido de Puppeteer: ${puppeteerPath}`);
    return puppeteerPath;
  }

  // ✅ Fallback: Sparticuz (útil en AWS Lambda y Railway)
  const sparticuzPath = await ensureChromiumFromSparticuz();
  if (sparticuzPath) {
    process.env.PUPPETEER_EXECUTABLE_PATH = sparticuzPath;
    process.env.CHROMIUM_PATH = sparticuzPath;
    console.log(`✅ Chromium obtenido de Sparticuz: ${sparticuzPath}`);
    return sparticuzPath;
  }

  // ✅ Si nada funciona, retornar undefined para que Puppeteer use su propio Chromium
  console.warn('⚠️  No se encontró Chromium en rutas del sistema, Puppeteer usará su propio Chromium');
  return undefined;
}

export async function getChromiumLaunchConfig(extraArgs: string[] = []) {
  const executablePath = await resolveChromiumExecutable();
  // ✅ RESTAURADO: Lógica simple que funcionaba antes
  // Si executablePath es undefined, Puppeteer usará su propio Chromium automáticamente
  const args = executablePath && chromium?.args
    ? Array.from(new Set([...(chromium.args || []), ...extraArgs, '--no-sandbox']))
    : Array.from(new Set([...extraArgs, '--no-sandbox']));

  return {
    executablePath: executablePath, // undefined = usar Chromium de Puppeteer automáticamente
    args,
    headless: true,
    defaultViewport: executablePath && chromium?.defaultViewport ? chromium.defaultViewport : { width: 1920, height: 1080 },
  };
}

