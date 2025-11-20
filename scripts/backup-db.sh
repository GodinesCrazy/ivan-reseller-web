#!/bin/bash
# ✅ F7: Script de backup automático de base de datos PostgreSQL
# Uso: ./scripts/backup-db.sh [backup_directory]

set -euo pipefail

# Configuración
BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="${POSTGRES_DB:-ivan_reseller}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

# Nombre del archivo de backup
BACKUP_FILE="$BACKUP_DIR/backup_${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "🔄 Iniciando backup de base de datos..."
echo "   Base de datos: $DB_NAME"
echo "   Host: $DB_HOST:$DB_PORT"
echo "   Archivo: $BACKUP_FILE"

# Realizar backup
if PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner \
    --no-acl \
    --format=custom \
    -F c \
    | gzip > "$BACKUP_FILE"; then
    
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "✅ Backup completado exitosamente"
    echo "   Tamaño: $BACKUP_SIZE"
    echo "   Archivo: $BACKUP_FILE"
    
    # Limpiar backups antiguos (mantener últimos 30 días)
    echo "🧹 Limpiando backups antiguos (mayores a 30 días)..."
    find "$BACKUP_DIR" -name "backup_*.sql.gz" -type f -mtime +30 -delete
    echo "✅ Limpieza completada"
    
    exit 0
else
    echo "❌ Error al realizar backup"
    exit 1
fi

