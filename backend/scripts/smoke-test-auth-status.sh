#!/bin/bash
# ? FIX SIGSEGV: Smoke test para /api/auth-status
# Verifica que el endpoint no crashee ni devuelva 502

set -e

API_URL="${API_URL:-http://localhost:3000}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

if [ -z "$AUTH_TOKEN" ]; then
  echo "? ERROR: AUTH_TOKEN no está configurado"
  echo "   Ejemplo: AUTH_TOKEN=tu_token ./smoke-test-auth-status.sh"
  exit 1
fi

echo "?? Smoke Test: /api/auth-status"
echo "================================="
echo "API_URL: $API_URL"
echo "Requests: 20"
echo ""

SUCCESS_COUNT=0
FAIL_COUNT=0
ERROR_COUNT=0

for i in {1..20}; do
  echo -n "Request $i/20: "
  
  HTTP_CODE=$(curl -s -o /tmp/auth-status-response-$i.json -w "%{http_code}" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    "$API_URL/api/auth-status" || echo "000")
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo "? 200 OK"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  elif [ "$HTTP_CODE" = "401" ]; then
    echo "??  401 Unauthorized (token inválido)"
    ERROR_COUNT=$((ERROR_COUNT + 1))
  elif [ "$HTTP_CODE" = "502" ]; then
    echo "? 502 Bad Gateway (CRASH DETECTADO)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "   Response: $(cat /tmp/auth-status-response-$i.json | head -c 200)"
  elif [ "$HTTP_CODE" = "000" ]; then
    echo "? Connection failed"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    echo "??  $HTTP_CODE"
    ERROR_COUNT=$((ERROR_COUNT + 1))
  fi
  
  # Peque?o delay entre requests
  sleep 0.5
done

echo ""
echo "================================="
echo "?? Resultados:"
echo "   ? Exitosos (200): $SUCCESS_COUNT/20"
echo "   ??  Errores (401/otros): $ERROR_COUNT/20"
echo "   ? Fallos (502/000): $FAIL_COUNT/20"
echo ""

if [ $FAIL_COUNT -gt 0 ]; then
  echo "? FALLO: Se detectaron $FAIL_COUNT crashes (502 o connection failed)"
  echo "   El endpoint está crasheando - revisar logs del servidor"
  exit 1
elif [ $SUCCESS_COUNT -eq 20 ]; then
  echo "? ÉXITO: Todos los requests respondieron 200 OK"
  exit 0
else
  echo "??  ADVERTENCIA: Algunos requests fallaron pero no hay crashes"
  echo "   Revisar logs para más detalles"
  exit 0
fi
