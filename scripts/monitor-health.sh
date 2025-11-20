#!/bin/bash
# ✅ F6: Script de monitoreo de salud del sistema
# Uso: ./scripts/monitor-health.sh [health_endpoint]

set -euo pipefail

HEALTH_URL="${1:-http://localhost:3000/health}"
LOG_FILE="${MONITOR_LOG_FILE:-./logs/health-monitor.log}"
ALERT_EMAIL="${ALERT_EMAIL:-}"
MAX_FAILURES=3

# Crear directorio de logs si no existe
mkdir -p "$(dirname "$LOG_FILE")"

# Función para log
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Función para alertar
alert() {
    local message="$1"
    log "🚨 ALERTA: $message"
    
    if [ -n "$ALERT_EMAIL" ]; then
        echo "$message" | mail -s "⚠️ Health Check Failed - Ivan Reseller" "$ALERT_EMAIL" 2>/dev/null || true
    fi
}

# Verificar salud
log "🔍 Verificando salud del sistema..."
log "   Endpoint: $HEALTH_URL"

FAILURES=0

while true; do
    RESPONSE=$(curl -s -w "\n%{http_code}" "$HEALTH_URL" || echo -e "\n000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        log "✅ Sistema saludable (HTTP $HTTP_CODE)"
        FAILURES=0
        
        # Verificar componentes específicos
        if echo "$BODY" | grep -q '"database":.*"healthy"'; then
            log "   ✅ Base de datos: OK"
        else
            log "   ⚠️  Base de datos: Problema detectado"
        fi
        
        if echo "$BODY" | grep -q '"redis":.*"healthy"'; then
            log "   ✅ Redis: OK"
        else
            log "   ⚠️  Redis: No configurado o problema"
        fi
    else
        FAILURES=$((FAILURES + 1))
        log "❌ Sistema no responde correctamente (HTTP $HTTP_CODE)"
        log "   Fallos consecutivos: $FAILURES/$MAX_FAILURES"
        
        if [ "$FAILURES" -ge "$MAX_FAILURES" ]; then
            alert "Sistema no saludable después de $FAILURES intentos. HTTP Code: $HTTP_CODE"
            FAILURES=0  # Reset para evitar spam
        fi
    fi
    
    # Esperar antes del siguiente check (5 minutos)
    sleep 300
done

