#!/bin/sh
# Start script to ensure Chromium executable is available before running the backend
set -e

log() {
  printf "%s\n" "$1"
}

log "🔎 Determinando ruta de Chromium para Puppeteer..."

# Helper to validate and export executable path
use_chromium_path() {
  if [ -n "$1" ] && [ -x "$1" ]; then
    export CHROMIUM_PATH="$1"
    export PUPPETEER_EXECUTABLE_PATH="$1"
    log "✅ Se utilizará Chromium en: $1"
    return 0
  fi
  return 1
}

# 1. Usar ruta ya configurada
if ! use_chromium_path "$PUPPETEER_EXECUTABLE_PATH"; then
  if ! use_chromium_path "$CHROMIUM_PATH"; then
    # 2. Revisar rutas candidatas conocidas
    CANDIDATES="
/app/.chromium/chromium
$(ls /nix/store/*chromium-*/bin/chromium 2>/dev/null | head -1)
$(which chromium 2>/dev/null)
$(which chromium-browser 2>/dev/null)
"
    FOUND=""
    for candidate in $CANDIDATES; do
      if [ -n "$candidate" ] && [ -x "$candidate" ]; then
        FOUND="$candidate"
        break
      fi
    done

    if [ -n "$FOUND" ]; then
      use_chromium_path "$FOUND"
    else
      log "⚠️  No se pudo determinar una ruta de Chromium en el sistema. Puppeteer descargará su propio Chrome."
    fi
  fi
fi

# 3. Crear enlace estable si encontramos Chromium
if [ -n "$PUPPETEER_EXECUTABLE_PATH" ] && [ -x "$PUPPETEER_EXECUTABLE_PATH" ]; then
  mkdir -p /app/.chromium 2>/dev/null || true
  ln -sf "$PUPPETEER_EXECUTABLE_PATH" /app/.chromium/chromium 2>/dev/null || true
fi

log "🚀 Iniciando backend..."
exec npm start
