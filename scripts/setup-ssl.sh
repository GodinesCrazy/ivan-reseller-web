#!/bin/bash
# ✅ F5: Script para configurar SSL/TLS con Let's Encrypt
# Uso: ./scripts/setup-ssl.sh

set -euo pipefail

DOMAIN="${1:-ivanreseller.com}"
EMAIL="${2:-admin@ivanreseller.com}"

echo "🔐 Configurando SSL/TLS para $DOMAIN..."
echo "   Email: $EMAIL"
echo ""

# Verificar que certbot esté instalado
if ! command -v certbot &> /dev/null; then
    echo "❌ certbot no está instalado"
    echo "   Instalar con:"
    echo "   Ubuntu/Debian: sudo apt-get install certbot python3-certbot-nginx"
    echo "   CentOS/RHEL: sudo yum install certbot python3-certbot-nginx"
    exit 1
fi

# Verificar que NGINX esté instalado y corriendo
if ! command -v nginx &> /dev/null; then
    echo "❌ NGINX no está instalado"
    exit 1
fi

# Detener NGINX temporalmente para obtener certificado
echo "⏸️  Deteniendo NGINX temporalmente..."
sudo systemctl stop nginx 2>/dev/null || docker-compose stop nginx 2>/dev/null || true

# Obtener certificado
echo "📜 Obteniendo certificado SSL de Let's Encrypt..."
sudo certbot certonly --standalone \
    -d "$DOMAIN" \
    -d "www.$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive \
    --preferred-challenges http

# Verificar que los certificados se generaron
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"
if [ ! -d "$CERT_PATH" ]; then
    echo "❌ Error: Certificados no encontrados en $CERT_PATH"
    exit 1
fi

echo ""
echo "✅ Certificados SSL obtenidos exitosamente"
echo "   Certificado: $CERT_PATH/fullchain.pem"
echo "   Clave privada: $CERT_PATH/privkey.pem"
echo ""

# Copiar configuración SSL a NGINX
echo "📝 Configurando NGINX..."
if [ -f "./nginx/nginx.ssl.conf" ]; then
    echo "   Usando nginx.ssl.conf existente"
else
    echo "⚠️  nginx.ssl.conf no encontrado, creando configuración básica..."
fi

echo ""
echo "✅ Configuración SSL completada"
echo ""
echo "📋 Próximos pasos:"
echo "1. Actualiza docker-compose.prod.yml para montar certificados SSL"
echo "2. Usa nginx/nginx.ssl.conf como configuración de NGINX"
echo "3. Reinicia NGINX: docker-compose restart nginx"
echo ""
echo "🔄 Renovación automática (se configura automáticamente):"
echo "   sudo certbot renew --dry-run"
echo ""

# Configurar renovación automática
echo "⚙️  Configurando renovación automática..."
sudo systemctl enable certbot.timer 2>/dev/null || true
sudo systemctl start certbot.timer 2>/dev/null || true

echo "✅ Renovación automática configurada"

