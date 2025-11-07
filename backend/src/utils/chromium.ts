import fs from 'fs';
import path from 'path';
import chromium from '@sparticuz/chromium';

const candidatePaths = [
  () => process.env.PUPPETEER_EXECUTABLE_PATH,
  () => process.env.CHROMIUM_PATH,
  () => process.env.GOOGLE_CHROME_SHIM,
  () => '/usr/bin/chromium',
  () => '/usr/bin/chromium-browser',
  () => '/usr/local/bin/chromium',
  () => '/usr/local/bin/chromium-browser',
  () => '/app/.chromium/chromium',
];

function isExecutable(filePath: string | undefined): filePath is string {
  if (!filePath) return false;
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    const stats = fs.statSync(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function ensureChromiumFromSparticuz(): Promise<string | null> {
  try {
    const executablePath = await chromium.executablePath();
    if (!executablePath) {
      return null;
    }

    // Garantizar permisos de ejecución (por si se extrae en /tmp)
    try {
      fs.chmodSync(executablePath, 0o755);
    } catch {
      // Ignorar si no se puede cambiar permisos
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
  return null;
}

export async function resolveChromiumExecutable(): Promise<string> {
  for (const getter of candidatePaths) {
    const candidate = getter();
    if (isExecutable(candidate)) {
      return candidate!;
    }
  }

  const sparticuzPath = await ensureChromiumFromSparticuz();
  if (sparticuzPath) {
    process.env.PUPPETEER_EXECUTABLE_PATH = sparticuzPath;
    process.env.CHROMIUM_PATH = sparticuzPath;
    return sparticuzPath;
  }

  throw new Error('Chromium executable not found on system or Sparticuz package');
}

export async function getChromiumLaunchConfig(extraArgs: string[] = []) {
  const executablePath = await resolveChromiumExecutable();
  const args = Array.from(new Set([...(chromium.args || []), ...extraArgs]));

  return {
    executablePath,
    args,
    headless: typeof chromium.headless !== 'undefined' ? chromium.headless : 'new',
    defaultViewport: chromium.defaultViewport,
  };
}

